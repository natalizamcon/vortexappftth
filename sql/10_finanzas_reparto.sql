-- =====================================================================
--  VORTEX · 10 · FINANZAS: REPARTO DE UTILIDADES, COSTOS COMPARTIDOS,
--                GASTOS DE LA EMPRESA Y FONDOS
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra tus datos. Puedes correrlo dos veces.
--
--  Reglas que implementa:
--   · Utilidad de una zona = cobrado − gastos operativos − pagos a inversores
--   · Primero se pagan los socios (porcentaje editable por socio y por zona);
--     lo que queda para el dueño se divide en Caja chica, Ahorro, Inversión
--     y Retiro del dueño (porcentajes editables por zona).
--   · Costos compartidos entre zonas: el método se elige en cada costo.
--   · Gastos de la empresa: aparte de las zonas. Solo los ve el administrador.
--   · Nada se borra: los repartos se anulan y lo demás va a la papelera.
-- =====================================================================

-- 1) Porcentajes por zona -------------------------------------------------
create table if not exists public.zona_socios (
  id uuid primary key default gen_random_uuid(),
  zona_id uuid not null references public.zonas(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  porcentaje numeric(6,3) not null check (porcentaje >= 0 and porcentaje <= 100),
  creado_en timestamptz not null default now(),
  unique (zona_id, user_id)
);
create table if not exists public.zona_fondos_pct (
  zona_id uuid not null references public.zonas(id) on delete cascade,
  fondo text not null check (fondo in ('Caja chica','Ahorro','Inversión','Retiro del dueño')),
  porcentaje numeric(6,3) not null default 0 check (porcentaje >= 0 and porcentaje <= 100),
  primary key (zona_id, fondo)
);

create or replace function public.chk_porcentajes_zona() returns trigger language plpgsql as
$$
declare v_total numeric;
begin
  if tg_table_name = 'zona_socios' then
    select coalesce(sum(porcentaje), 0) into v_total from public.zona_socios where zona_id = new.zona_id;
    if v_total > 100.0001 then raise exception 'Los porcentajes de los socios de la zona no pueden sumar más de 100%%'; end if;
  else
    select coalesce(sum(porcentaje), 0) into v_total from public.zona_fondos_pct where zona_id = new.zona_id;
    if v_total > 100.0001 then raise exception 'Los porcentajes de los fondos no pueden sumar más de 100%%'; end if;
  end if;
  return null;
end $$;
drop trigger if exists t_chk_pct on public.zona_socios;
create constraint trigger t_chk_pct after insert or update on public.zona_socios for each row execute function public.chk_porcentajes_zona();
drop trigger if exists t_chk_pct on public.zona_fondos_pct;
create constraint trigger t_chk_pct after insert or update on public.zona_fondos_pct for each row execute function public.chk_porcentajes_zona();

-- 2) Costos compartidos entre zonas -----------------------------------------
create table if not exists public.costos_compartidos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null, categoria text,
  monto_mensual numeric(12,2) not null default 0 check (monto_mensual >= 0),
  metodo text not null default 'iguales' check (metodo in ('iguales','clientes','porcentaje')),
  activo boolean not null default true,
  desde date not null default current_date, hasta date,
  nota text,
  creado_en timestamptz not null default now()
);
create table if not exists public.costos_compartidos_zonas (
  costo_id uuid not null references public.costos_compartidos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  incluida boolean not null default true,   -- para sacar una zona del costo se desmarca (no se borra)
  porcentaje numeric(6,3) not null default 0 check (porcentaje >= 0 and porcentaje <= 100),
  primary key (costo_id, zona_id)
);
-- monto de un mes puntual cuando es distinto del mensual (por ejemplo, un mes que no se pagó = 0)
create table if not exists public.costos_compartidos_meses (
  costo_id uuid not null references public.costos_compartidos(id) on delete cascade,
  periodo date not null,
  monto numeric(12,2) not null check (monto >= 0),
  activo boolean not null default true,     -- para quitar el ajuste de un mes se desmarca (no se borra)
  nota text,
  primary key (costo_id, periodo)
);

