-- =====================================================================
--  VORTEX · 19 · ZONAS DENTRO DE SU PROYECTO + COMPRAS DE LA EMPRESA EN EL INVENTARIO
--   · Crear una zona ya no crea un proyecto: la zona queda dentro del proyecto que elijas
--   · Lo que registres en "Compras de la empresa" entra también al inventario (almacén que elijas) con el precio pagado
--   · Si cambias de lugar una compra, el material se mueve de almacén
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra tus datos. Puedes correrlo dos veces. Va después del archivo 18.
--  Las compras de la empresa que ya tenías se pasan UNA VEZ al inventario del proyecto principal.
-- =====================================================================

-- 1) Crear zona: siempre dentro de un proyecto existente ----------------------------------------------------
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
        insert into public.inversores(proyecto_id, zona_id, nombre, monto, interes, periodo_interes, plazo_meses, fecha_inicio)
        values (v_proy, v_zona, btrim(x ->> 'nombre'), (x ->> 'monto')::numeric, coalesce(nullif(x ->> 'interes', '')::numeric, 0),
                case when x ->> 'periodo_interes' = 'anual' then 'anual' else 'mensual' end,
                coalesce(nullif(x ->> 'plazo_meses', '')::int, 12), v_inicio);
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

-- 2) Compras de la empresa: a qué proyecto, a qué almacén y qué material del inventario son ------------------
alter table public.compras_empresa add column if not exists proyecto_id uuid references public.proyectos(id) on delete set null;
alter table public.compras_empresa add column if not exists almacen_id uuid references public.almacenes(id) on delete set null;
alter table public.compras_empresa add column if not exists material_id uuid references public.materiales(id) on delete set null;

-- Pasa una compra al inventario: crea el material si no existe, suma el stock en el almacén y recalcula el costo promedio
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
  insert into public.movimientos(proyecto_id, tipo, material_id, almacen_destino, cantidad, costo_unitario, proveedor, referencia)
  values (c.proyecto_id, 'ENTRADA', m.id, v_alm, c.cantidad, c.costo_unitario, c.proveedor, 'Compra de la empresa');
  update public.compras_empresa set material_id = m.id, almacen_id = v_alm, ubicacion = coalesce((select nombre from public.almacenes where id = v_alm), ubicacion) where id = p_compra;
end $$;

-- Registra una compra de la empresa y la pasa al inventario en un solo paso
create or replace function public.registrar_compra_empresa(p jsonb) returns uuid
language plpgsql security definer set search_path = public as
$$
declare v_id uuid; v_proy uuid := nullif(p ->> 'proyecto_id', '')::uuid; v_alm uuid := nullif(p ->> 'almacen_id', '')::uuid; v_art text := btrim(coalesce(p ->> 'articulo', ''));
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede registrar compras de la empresa'; end if;
  if v_art = '' then raise exception 'Escribe el nombre del artículo'; end if;
  if coalesce(nullif(p ->> 'cantidad', '')::int, 0) < 1 then raise exception 'La cantidad debe ser 1 o más'; end if;
  perform 1 from public.proyectos where id = v_proy and eliminado_en is null;
  if not found then raise exception 'Elige el proyecto de la compra'; end if;
  if v_alm is not null then perform 1 from public.almacenes where id = v_alm and proyecto_id = v_proy; if not found then raise exception 'El almacén no pertenece a ese proyecto'; end if; end if;
  insert into public.compras_empresa(articulo, categoria, cantidad, costo_unitario, fecha, proveedor, ubicacion, estado, foto_path, proyecto_id, almacen_id)
  values (v_art, coalesce(nullif(btrim(coalesce(p ->> 'categoria', '')), ''), 'Otros'), (p ->> 'cantidad')::int, coalesce(nullif(p ->> 'costo_unitario', '')::numeric, 0), coalesce(nullif(p ->> 'fecha', '')::date, current_date),
          nullif(btrim(coalesce(p ->> 'proveedor', '')), ''), (select nombre from public.almacenes where id = v_alm), coalesce(nullif(p ->> 'estado', ''), 'En uso'), nullif(p ->> 'foto_path', ''), v_proy, v_alm)
  returning id into v_id;
  perform public.ingresar_compra_empresa(v_id);
  return v_id;
end $$;

