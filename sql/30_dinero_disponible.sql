-- =====================================================================
--  VORTEX · 30 · DINERO DISPONIBLE: INVERSORES + INGRESOS DEL MES, HISTORIAL DE COMPRAS Y FOTOS DE LA INSTALACIÓN
--   · Una compra o un gasto puede salir del fondo de inversores (de la zona o general), de los ingresos del mes
--     (de una zona o de todo el proyecto) o de otra fuente. Lo que sale de un fondo se descuenta solo.
--   · Las compras del almacén y de la empresa guardan con qué dinero se pagaron (se ve en su historial) y quedan en Finanzas.
--   · Los gastos de la empresa también pueden salir de esos fondos.
--   · La instalación guarda 5 fotos (equipo, potencia, puntas del cable y cómo quedó).
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra tus datos. Puedes correrlo dos veces. Va después del archivo 29.
-- =====================================================================

-- 1) Columnas nuevas ---------------------------------------------------------------------------------------------------
alter table public.fin_movimientos drop constraint if exists fin_movimientos_fuente_chk;
alter table public.fin_movimientos add constraint fin_movimientos_fuente_chk check (fuente is null or fuente in ('Fondo de la zona', 'Fondo general', 'Ingresos del mes de la zona', 'Ingresos del mes (proyecto)', 'Otra fuente'));

alter table public.gastos_empresa add column if not exists proyecto_id uuid references public.proyectos(id) on delete set null;
alter table public.gastos_empresa add column if not exists zona_id uuid references public.zonas(id) on delete set null;
alter table public.gastos_empresa add column if not exists fuente text;
alter table public.gastos_empresa add column if not exists fuente_detalle text;
alter table public.gastos_empresa drop constraint if exists gastos_empresa_fuente_chk;
alter table public.gastos_empresa add constraint gastos_empresa_fuente_chk check (fuente is null or fuente in ('Fondo de la zona', 'Fondo general', 'Ingresos del mes de la zona', 'Ingresos del mes (proyecto)', 'Otra fuente'));

alter table public.movimientos add column if not exists fuente text;
alter table public.movimientos add column if not exists fuente_detalle text;
alter table public.movimientos add column if not exists fin_movimiento_id uuid references public.fin_movimientos(id) on delete set null;
alter table public.compras_empresa add column if not exists fuente text;
alter table public.compras_empresa add column if not exists fuente_detalle text;
alter table public.compras_empresa add column if not exists fin_movimiento_id uuid references public.fin_movimientos(id) on delete set null;

alter table public.instalaciones add column if not exists fotos jsonb not null default '{}'::jsonb;

-- 2) Todo lo gastado de un fondo (de Finanzas y de los gastos de la empresa) ---------------------------------------------
create or replace view public.v_gasto_fuente with (security_invoker = true) as
select f.id, 'fin_movimientos'::text as origen, f.proyecto_id, f.zona_id, f.fecha, f.monto, f.fuente, f.descripcion as concepto
from public.fin_movimientos f where f.fuente is not null and f.fuente <> 'Otra fuente' and f.eliminado_en is null
union all
select g.id, 'gastos_empresa'::text, g.proyecto_id, g.zona_id, g.fecha, g.monto, g.fuente, g.concepto
from public.gastos_empresa g where g.fuente is not null and g.fuente <> 'Otra fuente' and g.eliminado_en is null;

-- 3) Fondo de inversores: recibido menos gastado --------------------------------------------------------------------------
create or replace function public.fondo_saldo(p_proyecto uuid, p_zona uuid) returns numeric
language plpgsql security definer set search_path = public as
$$
declare e numeric; g numeric;
begin
  if p_zona is not null then
    select coalesce(sum(monto), 0) into e from public.inversores where zona_id = p_zona and eliminado_en is null;
    select coalesce(sum(monto), 0) into g from public.v_gasto_fuente where fuente = 'Fondo de la zona' and zona_id = p_zona;
  else
    select coalesce(sum(monto), 0) into e from public.inversores where proyecto_id = p_proyecto and zona_id is null and eliminado_en is null;
    select coalesce(sum(monto), 0) into g from public.v_gasto_fuente where fuente = 'Fondo general' and proyecto_id = p_proyecto;
  end if;
  return round(e - g, 2);