-- 3) Gastos de la empresa y fondos (todo a nivel empresa: solo administrador) ---------
create table if not exists public.gastos_empresa (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  categoria text not null default 'Otros', concepto text not null,
  monto numeric(12,2) not null check (monto > 0),
  pagado_desde text not null default 'Fuera de los fondos' check (pagado_desde in ('Caja chica','Ahorro','Inversión','Retiro del dueño','Fuera de los fondos')),
  comprobante_path text, nota text,
  creado_por uuid default auth.uid(), creado_en timestamptz not null default now()
);
create table if not exists public.fondos_empresa (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  fondo text not null check (fondo in ('Caja chica','Ahorro','Inversión','Retiro del dueño')),
  tipo text not null check (tipo in ('Aporte','Gasto')),
  monto numeric(12,2) not null check (monto >= 0),
  nota text,
  origen text not null default 'manual' check (origen in ('manual','reparto','gasto_empresa')),
  liquidacion_id uuid, gasto_id uuid references public.gastos_empresa(id) on delete set null,
  anulado boolean not null default false,
  migrado_de uuid unique,
  creado_por uuid default auth.uid(), creado_en timestamptz not null default now()
);

-- 4) Repartos (liquidaciones) --------------------------------------------------
create table if not exists public.liquidaciones (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  periodo date not null,
  fecha_reparto date not null default current_date,
  cobrado numeric(12,2) not null default 0,
  otros_ingresos numeric(12,2) not null default 0,
  gastos_operativos numeric(12,2) not null default 0,
  costos_compartidos numeric(12,2) not null default 0,
  pagos_inversores numeric(12,2) not null default 0,
  utilidad numeric(12,2) not null default 0,
  monto_repartido numeric(12,2) not null default 0 check (monto_repartido >= 0),
  total_socios numeric(12,2) not null default 0,
  parte_dueno numeric(12,2) not null default 0,
  detalle jsonb not null default '{}'::jsonb,
  estado text not null default 'CONFIRMADA' check (estado in ('CONFIRMADA','ANULADA')),
  motivo_anulacion text, notas text,
  creado_por uuid default auth.uid(), creado_en timestamptz not null default now()
);
create unique index if not exists u_liquidacion_zona_mes on public.liquidaciones (zona_id, periodo) where estado = 'CONFIRMADA';
create table if not exists public.liquidacion_socios (
  id uuid primary key default gen_random_uuid(),
  liquidacion_id uuid not null references public.liquidaciones(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  nombre text not null,
  porcentaje numeric(6,3) not null check (porcentaje >= 0 and porcentaje <= 100),
  monto numeric(12,2) not null check (monto >= 0),
  pagado_en date, comprobante_path text, nota text
);
create table if not exists public.liquidacion_fondos (
  id uuid primary key default gen_random_uuid(),
  liquidacion_id uuid not null references public.liquidaciones(id) on delete cascade,
  fondo text not null, porcentaje numeric(6,3) not null, monto numeric(12,2) not null check (monto >= 0)
);
create index if not exists i_liq_socios on public.liquidacion_socios (liquidacion_id);
create index if not exists i_liq_socio_user on public.liquidacion_socios (user_id);
create index if not exists i_liq_fondos on public.liquidacion_fondos (liquidacion_id);
create index if not exists i_fondos_liq on public.fondos_empresa (liquidacion_id);

drop trigger if exists t_heredar on public.liquidaciones;
create trigger t_heredar before insert or update of zona_id on public.liquidaciones for each row execute function public.heredar_proyecto('zonas', 'zona_id');

-- 5) Papelera: los gastos de la empresa, los costos compartidos y los movimientos manuales de fondos
do $$
declare t text;
begin
  foreach t in array array['gastos_empresa','costos_compartidos','fondos_empresa'] loop
    execute format('alter table public.%I add column if not exists eliminado_en timestamptz', t);
    execute format('alter table public.%I add column if not exists eliminado_por uuid', t);
    execute format('alter table public.%I add column if not exists eliminado_motivo text', t);
  end loop;
end $$;

create or replace function public.papelera_tablas() returns text[] language sql immutable as
$$ select array['proyectos','zonas','costos_fijos','equipos_serie','fin_movimientos','fondos_movimientos',
                'historial_red','materiales','pagos_personal','presupuesto_lineas','simulaciones','inversores',
                'olts','troncales','fusiones','postes',
                'gastos_empresa','costos_compartidos','fondos_empresa']::text[] $$;