-- Cambiar de lugar una compra: el material se mueve de almacén
create or replace function public.mover_compra_empresa(p_compra uuid, p_almacen uuid) returns void
language plpgsql security definer set search_path = public as
$$
declare c public.compras_empresa%rowtype; v_nom text;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede hacer esto'; end if;
  select * into c from public.compras_empresa where id = p_compra;
  if not found then raise exception 'No se encontró la compra'; end if;
  select nombre into v_nom from public.almacenes where id = p_almacen and proyecto_id = c.proyecto_id;
  if v_nom is null then raise exception 'Ese almacén no pertenece al proyecto de la compra'; end if;
  if c.material_id is not null and c.almacen_id is not null and c.almacen_id <> p_almacen then
    perform public.registrar_movimiento('TRANSFERENCIA', c.material_id, c.almacen_id, p_almacen, c.cantidad, 'Cambio de lugar de una compra de la empresa', null);
  end if;
  update public.compras_empresa set almacen_id = p_almacen, ubicacion = v_nom where id = p_compra;
end $$;

-- 3) Las compras que ya tenías pasan al inventario del proyecto principal (una sola vez) ----------------------------
do $$
declare r record; v_p uuid; v_c uuid; v_v uuid; v_a uuid;
begin
  select id into v_p from public.proyectos where eliminado_en is null order by (nombre = 'Vortex') desc, creado_en limit 1;
  if v_p is null then return; end if;
  select id into v_c from public.almacenes where proyecto_id = v_p and tipo = 'central' limit 1;
  select id into v_v from public.almacenes where proyecto_id = v_p and tipo = 'vehiculo' limit 1;
  if v_c is null then return; end if;
  for r in select * from public.compras_empresa where material_id is null and eliminado_en is null loop
    begin
      v_a := case when r.ubicacion in ('Vehículo / técnico', 'En uso (técnico)') and v_v is not null then v_v
                  else coalesce((select a.id from public.almacenes a where a.proyecto_id = v_p and a.nombre = r.ubicacion limit 1), v_c) end;
      update public.compras_empresa set proyecto_id = v_p, almacen_id = v_a where id = r.id;
      declare c public.compras_empresa%rowtype; m public.materiales%rowtype; v_antes numeric; v_nuevo numeric;
      begin
        select * into c from public.compras_empresa where id = r.id;
        select * into m from public.materiales where proyecto_id = v_p and lower(nombre) = lower(c.articulo) order by (eliminado_en is null) desc limit 1;
        if found and m.eliminado_en is not null then update public.materiales set eliminado_en = null, eliminado_por = null, eliminado_motivo = null where id = m.id;
        elsif not found then insert into public.materiales(proyecto_id, nombre, categoria, unidad, minimo, costo, proveedor) values (v_p, c.articulo, c.categoria, 'u', 0, c.costo_unitario, c.proveedor) returning * into m;
        end if;
        select coalesce(sum(cantidad), 0) into v_antes from public.stock where material_id = m.id;
        v_nuevo := case when v_antes + c.cantidad > 0 then round((v_antes * m.costo + c.cantidad * c.costo_unitario) / (v_antes + c.cantidad), 2) else c.costo_unitario end;
        insert into public.stock(material_id, almacen_id, proyecto_id, cantidad) values (m.id, v_a, v_p, c.cantidad) on conflict (material_id, almacen_id) do update set cantidad = public.stock.cantidad + excluded.cantidad;
        update public.materiales set costo = v_nuevo where id = m.id;
        insert into public.movimientos(proyecto_id, tipo, material_id, almacen_destino, cantidad, costo_unitario, proveedor, referencia) values (v_p, 'ENTRADA', m.id, v_a, c.cantidad, c.costo_unitario, c.proveedor, 'Compra de la empresa (anterior)');
        update public.compras_empresa set material_id = m.id where id = r.id;
      end;
    exception when others then raise notice 'No se pudo pasar al inventario la compra %: %', r.articulo, sqlerrm;
    end;
  end loop;
end $$;

-- 4) Permisos --------------------------------------------------------------------------------------------------------
revoke all on function public.ingresar_compra_empresa(uuid) from public, anon;
revoke all on function public.registrar_compra_empresa(jsonb) from public, anon;
revoke all on function public.mover_compra_empresa(uuid, uuid) from public, anon;
grant execute on function public.ingresar_compra_empresa(uuid) to authenticated;
grant execute on function public.registrar_compra_empresa(jsonb) to authenticated;
grant execute on function public.mover_compra_empresa(uuid, uuid) to authenticated;
