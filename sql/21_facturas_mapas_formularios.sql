-- =====================================================================
--  VORTEX · 21 · FACTURAS EN EL INVENTARIO, MAPAS GUARDADOS Y FORMULARIOS ESCANEADOS
--   · Cada ingreso de material puede llevar su factura, y se puede ver desde Inventario
--   · Los mapas de maps.me (KML, KMZ, GPX) se suben una vez y quedan guardados para abrirlos cuando quieras
--   · Los formularios de instalación, baja y mantenimiento escaneados con la cámara quedan guardados, con su ubicación
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra tus datos. Puedes correrlo dos veces. Va después del archivo 20.
-- =====================================================================

-- 1) Factura de cada ingreso de material -----------------------------------------------------------------
alter table public.movimientos add column if not exists factura_path text;

drop function if exists public.registrar_compra(uuid, uuid, numeric, numeric, text, text);
create or replace function public.registrar_compra(p_material uuid, p_almacen uuid, p_cantidad numeric, p_precio numeric, p_proveedor text default null, p_ref text default null, p_factura text default null) returns void
language plpgsql security definer set search_path = public as
$$
declare m public.materiales%rowtype; v_antes numeric; v_nuevo numeric;
begin
  select * into m from public.materiales where id = p_material;
  if not found then raise exception 'Material no encontrado'; end if;
  if not public.puede_rol(m.proyecto_id, array['socio','almacen','supervisor','tecnico']) then raise exception 'No tienes permiso para ingresar inventario'; end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'La cantidad debe ser mayor a 0'; end if;
  if p_precio is null or p_precio < 0 then raise exception 'El precio no puede ser negativo'; end if;
  perform 1 from public.almacenes where id = p_almacen and proyecto_id = m.proyecto_id;
  if not found then raise exception 'El almacén no pertenece a este proyecto'; end if;

  select coalesce(sum(cantidad), 0) into v_antes from public.stock where material_id = p_material;
  v_nuevo := case when v_antes + p_cantidad > 0 then round((v_antes * m.costo + p_cantidad * p_precio) / (v_antes + p_cantidad), 2) else p_precio end;

  insert into public.stock(material_id, almacen_id, proyecto_id, cantidad) values (p_material, p_almacen, m.proyecto_id, p_cantidad)
  on conflict (material_id, almacen_id) do update set cantidad = public.stock.cantidad + excluded.cantidad;
  update public.materiales set costo = v_nuevo where id = p_material;
  insert into public.movimientos(proyecto_id, tipo, material_id, almacen_destino, cantidad, costo_unitario, proveedor, referencia, factura_path)
  values (m.proyecto_id, 'ENTRADA', p_material, p_almacen, p_cantidad, p_precio, nullif(btrim(coalesce(p_proveedor, '')), ''), nullif(btrim(coalesce(p_ref, '')), ''), nullif(btrim(coalesce(p_factura, '')), ''));
  perform public.auditar(m.proyecto_id, 'COMPRA', 'materiales', p_material, jsonb_build_object('cantidad', p_cantidad, 'precio', p_precio, 'costo_nuevo', v_nuevo));
end $$;
revoke all on function public.registrar_compra(uuid, uuid, numeric, numeric, text, text, text) from public, anon;
grant execute on function public.registrar_compra(uuid, uuid, numeric, numeric, text, text, text) to authenticated;

-- Las compras de la empresa pasan su factura al inventario
create or replace function public.ingresar_compra_empresa(p_compra uuid) returns void
language plpgsql security definer set search_path = public as
$$
declare c public.compras_empresa%rowtype; m public.materiales%rowtype; v_alm uuid; v_antes numeric; v_nuevo numeric;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede hacer esto'; end if;
  select * into c from public.compras_empresa where id = p_compra;
  if not found then raise exception 'No se encontró la compra'; end if;
  if c.proyecto_id is null then raise exception 'Elige el proyecto de la compra'; end if;
  if c.material_id is not null then return; end if;
  v_alm := c.almacen_id;
  if v_alm is null then select id into v_alm from public.almacenes where proyecto_id = c.proyecto_id and tipo = 'central' limit 1; end if;
  if v_alm is null then raise exception 'El proyecto no tiene almacén central'; end if;

  select * into m from public.materiales where proyecto_id = c.proyecto_id and lower(nombre) = lower(c.articulo) order by (eliminado_en is null) desc limit 1;
  if found and m.eliminado_en is not null then
    update public.materiales set eliminado_en = null, eliminado_por = null, eliminado_motivo = null where id = m.id;
  elsif not found then
    insert into public.materiales(proyecto_id, nombre, categoria, unidad, minimo, costo, proveedor)
    values (c.proyecto_id, c.articulo, c.categoria, 'u', 0, c.costo_unitario, c.proveedor) returning * into m;
  end if;

  select coalesce(sum(cantidad), 0) into v_antes from public.stock where material_id = m.id;
  v_nuevo := case when v_antes + c.cantidad > 0 then round((v_antes * m.costo + c.cantidad * c.costo_unitario) / (v_antes + c.cantidad), 2) else c.costo_unitario end;
  insert into public.stock(material_id, almacen_id, proyecto_id, cantidad) values (m.id, v_alm, c.proyecto_id, c.cantidad)
  on conflict (material_id, almacen_id) do update set cantidad = public.stock.cantidad + excluded.cantidad;
  update public.materiales set costo = v_nuevo where id = m.id;
  insert into public.movimientos(proyecto_id, tipo, material_id, almacen_destino, cantidad, costo_unitario, proveedor, referencia, factura_path)
  values (c.proyecto_id, 'ENTRADA', m.id, v_alm, c.cantidad, c.costo_unitario, c.proveedor, 'Compra de la empresa', c.foto_path);
  update public.compras_empresa set material_id = m.id, almacen_id = v_alm, ubicacion = coalesce((select nombre from public.almacenes where id = v_alm), ubicacion) where id = p_compra;