create or replace function public.papelera_tablas_empresa() returns text[] language sql immutable as
$$ select array['gastos_empresa','costos_compartidos','fondos_empresa']::text[] $$;

-- Mandar a la papelera (ahora también registros de la empresa, que no pertenecen a ningún proyecto)
create or replace function public.enviar_a_papelera(p_tabla text, p_ids uuid[], p_motivo text default null) returns int
language plpgsql security definer set search_path = public as
$$
declare
  v_tabla text := lower(coalesce(p_tabla, '')); v_id uuid; v_proy uuid; v_n int; v_total int := 0;
  v_fin boolean; v_emp boolean; v_con_socios boolean; v_existe boolean; v_origen text;
begin
  if not (v_tabla = any (public.papelera_tablas())) then raise exception 'Esto no se puede enviar a la papelera'; end if;
  v_fin := v_tabla in ('fin_movimientos','fondos_movimientos','pagos_personal','inversores','presupuesto_lineas','simulaciones');
  v_emp := v_tabla = any (public.papelera_tablas_empresa());

  foreach v_id in array coalesce(p_ids, array[]::uuid[]) loop
    v_proy := null;
    if v_tabla = 'proyectos' then v_proy := v_id;
    elsif v_emp then
      execute format('select exists (select 1 from public.%I where id = $1 and eliminado_en is null)', v_tabla) into v_existe using v_id;
      if not v_existe then continue; end if;
    else
      execute format('select proyecto_id from public.%I where id = $1 and eliminado_en is null', v_tabla) into v_proy using v_id;
      if v_proy is null then continue; end if;
    end if;

    if v_tabla in ('proyectos', 'zonas') or v_emp then
      if not public.es_admin() then raise exception 'Solo el administrador puede hacer esto'; end if;
    elsif v_fin then
      if not public.puede_finanzas(v_proy) then raise exception 'No tienes permiso para esto'; end if;
    else
      if not public.puede_escribir(v_proy) then raise exception 'No tienes permiso para esto'; end if;
    end if;

    if v_tabla = 'fondos_empresa' then
      select origen into v_origen from public.fondos_empresa where id = v_id;
      if v_origen <> 'manual' then raise exception 'Este movimiento viene de un reparto o de un gasto de la empresa. Anula el reparto o manda el gasto a la papelera.'; end if;
    end if;

    execute format('update public.%I set eliminado_en = now(), eliminado_por = auth.uid(), eliminado_motivo = $2 where id = $1 and eliminado_en is null', v_tabla) using v_id, p_motivo;
    get diagnostics v_n = row_count;
    if v_n = 0 then continue; end if;
    v_total := v_total + v_n;

    if v_tabla = 'zonas' then
      select con_socios into v_con_socios from public.zonas where id = v_id;
      if v_con_socios and not exists (select 1 from public.zonas where proyecto_id = v_proy and eliminado_en is null) then
        update public.proyectos set eliminado_en = now(), eliminado_por = auth.uid(), eliminado_motivo = 'Se envió su única zona a la papelera' where id = v_proy and eliminado_en is null;
      end if;
    end if;
    perform public.auditar(v_proy, 'PAPELERA', v_tabla, v_id, jsonb_build_object('motivo', p_motivo));
  end loop;
  return v_total;
end $$;

create or replace function public.listar_papelera() returns table (
  tabla text, id uuid, proyecto_id uuid, eliminado_en timestamptz, eliminado_por text, motivo text, zona text, espacio text, datos jsonb)
language plpgsql security definer set search_path = public as
$$
declare v_t text; v_proy text;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede ver la papelera'; end if;
  foreach v_t in array public.papelera_tablas() loop
    v_proy := case when v_t = 'proyectos' then 't.id' when v_t = any (public.papelera_tablas_empresa()) then 'null::uuid' else 't.proyecto_id' end;
    return query execute format(
      'select %L::text, t.id, %s, t.eliminado_en,
              (select coalesce(f.nombre, f.email) from public.profiles f where f.id = t.eliminado_por),
              t.eliminado_motivo,
              (select z.nombre from public.zonas z where z.id = (to_jsonb(t) ->> ''zona_id'')::uuid),
              (select p.nombre from public.proyectos p where p.id = %s),
              to_jsonb(t)
         from public.%I t where t.eliminado_en is not null',
      v_t, v_proy, v_proy, v_t);
  end loop;