end $$;

create or replace view public.v_fondo_inversion with (security_invoker = true) as
with e as (select proyecto_id, zona_id, sum(monto) as recibido from public.inversores where eliminado_en is null group by proyecto_id, zona_id),
     g as (select proyecto_id, case when fuente = 'Fondo de la zona' then zona_id else null end as zona_id, sum(monto) as gastado
           from public.v_gasto_fuente where fuente in ('Fondo de la zona', 'Fondo general') group by 1, 2)
select coalesce(e.proyecto_id, g.proyecto_id) as proyecto_id, coalesce(e.zona_id, g.zona_id) as zona_id, z.nombre as zona_nombre,
       coalesce(e.recibido, 0)::numeric(14,2) as recibido, coalesce(g.gastado, 0)::numeric(14,2) as gastado,
       (coalesce(e.recibido, 0) - coalesce(g.gastado, 0))::numeric(14,2) as disponible
from e full join g on g.proyecto_id = e.proyecto_id and g.zona_id is not distinct from e.zona_id
left join public.zonas z on z.id = coalesce(e.zona_id, g.zona_id);

-- 4) Ingresos del mes: lo cobrado a clientes (y otros ingresos) menos lo que se gastó de ellos ----------------------------------
create or replace view public.v_ingreso_mes_zona with (security_invoker = true) as
select z.proyecto_id, x.zona_id, x.mes, sum(x.cobrado)::numeric(14,2) as cobrado, sum(x.otros)::numeric(14,2) as otros, sum(x.cobrado + x.otros)::numeric(14,2) as total
from (
  select c.zona_id, date_trunc('month', p.fecha)::date as mes, p.monto as cobrado, 0::numeric as otros
  from public.pagos p join public.clientes c on c.id = p.cliente_id where not p.anulado
  union all
  select f.zona_id, date_trunc('month', f.fecha)::date, 0::numeric, f.monto
  from public.fin_movimientos f where f.tipo = 'INGRESO' and f.zona_id is not null and f.eliminado_en is null
) x join public.zonas z on z.id = x.zona_id
group by z.proyecto_id, x.zona_id, x.mes;

create or replace view public.v_ingresos_disponibles with (security_invoker = true) as
with i as (select proyecto_id, zona_id, mes, total from public.v_ingreso_mes_zona),
     g as (select proyecto_id, case when fuente = 'Ingresos del mes de la zona' then zona_id else null end as zona_id, date_trunc('month', fecha)::date as mes, sum(monto) as gastado
           from public.v_gasto_fuente where fuente in ('Ingresos del mes de la zona', 'Ingresos del mes (proyecto)') group by 1, 2, 3)
select coalesce(i.proyecto_id, g.proyecto_id) as proyecto_id, coalesce(i.zona_id, g.zona_id) as zona_id, z.nombre as zona_nombre, coalesce(i.mes, g.mes) as mes,
       coalesce(i.total, 0)::numeric(14,2) as ingreso, coalesce(g.gastado, 0)::numeric(14,2) as gastado, (coalesce(i.total, 0) - coalesce(g.gastado, 0))::numeric(14,2) as disponible
from i full join g on g.proyecto_id = i.proyecto_id and g.zona_id is not distinct from i.zona_id and g.mes = i.mes
left join public.zonas z on z.id = coalesce(i.zona_id, g.zona_id);