end $$;

-- 2) Formularios escaneados: foto del formulario y ubicación -----------------------------------------------
alter table public.instalaciones add column if not exists formulario_path text;
alter table public.bajas add column if not exists lat numeric;
alter table public.bajas add column if not exists lng numeric;
alter table public.bajas add column if not exists formulario_path text;
alter table public.mantenimientos add column if not exists lat numeric;
alter table public.mantenimientos add column if not exists lng numeric;
alter table public.mantenimientos add column if not exists formulario_path text;

create or replace function public.completar_baja(p jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare v_cli uuid := (p ->> 'cliente_id')::uuid; v_baja uuid; v_fecha date := coalesce(nullif(p ->> 'fecha', '')::date, current_date);
begin
  perform public.dar_baja(v_cli, v_fecha, coalesce(nullif(btrim(coalesce(p ->> 'motivo', '')), ''), 'Sin motivo'), coalesce(nullif(p ->> 'destino', ''), 'ALMACEN'));
  select id into v_baja from public.bajas where cliente_id = v_cli order by fecha desc, id limit 1;
  update public.bajas set estado_fisico = nullif(p ->> 'estado_fisico', ''), fotos_path = nullif(p ->> 'fotos_path', ''), autorizado_nombre = nullif(p ->> 'autorizado_nombre', ''),
         lat = nullif(p ->> 'lat', '')::numeric, lng = nullif(p ->> 'lng', '')::numeric, formulario_path = nullif(p ->> 'formulario_path', '') where id = v_baja;
  update public.ordenes_trabajo set estado = 'COMPLETADA', cerrado_en = now(), resultado_id = v_baja where cliente_id = v_cli and tipo = 'Baja' and estado in ('PROGRAMADA', 'EN PROCESO');
end $$;
revoke all on function public.completar_baja(jsonb) from public, anon;
grant execute on function public.completar_baja(jsonb) to authenticated;

create or replace view public.v_instalaciones_lista with (security_invoker = true) as
select i.id, i.codigo, i.proyecto_id, i.zona_id, i.fecha, i.tecnico, c.nombre as cliente_nombre, c.ci as cliente_ci, c.codigo as cliente_codigo,
       n.codigo as nap_codigo, pt.numero as puerto_numero, i.formulario_path
from public.instalaciones i
left join public.clientes c on c.id = i.cliente_id
left join public.naps n on n.id = c.nap_id
left join public.puertos pt on pt.id = c.puerto_id;

create or replace view public.v_bajas_lista with (security_invoker = true) as
select b.id, b.proyecto_id, c.zona_id, b.fecha, b.motivo, b.destino_equipo, b.estado_fisico, b.autorizado_nombre, b.fotos_path,
       c.codigo as cliente_codigo, c.nombre as cliente_nombre, b.lat, b.lng, b.formulario_path
from public.bajas b join public.clientes c on c.id = b.cliente_id;

-- 3) Mapas del proyecto (archivos de maps.me, Google Earth o GPS) --------------------------------------------
create table if not exists public.mapas_proyecto (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid references public.zonas(id) on delete cascade,
  nombre text not null,
  origen text,
  archivo_path text,
  elementos jsonb not null,
  n_puntos int not null default 0, n_lineas int not null default 0, n_areas int not null default 0,
  longitud_m numeric(12,1) not null default 0,
  creado_por uuid default auth.uid(), creado_en timestamptz not null default now(),
  eliminado_en timestamptz, eliminado_por uuid, eliminado_motivo text
);
create index if not exists i_mapas_proyecto on public.mapas_proyecto (proyecto_id);

create or replace function public.papelera_tablas() returns text[] language sql immutable as
$$ select array['proyectos','zonas','costos_fijos','equipos_serie','fin_movimientos','fondos_movimientos',
                'historial_red','materiales','pagos_personal','presupuesto_lineas','simulaciones','inversores',
                'olts','troncales','fusiones','postes','naps',
                'gastos_empresa','costos_compartidos','fondos_empresa','compras_empresa','costos_variables',
                'ordenes_trabajo','diario_zona','trazados_gps','mapas_proyecto']::text[] $$;

alter table public.mapas_proyecto enable row level security;
drop policy if exists p_ver on public.mapas_proyecto;
create policy p_ver on public.mapas_proyecto for select to authenticated using (public.puede_ver(proyecto_id));
drop policy if exists p_esc on public.mapas_proyecto;
create policy p_esc on public.mapas_proyecto for all to authenticated using (public.puede_escribir(proyecto_id)) with check (public.puede_escribir(proyecto_id));
drop policy if exists p_papelera on public.mapas_proyecto;
create policy p_papelera on public.mapas_proyecto as restrictive for all to authenticated using (eliminado_en is null);
drop policy if exists p_proyecto_activo on public.mapas_proyecto;
create policy p_proyecto_activo on public.mapas_proyecto as restrictive for all to authenticated using (public.proyecto_activo(proyecto_id));
drop policy if exists p_zona_activa on public.mapas_proyecto;
create policy p_zona_activa on public.mapas_proyecto as restrictive for all to authenticated using (zona_id is null or public.zona_activa(zona_id));
drop policy if exists p_zona_usuario on public.mapas_proyecto;
create policy p_zona_usuario on public.mapas_proyecto as restrictive for all to authenticated using (zona_id is null or public.zona_permitida(zona_id));

revoke all on public.mapas_proyecto from anon;
grant select, insert, update on public.mapas_proyecto to authenticated;
revoke delete on public.mapas_proyecto from authenticated;