end $$;

-- 6) Permisos -----------------------------------------------------------------------
do $$
declare t text;
begin
  -- datos de la empresa: solo administrador
  foreach t in array array['zona_socios','zona_fondos_pct','costos_compartidos','costos_compartidos_zonas','costos_compartidos_meses','gastos_empresa','fondos_empresa','liquidacion_fondos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists p_admin on public.%I', t);
    execute format('create policy p_admin on public.%I for all to authenticated using (public.es_admin()) with check (public.es_admin())', t);
  end loop;
end $$;

-- cada socio puede ver sus propios porcentajes
drop policy if exists p_propio on public.zona_socios;
create policy p_propio on public.zona_socios for select to authenticated using (user_id = auth.uid());

-- repartos: el administrador ve todos; el socio ve los de las zonas de su espacio y solo SU parte
alter table public.liquidaciones enable row level security;
drop policy if exists p_ver on public.liquidaciones;
create policy p_ver on public.liquidaciones for select to authenticated using (public.es_admin() or public.puede_rol(proyecto_id, array['socio']));
alter table public.liquidacion_socios enable row level security;
drop policy if exists p_ver on public.liquidacion_socios;
create policy p_ver on public.liquidacion_socios for select to authenticated using (public.es_admin() or user_id = auth.uid());

-- lo que está en la papelera (o en una zona o espacio en la papelera) se oculta
do $$
declare t text;
begin
  foreach t in array public.papelera_tablas() loop
    execute format('drop policy if exists p_papelera on public.%I', t);
    execute format('create policy p_papelera on public.%I as restrictive for all to authenticated using (eliminado_en is null)', t);
  end loop;
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'proyecto_id' and tb.table_type = 'BASE TABLE'
  loop
    execute format('drop policy if exists p_proyecto_activo on public.%I', t);
    execute format('create policy p_proyecto_activo on public.%I as restrictive for all to authenticated using (public.proyecto_activo(proyecto_id))', t);
  end loop;
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'zona_id' and tb.table_type = 'BASE TABLE'
  loop
    execute format('drop policy if exists p_zona_activa on public.%I', t);
    execute format('create policy p_zona_activa on public.%I as restrictive for all to authenticated using (public.zona_activa(zona_id))', t);
  end loop;
end $$;

drop policy if exists p_costo_activo on public.costos_compartidos_zonas;
create policy p_costo_activo on public.costos_compartidos_zonas as restrictive for all to authenticated using (exists (select 1 from public.costos_compartidos c where c.id = costos_compartidos_zonas.costo_id));
drop policy if exists p_costo_activo on public.costos_compartidos_meses;
create policy p_costo_activo on public.costos_compartidos_meses as restrictive for all to authenticated using (exists (select 1 from public.costos_compartidos c where c.id = costos_compartidos_meses.costo_id));
drop policy if exists p_origen_activo on public.fondos_empresa;
create policy p_origen_activo on public.fondos_empresa as restrictive for all to authenticated using (
  (gasto_id is null or exists (select 1 from public.gastos_empresa g where g.id = fondos_empresa.gasto_id))
  and (liquidacion_id is null or exists (select 1 from public.liquidaciones l where l.id = fondos_empresa.liquidacion_id)));

-- los archivos de la empresa van en la carpeta "empresa" (solo administrador); y ya no se pueden borrar archivos
drop policy if exists vortex_leer on storage.objects;
create policy vortex_leer on storage.objects for select to authenticated using (
  bucket_id in ('comprobantes','fotos') and (public.puede_ver_texto((storage.foldername(name))[1]) or ((storage.foldername(name))[1] = 'empresa' and public.es_admin())));
drop policy if exists vortex_subir on storage.objects;
create policy vortex_subir on storage.objects for insert to authenticated with check (
  bucket_id in ('comprobantes','fotos') and (public.puede_escribir_texto((storage.foldername(name))[1]) or ((storage.foldername(name))[1] = 'empresa' and public.es_admin())));
drop policy if exists vortex_borrar on storage.objects;