-- Disponible de los ingresos de un mes: de una zona, o de todo el proyecto (todas las zonas, descontando todo lo gastado de ingresos)
create or replace function public.ingreso_saldo(p_proyecto uuid, p_zona uuid, p_fecha date) returns numeric
language plpgsql security definer set search_path = public as
$$
declare m date := date_trunc('month', p_fecha)::date; ing numeric; gas numeric;
begin
  if p_zona is not null then
    select coalesce(sum(p.monto), 0) into ing from public.pagos p join public.clientes c on c.id = p.cliente_id where c.zona_id = p_zona and not p.anulado and date_trunc('month', p.fecha)::date = m;
    ing := ing + coalesce((select sum(f.monto) from public.fin_movimientos f where f.tipo = 'INGRESO' and f.zona_id = p_zona and f.eliminado_en is null and date_trunc('month', f.fecha)::date = m), 0);
    select coalesce(sum(monto), 0) into gas from public.v_gasto_fuente where fuente = 'Ingresos del mes de la zona' and zona_id = p_zona and date_trunc('month', fecha)::date = m;
  else
    select coalesce(sum(p.monto), 0) into ing from public.pagos p join public.clientes c on c.id = p.cliente_id join public.zonas z on z.id = c.zona_id where z.proyecto_id = p_proyecto and not p.anulado and date_trunc('month', p.fecha)::date = m;
    ing := ing + coalesce((select sum(f.monto) from public.fin_movimientos f where f.tipo = 'INGRESO' and f.zona_id is not null and f.proyecto_id = p_proyecto and f.eliminado_en is null and date_trunc('month', f.fecha)::date = m), 0);
    select coalesce(sum(monto), 0) into gas from public.v_gasto_fuente where fuente in ('Ingresos del mes de la zona', 'Ingresos del mes (proyecto)') and proyecto_id = p_proyecto and date_trunc('month', fecha)::date = m;
  end if;
  return round(ing - gas, 2);
end $$;

-- 5) Protecciones: no se gasta de más de lo que hay en el fondo o en los ingresos del mes ----------------------------------------
create or replace function public.validar_fuente(p_proyecto uuid, p_zona uuid, p_fuente text, p_monto numeric, p_fecha date, p_devolver numeric) returns void
language plpgsql security definer set search_path = public as
$$
declare v numeric;
begin
  if p_fuente in ('Fondo de la zona', 'Fondo general') then
    if p_fuente = 'Fondo de la zona' and p_zona is null then raise exception 'Para gastar del fondo de una zona hay que elegir la zona.'; end if;
    v := public.fondo_saldo(p_proyecto, case when p_fuente = 'Fondo de la zona' then p_zona else null end) + coalesce(p_devolver, 0);
    if p_monto > v + 0.009 then raise exception 'El fondo de inversión no alcanza: disponible Bs %, este gasto es de Bs %.', to_char(v, 'FM999G999G990D00'), to_char(p_monto, 'FM999G999G990D00'); end if;
  elsif p_fuente in ('Ingresos del mes de la zona', 'Ingresos del mes (proyecto)') then
    if p_fuente = 'Ingresos del mes de la zona' and p_zona is null then raise exception 'Para usar los ingresos de una zona hay que elegir la zona.'; end if;
    v := public.ingreso_saldo(p_proyecto, case when p_fuente = 'Ingresos del mes de la zona' then p_zona else null end, p_fecha) + coalesce(p_devolver, 0);
    if p_monto > v + 0.009 then raise exception 'Los ingresos de ese mes no alcanzan: disponible Bs %, este gasto es de Bs %.', to_char(v, 'FM999G999G990D00'), to_char(p_monto, 'FM999G999G990D00'); end if;
  end if;
end $$;

create or replace function public.fin_validar_fuente() returns trigger language plpgsql security definer set search_path = public as
$$
declare dev numeric := 0;
begin
  if new.fuente is null or new.fuente = 'Otra fuente' then return new; end if;
  if new.tipo = 'INGRESO' then raise exception 'Un ingreso no puede salir de un fondo: deja la fuente vacía.'; end if;
  if new.eliminado_en is not null then return new; end if;
  if tg_op = 'UPDATE' and old.eliminado_en is null and old.fuente is not distinct from new.fuente and old.proyecto_id = new.proyecto_id
     and (new.fuente in ('Fondo general', 'Ingresos del mes (proyecto)') or old.zona_id is not distinct from new.zona_id)
     and (new.fuente in ('Fondo de la zona', 'Fondo general') or date_trunc('month', old.fecha) = date_trunc('month', new.fecha)) then
    dev := old.monto;
  end if;
  perform public.validar_fuente(new.proyecto_id, new.zona_id, new.fuente, new.monto, new.fecha, dev);
  return new;
end $$;
drop trigger if exists t_fin_fuente on public.fin_movimientos;
create trigger t_fin_fuente before insert or update on public.fin_movimientos for each row execute function public.fin_validar_fuente();

