-- =====================================================================
--  VORTEX · 13 · RED COMO EN EL PROTOTIPO
--   · Ficha de la NAP completa (splitter, quién la instaló, ferretería, fotos y esquema)
--   · Costos variables de la red, ligados al inventario
--   · Historial de la red que se llena solo (instalaciones, bajas, mantenimientos, viajes y costos)
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra tus datos. Puedes correrlo dos veces. Va después del archivo 12.
-- =====================================================================

-- 1) Ficha de la NAP ---------------------------------------------------------
alter table public.naps add column if not exists splitter text;
alter table public.naps add column if not exists instalada_por text;
alter table public.naps add column if not exists fecha_instalacion date;
alter table public.naps add column if not exists ferreteria text;
alter table public.naps add column if not exists foto_path text;
alter table public.naps add column if not exists esquema_path text;

-- 2) Costos variables: lo que se usó o se gastó en la red -----------------------
create table if not exists public.costos_variables (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  origen text not null default 'Inventario' check (origen in ('Inventario','Compra directa')),
  destino text,
  material_id uuid references public.materiales(id) on delete set null,
  concepto text not null,
  cantidad numeric(12,2) not null default 1 check (cantidad > 0),
  costo_unitario numeric(12,2) not null default 0,
  estimado_total numeric(12,2),
  real_total numeric(12,2) not null default 0 check (real_total >= 0),
  fecha date not null default current_date,
  comprobante_path text, nota text,
  descuento jsonb,
  creado_por uuid default auth.uid(), creado_en timestamptz not null default now(),
  eliminado_en timestamptz, eliminado_por uuid, eliminado_motivo text
);
create index if not exists i_costos_var_zona on public.costos_variables (zona_id, fecha);

drop trigger if exists t_heredar on public.costos_variables;
create trigger t_heredar before insert or update of zona_id on public.costos_variables for each row execute function public.heredar_proyecto('zonas', 'zona_id');

alter table public.costos_variables enable row level security;
drop policy if exists p_ver on public.costos_variables;
create policy p_ver on public.costos_variables for select to authenticated using (public.puede_ver(proyecto_id));
drop policy if exists p_esc on public.costos_variables;
create policy p_esc on public.costos_variables for all to authenticated using (public.puede_escribir(proyecto_id)) with check (public.puede_escribir(proyecto_id));
drop policy if exists p_papelera on public.costos_variables;
create policy p_papelera on public.costos_variables as restrictive for all to authenticated using (eliminado_en is null);
drop policy if exists p_proyecto_activo on public.costos_variables;
create policy p_proyecto_activo on public.costos_variables as restrictive for all to authenticated using (public.proyecto_activo(proyecto_id));
drop policy if exists p_zona_activa on public.costos_variables;
create policy p_zona_activa on public.costos_variables as restrictive for all to authenticated using (public.zona_activa(zona_id));

create or replace function public.papelera_tablas() returns text[] language sql immutable as
$$ select array['proyectos','zonas','costos_fijos','equipos_serie','fin_movimientos','fondos_movimientos',
                'historial_red','materiales','pagos_personal','presupuesto_lineas','simulaciones','inversores',
                'olts','troncales','fusiones','postes','naps',
                'gastos_empresa','costos_compartidos','fondos_empresa','compras_empresa','costos_variables']::text[] $$;

-- Registrar lo que se usó: si viene del inventario, se descuenta solo (primero del almacén de la zona, luego del central)
create or replace function public.registrar_costo_variable(p jsonb) returns uuid
language plpgsql security definer set search_path = public as
$$
declare
  z public.zonas%rowtype; m public.materiales%rowtype;
  v_origen text := coalesce(nullif(p ->> 'origen', ''), 'Inventario');
  v_cant numeric := coalesce(nullif(p ->> 'cantidad', '')::numeric, 1);
  v_est numeric := nullif(p ->> 'estimado_total', '')::numeric;
  v_dest text := nullif(btrim(coalesce(p ->> 'destino', '')), '');
  v_fecha date := coalesce(nullif(p ->> 'fecha', '')::date, current_date);
  v_real numeric; v_unit numeric := 0; v_concepto text; v_id uuid; v_desc jsonb := '[]'::jsonb;
  v_alm_z uuid; v_alm_c uuid; v_disp_z numeric := 0; v_disp_c numeric := 0; v_z numeric; v_c numeric; v_ref text;