-- 7) Los movimientos de fondos que ya tenías pasan al nuevo caja de la empresa (una sola vez)
insert into public.fondos_empresa (fecha, fondo, tipo, monto, nota, origen, migrado_de)
select f.fecha, f.fondo, f.tipo, f.monto, f.nota, 'manual', f.id
from public.fondos_movimientos f
where f.eliminado_en is null and not exists (select 1 from public.fondos_empresa e where e.migrado_de = f.id);

-- 8) Operaciones (todo pasa por aquí para que los números siempre cuadren) -----------------
create or replace function public.registrar_gasto_empresa(p jsonb) returns uuid
language plpgsql security definer set search_path = public as
$$
declare
  v_id uuid; v_monto numeric := nullif(p ->> 'monto', '')::numeric;
  v_fondo text := coalesce(nullif(p ->> 'pagado_desde', ''), 'Fuera de los fondos');
  v_fecha date := coalesce(nullif(p ->> 'fecha', '')::date, current_date);
  v_concepto text := btrim(coalesce(p ->> 'concepto', ''));
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede hacer esto'; end if;
  if v_monto is null or v_monto <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;
  if v_concepto = '' then raise exception 'Falta el concepto del gasto'; end if;
  if v_fondo not in ('Caja chica','Ahorro','Inversión','Retiro del dueño','Fuera de los fondos') then raise exception 'Fondo no válido'; end if;

  insert into public.gastos_empresa(fecha, categoria, concepto, monto, pagado_desde, comprobante_path, nota)
  values (v_fecha, coalesce(nullif(btrim(p ->> 'categoria'), ''), 'Otros'), v_concepto, v_monto, v_fondo, nullif(p ->> 'comprobante_path', ''), nullif(p ->> 'nota', ''))
  returning id into v_id;

  if v_fondo <> 'Fuera de los fondos' then
    insert into public.fondos_empresa(fecha, fondo, tipo, monto, nota, origen, gasto_id)
    values (v_fecha, v_fondo, 'Gasto', v_monto, 'Gasto de la empresa: ' || v_concepto, 'gasto_empresa', v_id);
  end if;
  perform public.auditar(null, 'CREAR', 'gastos_empresa', v_id, jsonb_build_object('monto', v_monto, 'concepto', v_concepto));
  return v_id;
end $$;