create or replace function public.gastos_validar_fuente() returns trigger language plpgsql security definer set search_path = public as
$$
declare dev numeric := 0;
begin
  if new.fuente is null or new.fuente = 'Otra fuente' then return new; end if;
  if new.eliminado_en is not null then return new; end if;
  if new.proyecto_id is null then raise exception 'Elige el proyecto del fondo del que sale el dinero'; end if;
  if tg_op = 'UPDATE' and old.eliminado_en is null and old.fuente is not distinct from new.fuente and old.proyecto_id is not distinct from new.proyecto_id
     and (new.fuente in ('Fondo general', 'Ingresos del mes (proyecto)') or old.zona_id is not distinct from new.zona_id)
     and (new.fuente in ('Fondo de la zona', 'Fondo general') or date_trunc('month', old.fecha) = date_trunc('month', new.fecha)) then
    dev := old.monto;
  end if;
  perform public.validar_fuente(new.proyecto_id, new.zona_id, new.fuente, new.monto, new.fecha, dev);
  return new;
end $$;
drop trigger if exists t_gasto_fuente on public.gastos_empresa;
create trigger t_gasto_fuente before insert or update on public.gastos_empresa for each row execute function public.gastos_validar_fuente();

-- 6) Compras y gastos con la fuente del dinero ------------------------------------------------------------------------------------
drop function if exists public.registrar_compra(uuid, uuid, numeric, numeric, text, text, text);
create or replace function public.registrar_compra(p_material uuid, p_almacen uuid, p_cantidad numeric, p_precio numeric, p_proveedor text default null, p_ref text default null, p_factura text default null, p_fuente text default null, p_fuente_detalle text default null) returns void
language plpgsql security definer set search_path = public as
$$
declare m public.materiales%rowtype; v_antes numeric; v_nuevo numeric; v_mov uuid; v_zona uuid; v_fin uuid; v_total numeric; v_fuente text := nullif(btrim(coalesce(p_fuente, '')), '');
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
  values (m.proyecto_id, 'ENTRADA', p_material, p_almacen, p_cantidad, p_precio, nullif(btrim(coalesce(p_proveedor, '')), ''), nullif(btrim(coalesce(p_ref, '')), ''), nullif(btrim(coalesce(p_factura, '')), '')) returning id into v_mov;
  -- De dónde sale el dinero: queda en Finanzas como inversión y en el historial de compras del almacén (todo o nada: si el fondo no alcanza, la compra no se hace)
  v_total := round(p_cantidad * p_precio, 2);
  if v_fuente is not null and v_fuente not in ('Fondo de la zona', 'Fondo general', 'Ingresos del mes de la zona', 'Ingresos del mes (proyecto)', 'Otra fuente') then raise exception 'La fuente del dinero no es válida'; end if;
  if v_fuente is not null and v_total > 0 then
    if not public.puede_finanzas(m.proyecto_id) then raise exception 'No tienes permiso para registrar el gasto en finanzas'; end if;
    select zona_id into v_zona from public.almacenes where id = p_almacen;
    insert into public.fin_movimientos(proyecto_id, zona_id, fecha, tipo, categoria, monto, descripcion, comprobante_path, fuente, fuente_detalle)
    values (m.proyecto_id, v_zona, current_date, 'INVERSION', coalesce(nullif(btrim(coalesce(m.categoria, '')), ''), 'Materiales y equipos'), v_total,
            'Compra de ' || p_cantidad::text || ' ' || coalesce(m.unidad, '') || ' de ' || m.nombre, nullif(btrim(coalesce(p_factura, '')), ''), v_fuente, nullif(btrim(coalesce(p_fuente_detalle, '')), ''))
    returning id into v_fin;
    update public.movimientos set fuente = v_fuente, fuente_detalle = nullif(btrim(coalesce(p_fuente_detalle, '')), ''), fin_movimiento_id = v_fin where id = v_mov;
  end if;
  perform public.auditar(m.proyecto_id, 'COMPRA', 'materiales', p_material, jsonb_build_object('cantidad', p_cantidad, 'precio', p_precio, 'costo_nuevo', v_nuevo));
end $$;
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
  insert into public.movimientos(proyecto_id, tipo, material_id, almacen_destino, cantidad, costo_unitario, proveedor, referencia, factura_path, fuente, fuente_detalle)
  values (c.proyecto_id, 'ENTRADA', m.id, v_alm, c.cantidad, c.costo_unitario, c.proveedor, 'Compra de la empresa', c.foto_path, c.fuente, c.fuente_detalle);
  update public.compras_empresa set material_id = m.id, almacen_id = v_alm, ubicacion = coalesce((select nombre from public.almacenes where id = v_alm), ubicacion) where id = p_compra;
