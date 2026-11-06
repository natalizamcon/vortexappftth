-- =====================================================================
--  VORTEX · 29 · FONDO DE INVERSIÓN (el dinero de los inversores) Y DE DÓNDE SALE CADA GASTO
--   · Cada inversor suma al fondo de su zona (o al fondo general del proyecto si es un inversor general).
--   · Al registrar un gasto o una compra se elige de dónde sale el dinero: fondo de la zona, fondo general u otra fuente.
--   · Lo que sale del fondo se descuenta solo, y el fondo nunca queda en negativo.
--   · El saldo se calcula siempre desde los inversores y los gastos: si corriges o quitas algo, el saldo se corrige solo.
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra tus datos. Puedes correrlo dos veces. Va después del archivo 28 (y necesita haber corrido el 23 y el 24).
-- =====================================================================

-- 1) Inversores generales (sin zona) --------------------------------------------------------------------------
alter table public.inversores alter column zona_id drop not null;
drop trigger if exists t_heredar on public.inversores;
create or replace function public.inversores_heredar() returns trigger language plpgsql security definer set search_path = public as
$$
declare pid uuid;
begin
  if new.zona_id is not null then
    select proyecto_id into pid from public.zonas where id = new.zona_id;
    if pid is null then raise exception 'No se encontró la zona del inversor'; end if;
    new.proyecto_id := pid;
  elsif new.proyecto_id is null then
    raise exception 'Elige el proyecto del inversor general';
  end if;
  return new;
end $$;
create trigger t_heredar before insert or update of zona_id, proyecto_id on public.inversores for each row execute function public.inversores_heredar();

-- 2) De dónde sale el dinero de cada gasto o inversión -----------------------------------------------------------
alter table public.fin_movimientos add column if not exists fuente text;
alter table public.fin_movimientos add column if not exists fuente_detalle text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fin_movimientos_fuente_chk') then
    alter table public.fin_movimientos add constraint fin_movimientos_fuente_chk check (fuente is null or fuente in ('Fondo de la zona', 'Fondo general', 'Otra fuente'));
  end if;
end $$;

-- 3) Saldo del fondo: lo recibido de los inversores menos lo gastado del fondo -------------------------------------
create or replace function public.fondo_saldo(p_proyecto uuid, p_zona uuid) returns numeric
language plpgsql security definer set search_path = public as
$$
declare e numeric; g numeric;
begin
  if p_zona is not null then
    select coalesce(sum(monto), 0) into e from public.inversores where zona_id = p_zona and eliminado_en is null;
    select coalesce(sum(monto), 0) into g from public.fin_movimientos where fuente = 'Fondo de la zona' and zona_id = p_zona and eliminado_en is null;
  else
    select coalesce(sum(monto), 0) into e from public.inversores where proyecto_id = p_proyecto and zona_id is null and eliminado_en is null;
    select coalesce(sum(monto), 0) into g from public.fin_movimientos where fuente = 'Fondo general' and proyecto_id = p_proyecto and eliminado_en is null;
  end if;
  return round(e - g, 2);
end $$;

create or replace view public.v_fondo_inversion with (security_invoker = true) as
with e as (select proyecto_id, zona_id, sum(monto) as recibido from public.inversores where eliminado_en is null group by proyecto_id, zona_id),
     g as (select proyecto_id, case when fuente = 'Fondo de la zona' then zona_id else null end as zona_id, sum(monto) as gastado
           from public.fin_movimientos where fuente in ('Fondo de la zona', 'Fondo general') and eliminado_en is null group by 1, 2)
select coalesce(e.proyecto_id, g.proyecto_id) as proyecto_id, coalesce(e.zona_id, g.zona_id) as zona_id, z.nombre as zona_nombre,
       coalesce(e.recibido, 0)::numeric(14,2) as recibido, coalesce(g.gastado, 0)::numeric(14,2) as gastado,
       (coalesce(e.recibido, 0) - coalesce(g.gastado, 0))::numeric(14,2) as disponible
from e full join g on g.proyecto_id = e.proyecto_id and g.zona_id is not distinct from e.zona_id
left join public.zonas z on z.id = coalesce(e.zona_id, g.zona_id);