create or replace function public.confirmar_liquidacion(p jsonb) returns uuid
language plpgsql security definer set search_path = public as
$$
declare
  z public.zonas%rowtype; v_id uuid; v_periodo date; v_monto numeric; v_soc numeric := 0; v_dueno numeric; v_fon numeric := 0;
  v_pct_soc numeric := 0; v_pct_fon numeric := 0; x jsonb; v_m numeric; v_pct numeric; v_nombre text; v_user uuid;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede confirmar un reparto'; end if;
  select * into z from public.zonas where id = (p ->> 'zona_id')::uuid;
  if not found then raise exception 'No se encontró la zona'; end if;
  v_periodo := date_trunc('month', (p ->> 'periodo')::date)::date;
  v_monto := coalesce(nullif(p ->> 'monto_repartido', '')::numeric, 0);
  if v_monto < 0 then raise exception 'El monto a repartir no puede ser negativo'; end if;
  if exists (select 1 from public.liquidaciones where zona_id = z.id and periodo = v_periodo and estado = 'CONFIRMADA') then
    raise exception 'Esta zona ya tiene un reparto confirmado para ese mes. Anúlalo primero si necesitas rehacerlo.';
  end if;

  for x in select * from jsonb_array_elements(coalesce(p -> 'socios', '[]'::jsonb)) loop
    v_pct := coalesce(nullif(x ->> 'porcentaje', '')::numeric, 0); v_m := coalesce(nullif(x ->> 'monto', '')::numeric, 0);
    if v_pct < 0 or v_pct > 100 or v_m < 0 then raise exception 'Hay un porcentaje o monto de socio no válido'; end if;
    v_pct_soc := v_pct_soc + v_pct; v_soc := v_soc + v_m;
  end loop;
  if v_pct_soc > 100.0001 then raise exception 'Los porcentajes de los socios suman más de 100%%'; end if;
  if v_soc > v_monto + 0.05 then raise exception 'Lo asignado a socios supera el monto a repartir'; end if;
  v_dueno := round(v_monto - v_soc, 2);

  for x in select * from jsonb_array_elements(coalesce(p -> 'fondos', '[]'::jsonb)) loop
    v_pct := coalesce(nullif(x ->> 'porcentaje', '')::numeric, 0); v_m := coalesce(nullif(x ->> 'monto', '')::numeric, 0);
    if v_pct < 0 or v_pct > 100 or v_m < 0 then raise exception 'Hay un porcentaje o monto de fondo no válido'; end if;
    if x ->> 'fondo' not in ('Caja chica','Ahorro','Inversión','Retiro del dueño') then raise exception 'Fondo no válido'; end if;
    v_pct_fon := v_pct_fon + v_pct; v_fon := v_fon + v_m;
  end loop;
  if v_pct_fon > 100.0001 then raise exception 'Los porcentajes de los fondos suman más de 100%%'; end if;
  if v_fon > v_dueno + 0.05 then raise exception 'Lo asignado a fondos supera la parte del dueño'; end if;

  insert into public.liquidaciones(proyecto_id, zona_id, periodo, fecha_reparto, cobrado, otros_ingresos, gastos_operativos, costos_compartidos, pagos_inversores,
                                   utilidad, monto_repartido, total_socios, parte_dueno, detalle, notas)
  values (z.proyecto_id, z.id, v_periodo, coalesce(nullif(p ->> 'fecha_reparto', '')::date, current_date),
          coalesce(nullif(p ->> 'cobrado', '')::numeric, 0), coalesce(nullif(p ->> 'otros_ingresos', '')::numeric, 0), coalesce(nullif(p ->> 'gastos_operativos', '')::numeric, 0),
          coalesce(nullif(p ->> 'costos_compartidos', '')::numeric, 0), coalesce(nullif(p ->> 'pagos_inversores', '')::numeric, 0),
          coalesce(nullif(p ->> 'utilidad', '')::numeric, 0), v_monto, round(v_soc, 2), v_dueno, coalesce(p -> 'detalle', '{}'::jsonb), nullif(p ->> 'notas', ''))
  returning id into v_id;

  for x in select * from jsonb_array_elements(coalesce(p -> 'socios', '[]'::jsonb)) loop
    v_user := (x ->> 'user_id')::uuid;
    select coalesce(nullif(f.nombre, ''), f.email) into v_nombre from public.profiles f where f.id = v_user;
    if v_nombre is null then raise exception 'No se encontró a uno de los socios'; end if;
    insert into public.liquidacion_socios(liquidacion_id, user_id, nombre, porcentaje, monto)
    values (v_id, v_user, v_nombre, coalesce(nullif(x ->> 'porcentaje', '')::numeric, 0), coalesce(nullif(x ->> 'monto', '')::numeric, 0));
  end loop;

  for x in select * from jsonb_array_elements(coalesce(p -> 'fondos', '[]'::jsonb)) loop
    v_m := coalesce(nullif(x ->> 'monto', '')::numeric, 0);
    insert into public.liquidacion_fondos(liquidacion_id, fondo, porcentaje, monto)
    values (v_id, x ->> 'fondo', coalesce(nullif(x ->> 'porcentaje', '')::numeric, 0), v_m);
    if v_m > 0 then
      insert into public.fondos_empresa(fecha, fondo, tipo, monto, nota, origen, liquidacion_id)
      values (coalesce(nullif(p ->> 'fecha_reparto', '')::date, current_date), x ->> 'fondo', 'Aporte', v_m,
              'Reparto de la zona ' || z.nombre || ' · ' || to_char(v_periodo, 'YYYY-MM'), 'reparto', v_id);
    end if;
  end loop;

  perform public.auditar(z.proyecto_id, 'REPARTO', 'liquidaciones', v_id, jsonb_build_object('periodo', v_periodo, 'monto', v_monto));
  return v_id;
end $$;