end $$;
create or replace function public.registrar_compra_empresa(p jsonb) returns uuid
language plpgsql security definer set search_path = public as
$$
declare v_id uuid; v_proy uuid := nullif(p ->> 'proyecto_id', '')::uuid; v_alm uuid := nullif(p ->> 'almacen_id', '')::uuid; v_art text := btrim(coalesce(p ->> 'articulo', '')); v_fuente text := nullif(btrim(coalesce(p ->> 'fuente', '')), ''); v_zona uuid; v_fin uuid; v_total numeric;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede registrar compras de la empresa'; end if;
  if v_art = '' then raise exception 'Escribe el nombre del artículo'; end if;
  if coalesce(nullif(p ->> 'cantidad', '')::int, 0) < 1 then raise exception 'La cantidad debe ser 1 o más'; end if;
  perform 1 from public.proyectos where id = v_proy and eliminado_en is null;
  if not found then raise exception 'Elige el proyecto de la compra'; end if;
  if v_alm is not null then perform 1 from public.almacenes where id = v_alm and proyecto_id = v_proy; if not found then raise exception 'El almacén no pertenece a ese proyecto'; end if; end if;
  if v_fuente is not null and v_fuente not in ('Fondo de la zona', 'Fondo general', 'Ingresos del mes de la zona', 'Ingresos del mes (proyecto)', 'Otra fuente') then raise exception 'La fuente del dinero no es válida'; end if;
  insert into public.compras_empresa(articulo, categoria, cantidad, costo_unitario, fecha, proveedor, ubicacion, estado, foto_path, proyecto_id, almacen_id, fuente, fuente_detalle)
  values (v_art, coalesce(nullif(btrim(coalesce(p ->> 'categoria', '')), ''), 'Otros'), (p ->> 'cantidad')::int, coalesce(nullif(p ->> 'costo_unitario', '')::numeric, 0), coalesce(nullif(p ->> 'fecha', '')::date, current_date),
          nullif(btrim(coalesce(p ->> 'proveedor', '')), ''), (select nombre from public.almacenes where id = v_alm), coalesce(nullif(p ->> 'estado', ''), 'En uso'), nullif(p ->> 'foto_path', ''), v_proy, v_alm, v_fuente, nullif(btrim(coalesce(p ->> 'fuente_detalle', '')), ''))
  returning id into v_id;
  perform public.ingresar_compra_empresa(v_id);
  v_total := round((p ->> 'cantidad')::int * coalesce(nullif(p ->> 'costo_unitario', '')::numeric, 0), 2);
  if v_fuente is not null and v_total > 0 then
    select a.zona_id into v_zona from public.almacenes a join public.compras_empresa c on c.almacen_id = a.id where c.id = v_id;
    insert into public.fin_movimientos(proyecto_id, zona_id, fecha, tipo, categoria, monto, descripcion, comprobante_path, fuente, fuente_detalle)
    values (v_proy, v_zona, coalesce(nullif(p ->> 'fecha', '')::date, current_date), 'INVERSION', 'Herramientas y equipos', v_total, 'Compra de ' || (p ->> 'cantidad') || ' × ' || v_art, nullif(p ->> 'foto_path', ''), v_fuente, nullif(btrim(coalesce(p ->> 'fuente_detalle', '')), ''))
    returning id into v_fin;
    update public.compras_empresa set fin_movimiento_id = v_fin where id = v_id;
  end if;
  return v_id;
