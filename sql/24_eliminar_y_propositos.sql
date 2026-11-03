-- =====================================================================
--  VORTEX · 24 · ELIMINAR PROYECTOS Y ZONAS DE VERDAD, Y "PARA QUÉ ES LA INVERSIÓN"
--   · El administrador puede eliminar definitivamente una zona o un proyecto (por ejemplo, uno creado por adelantado que no se dio)
--   · Si está vacío se elimina directo; si tiene datos, se muestra qué se perdería y hay que escribir su nombre para confirmar
--   · Queda un registro de lo que se eliminó
--   · Cada inversor puede llevar una nota con el propósito de su inversión
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra nada por sí solo. Puedes correrlo dos veces. Va después del archivo 23.
-- =====================================================================

alter table public.inversores add column if not exists proposito text;

-- Registro permanente de lo que se eliminó (no se borra con el proyecto)
create table if not exists public.eliminaciones_definitivas (
  id uuid primary key default gen_random_uuid(),
  tabla text not null, nombre text not null, proyecto_id uuid, resumen jsonb,
  eliminado_por uuid, eliminado_en timestamptz not null default now()
);
alter table public.eliminaciones_definitivas enable row level security;
drop policy if exists p_admin on public.eliminaciones_definitivas;
create policy p_admin on public.eliminaciones_definitivas for select to authenticated using (public.es_admin());
revoke all on public.eliminaciones_definitivas from anon;
grant select on public.eliminaciones_definitivas to authenticated;

-- Qué contiene una zona o un proyecto (para mostrarlo antes de eliminar)
create or replace function public.resumen_eliminacion(p_tabla text, p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  v_nombre text; v_zonas uuid[] := '{}'; v_items jsonb := '[]'::jsonb;
  n_zonas int := 0; n_clientes int; n_pagos int; n_fin int; n_naps int; n_inv int; n_inst int; n_equipos int; n_stock int; n_mat int := 0; n_usu int := 0; v_total int;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede hacer esto'; end if;
  if p_tabla = 'zonas' then
    select nombre into v_nombre from public.zonas where id = p_id; v_zonas := array[p_id];
  elsif p_tabla = 'proyectos' then
    select nombre into v_nombre from public.proyectos where id = p_id;
    select coalesce(array_agg(id), '{}') into v_zonas from public.zonas where proyecto_id = p_id; n_zonas := coalesce(array_length(v_zonas, 1), 0);
    select count(*) into n_mat from public.materiales where proyecto_id = p_id;
    select count(*) into n_usu from public.proyecto_usuarios where proyecto_id = p_id;
  else raise exception 'Solo se pueden eliminar zonas y proyectos'; end if;
  if v_nombre is null then raise exception 'No se encontró lo que quieres eliminar'; end if;
  select count(*) into n_clientes from public.clientes where zona_id = any (v_zonas);
  select count(*) into n_pagos from public.pagos p join public.clientes c on c.id = p.cliente_id where c.zona_id = any (v_zonas);
  select count(*) into n_fin from public.fin_movimientos where zona_id = any (v_zonas);
  select count(*) into n_naps from public.naps where zona_id = any (v_zonas);
  select count(*) into n_inv from public.inversores where zona_id = any (v_zonas);
  select count(*) into n_inst from public.instalaciones where zona_id = any (v_zonas);
  select count(*) into n_equipos from public.equipos_serie e join public.almacenes a on a.id = e.almacen_id where a.zona_id = any (v_zonas);
  select count(*) into n_stock from public.stock s join public.almacenes a on a.id = s.almacen_id where a.zona_id = any (v_zonas) and s.cantidad > 0;
  v_items := jsonb_build_array(
    jsonb_build_object('etiqueta', 'Zonas', 'n', n_zonas), jsonb_build_object('etiqueta', 'Clientes', 'n', n_clientes), jsonb_build_object('etiqueta', 'Pagos registrados', 'n', n_pagos),
    jsonb_build_object('etiqueta', 'Ingresos y gastos', 'n', n_fin), jsonb_build_object('etiqueta', 'NAP', 'n', n_naps), jsonb_build_object('etiqueta', 'Instalaciones', 'n', n_inst),
    jsonb_build_object('etiqueta', 'Inversores', 'n', n_inv), jsonb_build_object('etiqueta', 'Equipos con serie en sus almacenes', 'n', n_equipos),
    jsonb_build_object('etiqueta', 'Materiales con existencias en sus almacenes', 'n', n_stock), jsonb_build_object('etiqueta', 'Materiales del proyecto', 'n', n_mat), jsonb_build_object('etiqueta', 'Usuarios con acceso', 'n', n_usu));
  v_total := n_clientes + n_pagos + n_fin + n_naps + n_inv + n_inst + n_equipos + n_stock + n_mat;
  return jsonb_build_object('tabla', p_tabla, 'nombre', v_nombre, 'items', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(v_items) x where (x ->> 'n')::int > 0), 'vacio', v_total = 0);
end $$;

-- Eliminar de verdad una zona o un proyecto (y todo lo que contiene). Solo el administrador.
create or replace function public.eliminar_definitivo(p_tabla text, p_id uuid, p_forzar boolean default false) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare r jsonb; v_proy uuid; v_central uuid; v_tab text; f record;
begin
  r := public.resumen_eliminacion(p_tabla, p_id);
  if not (r ->> 'vacio')::boolean and not coalesce(p_forzar, false) then raise exception 'Tiene datos: hay que confirmar escribiendo su nombre'; end if;
  if p_tabla = 'zonas' then
    select proyecto_id into v_proy from public.zonas where id = p_id;
    select id into v_central from public.almacenes where proyecto_id = v_proy and tipo = 'central' limit 1;
    -- los equipos con serie que estaban en los almacenes de la zona pasan al almacén central
    update public.equipos_serie set almacen_id = v_central where almacen_id in (select id from public.almacenes where zona_id = p_id);
    delete from public.movimientos where almacen_origen in (select id from public.almacenes where zona_id = p_id) or almacen_destino in (select id from public.almacenes where zona_id = p_id);
    -- lo que quedaba ligado a la zona solo "por referencia" (por ejemplo ingresos y gastos) se elimina con ella
    for f in select c.conrelid::regclass::text as rel, a.attname as col from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
             where c.contype = 'f' and c.confrelid = 'public.zonas'::regclass and c.confdeltype = 'n' loop
      execute format('delete from %s where %I = $1', f.rel, f.col) using p_id;
    end loop;
  else v_proy := p_id;
  end if;
  insert into public.eliminaciones_definitivas(tabla, nombre, proyecto_id, resumen, eliminado_por) values (p_tabla, r ->> 'nombre', v_proy, r, auth.uid());
  begin
    if p_tabla = 'zonas' then delete from public.zonas where id = p_id; else delete from public.proyectos where id = p_id; end if;
  exception when foreign_key_violation then
    get stacked diagnostics v_tab = table_name;
    raise exception 'No se pudo eliminar porque todavía hay datos ligados (%). Mándalo a la papelera y avísame para revisarlo.', coalesce(v_tab, 'otra tabla');
  end;
  return r;
end $$;

revoke all on function public.resumen_eliminacion(text, uuid) from public, anon;
revoke all on function public.eliminar_definitivo(text, uuid, boolean) from public, anon;
grant execute on function public.resumen_eliminacion(text, uuid) to authenticated;
grant execute on function public.eliminar_definitivo(text, uuid, boolean) to authenticated;