-- 4) Protecciones: el fondo no se gasta de más y no queda en negativo --------------------------------------------------
create or replace function public.fin_validar_fuente() returns trigger language plpgsql security definer set search_path = public as
$$
declare v numeric;
begin
  if new.fuente is null or new.fuente = 'Otra fuente' then return new; end if;
  if new.tipo = 'INGRESO' then raise exception 'Un ingreso no puede salir del fondo de inversión: deja la fuente vacía.'; end if;
  if new.fuente = 'Fondo de la zona' and new.zona_id is null then raise exception 'Para gastar del fondo de una zona hay que elegir la zona.'; end if;
  if new.eliminado_en is not null then return new; end if;
  v := public.fondo_saldo(new.proyecto_id, case when new.fuente = 'Fondo de la zona' then new.zona_id else null end);
  if tg_op = 'UPDATE' and old.eliminado_en is null and old.fuente is not distinct from new.fuente and old.proyecto_id = new.proyecto_id
     and (new.fuente = 'Fondo general' or old.zona_id is not distinct from new.zona_id) then
    v := v + old.monto;
  end if;
  if new.monto > v + 0.009 then
    raise exception 'El fondo de inversión no alcanza: disponible Bs %, este gasto es de Bs %.', to_char(v, 'FM999G999G990D00'), to_char(new.monto, 'FM999G999G990D00');
  end if;
  return new;
end $$;
drop trigger if exists t_fin_fuente on public.fin_movimientos;
create trigger t_fin_fuente before insert or update on public.fin_movimientos for each row execute function public.fin_validar_fuente();

create or replace function public.inversores_validar_fondo() returns trigger language plpgsql security definer set search_path = public as
$$
declare v numeric;
begin
  v := public.fondo_saldo(old.proyecto_id, old.zona_id);
  if v < -0.009 then raise exception 'No se puede cambiar o quitar este inversor: el fondo de inversión ya gastó Bs % más de lo que quedaría.', to_char(-v, 'FM999G999G990D00'); end if;
  if new.zona_id is distinct from old.zona_id or new.proyecto_id is distinct from old.proyecto_id then
    v := public.fondo_saldo(new.proyecto_id, new.zona_id);
    if v < -0.009 then raise exception 'No se puede mover este inversor: el fondo de inversión de destino quedaría en negativo.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists t_inversor_fondo on public.inversores;
create trigger t_inversor_fondo after update of monto, zona_id, proyecto_id, eliminado_en on public.inversores for each row execute function public.inversores_validar_fondo();