end $$;
create or replace function public.registrar_gasto_empresa(p jsonb) returns uuid
language plpgsql security definer set search_path = public as
$$
declare
  v_id uuid; v_monto numeric := nullif(p ->> 'monto', '')::numeric;
  v_fondo text := coalesce(nullif(p ->> 'pagado_desde', ''), 'Fuera de los fondos');
  v_fecha date := coalesce(nullif(p ->> 'fecha', '')::date, current_date);
  v_concepto text := btrim(coalesce(p ->> 'concepto', ''));
  v_fuente text := nullif(btrim(coalesce(p ->> 'fuente', '')), ''); v_proy uuid := nullif(p ->> 'proyecto_id', '')::uuid; v_zona uuid := nullif(p ->> 'zona_id', '')::uuid;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede hacer esto'; end if;
  if v_monto is null or v_monto <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;
  if v_concepto = '' then raise exception 'Falta el concepto del gasto'; end if;
  if v_fondo not in ('Caja chica','Ahorro','Inversión','Retiro del dueño','Fuera de los fondos') then raise exception 'Fondo no válido'; end if;

  if v_fuente is not null and v_fuente not in ('Fondo de la zona', 'Fondo general', 'Ingresos del mes de la zona', 'Ingresos del mes (proyecto)', 'Otra fuente') then raise exception 'La fuente del dinero no es válida'; end if;
  if v_fuente is not null and v_fondo <> 'Fuera de los fondos' then raise exception 'Elige una sola fuente para el dinero del gasto'; end if;
  if v_fuente is not null and v_fuente <> 'Otra fuente' and v_proy is null then raise exception 'Elige el proyecto del fondo del que sale el dinero'; end if;
  insert into public.gastos_empresa(fecha, categoria, concepto, monto, pagado_desde, comprobante_path, nota, proyecto_id, zona_id, fuente, fuente_detalle)
  values (v_fecha, coalesce(nullif(btrim(p ->> 'categoria'), ''), 'Otros'), v_concepto, v_monto, v_fondo, nullif(p ->> 'comprobante_path', ''), nullif(p ->> 'nota', ''), v_proy, v_zona, v_fuente, nullif(btrim(coalesce(p ->> 'fuente_detalle', '')), ''))
  returning id into v_id;

  if v_fondo <> 'Fuera de los fondos' then
    insert into public.fondos_empresa(fecha, fondo, tipo, monto, nota, origen, gasto_id)
    values (v_fecha, v_fondo, 'Gasto', v_monto, 'Gasto de la empresa: ' || v_concepto, 'gasto_empresa', v_id);
  end if;
  perform public.auditar(null, 'CREAR', 'gastos_empresa', v_id, jsonb_build_object('monto', v_monto, 'concepto', v_concepto));
  return v_id;
end $$;

-- 7) Lista de instalaciones con sus fotos -----------------------------------------------------------------------------------------------
create or replace view public.v_instalaciones_lista with (security_invoker = true) as
select i.id, i.codigo, i.proyecto_id, i.zona_id, i.fecha, i.tecnico, c.nombre as cliente_nombre, c.ci as cliente_ci, c.codigo as cliente_codigo,
       n.codigo as nap_codigo, pt.numero as puerto_numero, i.formulario_path, i.fotos
from public.instalaciones i
left join public.clientes c on c.id = i.cliente_id
left join public.naps n on n.id = c.nap_id
left join public.puertos pt on pt.id = c.puerto_id;

-- 8) Permisos ---------------------------------------------------------------------------------------------------------------------------
revoke all on public.v_gasto_fuente, public.v_ingreso_mes_zona, public.v_ingresos_disponibles from anon;
grant select on public.v_gasto_fuente, public.v_ingreso_mes_zona, public.v_ingresos_disponibles to authenticated;
revoke all on function public.ingreso_saldo(uuid, uuid, date) from public, anon;
grant execute on function public.ingreso_saldo(uuid, uuid, date) to authenticated;
revoke all on function public.validar_fuente(uuid, uuid, text, numeric, date, numeric) from public, anon;
revoke all on function public.registrar_compra(uuid, uuid, numeric, numeric, text, text, text, text, text) from public, anon;
grant execute on function public.registrar_compra(uuid, uuid, numeric, numeric, text, text, text, text, text) to authenticated;
revoke all on function public.ingresar_compra_empresa(uuid) from public, anon;
revoke all on function public.registrar_compra_empresa(jsonb) from public, anon;
revoke all on function public.registrar_gasto_empresa(jsonb) from public, anon;
grant execute on function public.ingresar_compra_empresa(uuid) to authenticated;
grant execute on function public.registrar_compra_empresa(jsonb) to authenticated;
grant execute on function public.registrar_gasto_empresa(jsonb) to authenticated;