create or replace function public.anular_liquidacion(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as
$$
declare l public.liquidaciones%rowtype;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede anular un reparto'; end if;
  select * into l from public.liquidaciones where id = p_id and estado = 'CONFIRMADA';
  if not found then raise exception 'No se encontró un reparto confirmado'; end if;
  if exists (select 1 from public.liquidacion_socios where liquidacion_id = p_id and pagado_en is not null) then
    raise exception 'Hay pagos a socios marcados como pagados. Desmárcalos primero.';
  end if;
  update public.liquidaciones set estado = 'ANULADA', motivo_anulacion = nullif(btrim(coalesce(p_motivo, '')), '') where id = p_id;
  update public.fondos_empresa set anulado = true where liquidacion_id = p_id;
  perform public.auditar(l.proyecto_id, 'ANULAR_REPARTO', 'liquidaciones', p_id, jsonb_build_object('motivo', p_motivo));
end $$;

create or replace function public.marcar_pago_socio(p_id uuid, p_fecha date, p_comprobante text default null) returns void
language plpgsql security definer set search_path = public as
$$
declare l public.liquidaciones%rowtype;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede hacer esto'; end if;
  select l2.* into l from public.liquidaciones l2 join public.liquidacion_socios s on s.liquidacion_id = l2.id where s.id = p_id;
  if not found then raise exception 'No se encontró el pago'; end if;
  if l.estado <> 'CONFIRMADA' then raise exception 'Ese reparto está anulado'; end if;
  update public.liquidacion_socios set pagado_en = p_fecha, comprobante_path = case when p_fecha is null then null else nullif(p_comprobante, '') end where id = p_id;
  perform public.auditar(l.proyecto_id, case when p_fecha is null then 'DESMARCAR_PAGO_SOCIO' else 'PAGO_SOCIO' end, 'liquidacion_socios', p_id, null);
end $$;

-- 9) Vistas de lectura -------------------------------------------------------------------------
create or replace view public.v_liquidaciones with (security_invoker = true) as
select l.*, z.nombre as zona_nombre
from public.liquidaciones l
join public.zonas z on z.id = l.zona_id;

create or replace view public.v_reparto_socios with (security_invoker = true) as
select s.id, s.liquidacion_id, s.user_id, s.nombre as socio_nombre, l.zona_id, z.nombre as zona_nombre, l.periodo, l.fecha_reparto, l.estado,
       l.utilidad, l.monto_repartido, s.porcentaje, s.monto, s.pagado_en, s.comprobante_path
from public.liquidacion_socios s
join public.liquidaciones l on l.id = s.liquidacion_id
join public.zonas z on z.id = l.zona_id;

-- 10) Seguridad de permisos --------------------------------------------------------------------
revoke all on public.zona_socios, public.zona_fondos_pct, public.costos_compartidos, public.costos_compartidos_zonas, public.costos_compartidos_meses,
              public.gastos_empresa, public.fondos_empresa, public.liquidaciones, public.liquidacion_socios, public.liquidacion_fondos,
              public.v_liquidaciones, public.v_reparto_socios from anon;
grant select, insert, update on public.zona_socios, public.zona_fondos_pct, public.costos_compartidos, public.costos_compartidos_zonas, public.costos_compartidos_meses, public.fondos_empresa to authenticated;
grant select on public.gastos_empresa, public.liquidaciones, public.liquidacion_socios, public.liquidacion_fondos, public.v_liquidaciones, public.v_reparto_socios to authenticated;
revoke delete on all tables in schema public from authenticated;
-- Los porcentajes se guardan siempre editando (upsert). Para sacar a un socio de una zona se pone su porcentaje en 0.

revoke all on function public.registrar_gasto_empresa(jsonb) from public, anon;
revoke all on function public.confirmar_liquidacion(jsonb) from public, anon;
revoke all on function public.anular_liquidacion(uuid, text) from public, anon;
revoke all on function public.marcar_pago_socio(uuid, date, text) from public, anon;
revoke all on function public.enviar_a_papelera(text, uuid[], text) from public, anon;
revoke all on function public.listar_papelera() from public, anon;
grant execute on function public.registrar_gasto_empresa(jsonb) to authenticated;
grant execute on function public.confirmar_liquidacion(jsonb) to authenticated;
grant execute on function public.anular_liquidacion(uuid, text) to authenticated;
grant execute on function public.marcar_pago_socio(uuid, date, text) to authenticated;
grant execute on function public.enviar_a_papelera(text, uuid[], text) to authenticated;
grant execute on function public.listar_papelera() to authenticated;