-- 5) Al crear una zona, sus inversores entran con moneda, tipo de cambio y propósito ------------------------------------
create or replace function public.crear_zona_completa(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  v_nombre text := btrim(coalesce(p ->> 'nombre', ''));
  v_con_socios boolean := coalesce((p ->> 'con_socios')::boolean, false);
  v_proy uuid; v_zona uuid;
  v_inicio date := coalesce(nullif(p ->> 'fecha_inicio', '')::date, current_date);
  v_meses int := nullif(p ->> 'meta_meses', '')::int;
  x jsonb; s text; v_pp uuid := nullif(p ->> 'proyecto_id', '')::uuid;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede crear zonas'; end if;
  if v_nombre = '' then raise exception 'Falta el nombre de la zona'; end if;

  -- La zona se crea SIEMPRE dentro de un proyecto que ya existe (el que elijas); nunca se crea un proyecto nuevo.
  if v_pp is not null then
    select id into v_proy from public.proyectos where id = v_pp and eliminado_en is null;
    if v_proy is null then raise exception 'El proyecto elegido no existe o está en la papelera'; end if;
  else
    select id into v_proy from public.proyectos where nombre = 'Vortex' and eliminado_en is null order by creado_en limit 1;
    if v_proy is null then insert into public.proyectos(nombre) values ('Vortex') returning id into v_proy; end if;
  end if;
  if exists (select 1 from public.zonas where proyecto_id = v_proy and lower(nombre) = lower(v_nombre) and eliminado_en is not null) then
    raise exception 'Ya hay una zona llamada "%" en la Papelera. Restáurala desde el menú Papelera o usa otro nombre.', v_nombre;
  end if;

  begin
    insert into public.zonas(proyecto_id, nombre, ubicacion, fecha_inicio, dia_corte, meta_clientes, meta_meses, fecha_meta, con_socios)
    values (v_proy, v_nombre, nullif(btrim(coalesce(p ->> 'ubicacion', '')), ''), v_inicio,
            coalesce(nullif(p ->> 'dia_corte', '')::int, 5),
            nullif(p ->> 'meta_clientes', '')::int, v_meses,
            case when v_meses is not null then (v_inicio + make_interval(months => v_meses))::date end,
            v_con_socios)
    returning id into v_zona;
  exception when unique_violation then
    raise exception 'Ya existe una zona con el nombre "%"', v_nombre;
  end;

  if jsonb_typeof(p -> 'planes') = 'array' and jsonb_array_length(p -> 'planes') > 0 then
    delete from public.planes where zona_id = v_zona;
    for x in select * from jsonb_array_elements(p -> 'planes') loop
      if btrim(coalesce(x ->> 'nombre', '')) <> '' then
        insert into public.planes(proyecto_id, zona_id, nombre, mbps, precio)
        values (v_proy, v_zona, btrim(x ->> 'nombre'), coalesce(nullif(x ->> 'mbps', '')::int, 0), coalesce(nullif(x ->> 'precio', '')::numeric, 0));
      end if;
    end loop;
  end if;

  if jsonb_typeof(p -> 'costos') = 'array' then
    for x in select * from jsonb_array_elements(p -> 'costos') loop
      if btrim(coalesce(x ->> 'concepto', '')) <> '' then
        insert into public.costos_fijos(proyecto_id, zona_id, concepto, cantidad, monto_unitario)
        values (v_proy, v_zona, btrim(x ->> 'concepto'), coalesce(nullif(x ->> 'cantidad', '')::numeric, 1), coalesce(nullif(x ->> 'monto_unitario', '')::numeric, 0));
      end if;
    end loop;
  end if;

  if jsonb_typeof(p -> 'inversores') = 'array' then
    for x in select * from jsonb_array_elements(p -> 'inversores') loop
      if btrim(coalesce(x ->> 'nombre', '')) <> '' and coalesce(nullif(x ->> 'monto', '')::numeric, 0) > 0 then
        insert into public.inversores(proyecto_id, zona_id, nombre, monto, interes, periodo_interes, plazo_meses, fecha_inicio, moneda, monto_original, tipo_cambio, proposito)
        values (v_proy, v_zona, btrim(x ->> 'nombre'), (x ->> 'monto')::numeric, coalesce(nullif(x ->> 'interes', '')::numeric, 0),
                case when x ->> 'periodo_interes' = 'anual' then 'anual' else 'mensual' end,
                coalesce(nullif(x ->> 'plazo_meses', '')::int, 12), v_inicio,
                case when x ->> 'moneda' = 'USD' then 'USD' else 'BOB' end, coalesce(nullif(x ->> 'monto_original', '')::numeric, (x ->> 'monto')::numeric),
                case when x ->> 'moneda' = 'USD' then nullif(x ->> 'tipo_cambio', '')::numeric else null end, nullif(btrim(coalesce(x ->> 'proposito', '')), ''));
      end if;
    end loop;
  end if;

  if jsonb_typeof(p -> 'nap') = 'object' and btrim(coalesce(p -> 'nap' ->> 'codigo', '')) <> '' then
    insert into public.naps(proyecto_id, zona_id, codigo, tipo, puertos)
    values (v_proy, v_zona, btrim(p -> 'nap' ->> 'codigo'), 'Principal', coalesce(nullif(p -> 'nap' ->> 'puertos', '')::int, 16));
  end if;

  if v_con_socios and jsonb_typeof(p -> 'socios') = 'array' then
    for s in select jsonb_array_elements_text(p -> 'socios') loop
      insert into public.proyecto_usuarios(proyecto_id, user_id)
      select v_proy, f.id from public.profiles f where f.id = s::uuid and f.rol = 'socio' on conflict do nothing;
    end loop;
  end if;

  perform public.auditar(v_proy, 'CREAR', 'zonas', v_zona, jsonb_build_object('nombre', v_nombre, 'con_socios', v_con_socios));
  return jsonb_build_object('zona_id', v_zona, 'proyecto_id', v_proy);
end $$;
revoke all on function public.crear_zona_completa(jsonb) from public, anon;
grant execute on function public.crear_zona_completa(jsonb) to authenticated;

-- 6) Permisos -----------------------------------------------------------------------------------------------------------
revoke all on public.v_fondo_inversion from anon;
grant select on public.v_fondo_inversion to authenticated;
revoke all on function public.fondo_saldo(uuid, uuid) from public, anon;
grant execute on function public.fondo_saldo(uuid, uuid) to authenticated;