begin
  select * into z from public.zonas where id = (p ->> 'zona_id')::uuid;
  if not found then raise exception 'No se encontró la zona'; end if;
  if not public.puede_escribir(z.proyecto_id) then raise exception 'No tienes permiso para esto'; end if;
  if v_origen not in ('Inventario', 'Compra directa') then raise exception 'Origen no válido'; end if;
  if v_cant <= 0 then raise exception 'La cantidad debe ser mayor a 0'; end if;
  v_ref := 'Costo variable: ' || coalesce(v_dest, 'red');

  if v_origen = 'Inventario' then
    select * into m from public.materiales where id = (p ->> 'material_id')::uuid and proyecto_id = z.proyecto_id;
    if not found then raise exception 'Elige un artículo del inventario'; end if;
    select id into v_alm_z from public.almacenes where proyecto_id = z.proyecto_id and zona_id = z.id and tipo = 'zona' limit 1;
    select id into v_alm_c from public.almacenes where proyecto_id = z.proyecto_id and tipo = 'central' limit 1;
    v_disp_z := coalesce((select cantidad from public.stock where material_id = m.id and almacen_id = v_alm_z), 0);
    v_disp_c := coalesce((select cantidad from public.stock where material_id = m.id and almacen_id = v_alm_c), 0);
    if v_disp_z + v_disp_c < v_cant then raise exception 'No hay suficiente en el inventario: hay % y pides %', v_disp_z + v_disp_c, v_cant; end if;
    v_z := least(v_cant, v_disp_z); v_c := v_cant - v_z;
    if v_z > 0 then
      perform public.registrar_movimiento('SALIDA', m.id, v_alm_z, null, v_z, v_ref, null);
      v_desc := v_desc || jsonb_build_array(jsonb_build_object('almacen_id', v_alm_z, 'cantidad', v_z));
    end if;
    if v_c > 0 then
      perform public.registrar_movimiento('SALIDA', m.id, v_alm_c, null, v_c, v_ref, null);
      v_desc := v_desc || jsonb_build_array(jsonb_build_object('almacen_id', v_alm_c, 'cantidad', v_c));
    end if;
    v_unit := m.costo; v_real := round(v_cant * m.costo, 2); v_concepto := m.nombre;
  else
    v_real := nullif(p ->> 'real_total', '')::numeric;
    if v_real is null or v_real <= 0 then raise exception 'Escribe el costo real de la compra'; end if;
    v_concepto := btrim(coalesce(p ->> 'concepto', ''));
    if v_concepto = '' then raise exception 'Escribe qué se compró'; end if;
    v_unit := round(v_real / v_cant, 2);
  end if;

  insert into public.costos_variables(proyecto_id, zona_id, origen, destino, material_id, concepto, cantidad, costo_unitario, estimado_total, real_total, fecha, comprobante_path, nota, descuento)
  values (z.proyecto_id, z.id, v_origen, v_dest, case when v_origen = 'Inventario' then m.id end, v_concepto, v_cant, v_unit, coalesce(v_est, v_real), v_real, v_fecha,
          nullif(p ->> 'comprobante_path', ''), nullif(p ->> 'nota', ''), case when v_origen = 'Inventario' then v_desc end)
  returning id into v_id;
  perform public.auditar(z.proyecto_id, 'COSTO_VARIABLE', 'costos_variables', v_id, jsonb_build_object('concepto', v_concepto, 'real', v_real));
  return v_id;
end $$;

-- Quitar un registro: si salió del inventario, el material vuelve a su almacén
create or replace function public.quitar_costo_variable(p_id uuid) returns void
language plpgsql security definer set search_path = public as
$$
declare c public.costos_variables%rowtype; x jsonb;
begin
  select * into c from public.costos_variables where id = p_id and eliminado_en is null;
  if not found then raise exception 'No se encontró el registro'; end if;
  if not public.puede_escribir(c.proyecto_id) then raise exception 'No tienes permiso para esto'; end if;
  if c.origen = 'Inventario' and c.descuento is not null and c.material_id is not null then
    for x in select * from jsonb_array_elements(c.descuento) loop
      perform public.registrar_movimiento('DEVOLUCION', c.material_id, null, (x ->> 'almacen_id')::uuid, (x ->> 'cantidad')::numeric, 'Devolución: costo variable', null);
    end loop;
  end if;
  update public.costos_variables set eliminado_en = now(), eliminado_por = auth.uid(),
         eliminado_motivo = case when c.origen = 'Inventario' then 'Devuelto al inventario' else null end where id = p_id;
  perform public.auditar(c.proyecto_id, 'QUITAR_COSTO_VARIABLE', 'costos_variables', p_id, null);
end $$;

-- Restaurar desde la papelera (un costo que ya devolvió su material no se puede restaurar)
create or replace function public.restaurar_de_papelera(p_tabla text, p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as
$$
declare
  v_tabla text := lower(coalesce(p_tabla, '')); v_id uuid; v_row jsonb; v_proy uuid; v_zona uuid; v_n int; v_total int := 0;
  v_nom text;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede restaurar'; end if;
  if not (v_tabla = any (public.papelera_tablas())) then raise exception 'Esto no está en la papelera'; end if;

  foreach v_id in array coalesce(p_ids, array[]::uuid[]) loop
    execute format('select to_jsonb(t) from public.%I t where id = $1 and eliminado_en is not null', v_tabla) into v_row using v_id;
    if v_row is null then continue; end if;
    if v_tabla = 'costos_variables' and v_row ->> 'origen' = 'Inventario' then
      raise exception 'Este registro ya devolvió su material al inventario. Regístralo de nuevo desde Costos variables.';
    end if;
    v_proy := case when v_tabla = 'proyectos' then v_id else (v_row ->> 'proyecto_id')::uuid end;
    v_zona := case when v_tabla = 'zonas' then null else (v_row ->> 'zona_id')::uuid end;

    if v_tabla <> 'proyectos' and exists (select 1 from public.proyectos where id = v_proy and eliminado_en is not null) then
      if v_tabla = 'zonas' and coalesce((v_row ->> 'con_socios')::boolean, false) then
        update public.proyectos set eliminado_en = null, eliminado_por = null, eliminado_motivo = null where id = v_proy;
      else
        select nombre into v_nom from public.proyectos where id = v_proy;
        raise exception 'Primero restaura el espacio "%" (está en la papelera).', v_nom;
      end if;
    end if;
    if v_tabla <> 'zonas' and v_tabla <> 'proyectos' and v_zona is not null and exists (select 1 from public.zonas where id = v_zona and eliminado_en is not null) then
      select nombre into v_nom from public.zonas where id = v_zona;
      raise exception 'Primero restaura la zona "%" (está en la papelera).', v_nom;
    end if;

    begin
      execute format('update public.%I set eliminado_en = null, eliminado_por = null, eliminado_motivo = null where id = $1', v_tabla) using v_id;
    exception when unique_violation then
      raise exception 'No se puede restaurar: ya existe otro registro con el mismo nombre. Cámbiale el nombre al nuevo o restaura este después.';
    end;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    perform public.auditar(v_proy, 'RESTAURAR', v_tabla, v_id, null);
  end loop;
  return v_total;
end $$;

-- 3) Historial de la red: se llena solo ----------------------------------------------------
create or replace view public.v_historial_red with (security_invoker = true) as
select h.id, h.proyecto_id, h.zona_id, h.fecha, h.tipo::text as tipo, h.descripcion::text as detalle, h.monto::numeric as monto,
       (case when h.tipo in ('Troncal nueva','NAP nueva','OLT registrada','Ampliación de red') then 'Automático' else 'Manual' end)::text as origen,
       'historial'::text as fuente
from public.historial_red h
union all
select i.id, i.proyecto_id, i.zona_id, i.fecha, 'Instalación'::text,
       ('Cliente ' || coalesce(c.nombre, '(sin nombre)') || coalesce(' · técnico ' || nullif(i.tecnico, ''), ''))::text,
       (coalesce(i.costo_materiales, 0) + coalesce(i.mano_obra, 0))::numeric, 'Automático'::text, 'instalacion'::text
from public.instalaciones i left join public.clientes c on c.id = i.cliente_id
union all
select b.id, b.proyecto_id, c.zona_id, b.fecha, 'Baja'::text,
       ('Cliente ' || c.nombre || coalesce(' · ' || nullif(b.motivo, ''), ''))::text, 0::numeric, 'Automático'::text, 'baja'::text
from public.bajas b join public.clientes c on c.id = b.cliente_id
union all
select m.id, m.proyecto_id, m.zona_id, coalesce(m.fecha_cierre, m.fecha_programada, m.creado_en::date), 'Mantenimiento'::text,
       (coalesce(m.referencia || ': ', '') || coalesce(nullif(m.solucion, ''), m.problema, m.objeto))::text, coalesce(m.costo, 0)::numeric, 'Automático'::text, 'mantenimiento'::text
from public.mantenimientos m where m.estado = 'COMPLETADA'
union all
select v.id, v.proyecto_id, v.zona_id, v.fecha_fin, 'Viaje'::text,
       ('Viaje · ' || coalesce(nullif(v.personal, ''), v.tipo))::text,
       (v.gasolina + v.movilidad + ((v.fecha_fin - v.fecha_inicio + 1) * v.personas * (v.pago_dia + v.viaticos_dia))
          + coalesce((select sum(d.gasto) from public.viaje_dias d where d.viaje_id = v.id), 0))::numeric, 'Automático'::text, 'viaje'::text
from public.viajes v where v.estado = 'FINALIZADO'
union all
select cv.id, cv.proyecto_id, cv.zona_id, cv.fecha, 'Costo de red'::text,
       (cv.concepto || coalesce(' → ' || cv.destino, ''))::text, cv.real_total::numeric, 'Automático'::text, 'costo_variable'::text
from public.costos_variables cv;

-- 4) Permisos ----------------------------------------------------------------------------------
revoke all on public.costos_variables, public.v_historial_red from anon;
grant select, insert, update on public.costos_variables to authenticated;
revoke delete on public.costos_variables from authenticated;
grant select on public.v_historial_red to authenticated;

revoke all on function public.registrar_costo_variable(jsonb) from public, anon;
revoke all on function public.quitar_costo_variable(uuid) from public, anon;
revoke all on function public.restaurar_de_papelera(text, uuid[]) from public, anon;
grant execute on function public.registrar_costo_variable(jsonb) to authenticated;
grant execute on function public.quitar_costo_variable(uuid) to authenticated;
grant execute on function public.restaurar_de_papelera(text, uuid[]) to authenticated;
