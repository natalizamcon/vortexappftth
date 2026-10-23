-- =====================================================================
--  VORTEX · 16 · INVENTARIO COMO EN EL PROTOTIPO + SOCIOS EN FINANZAS
--   · Materiales con código (MAT-001), marca y modelo
--   · Almacén "Vehículo / técnico" en cada proyecto (además del central y el de cada zona)
--   · Compras con el precio realmente pagado (descuentos): el costo del material se recalcula como promedio
--   · Agregar un socio (nuevo o existente) a una zona o a un proyecto, y quitarlo
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra tus datos. Puedes correrlo dos veces. Va después del archivo 15.
-- =====================================================================

-- 1) Materiales: código, marca y modelo ---------------------------------------------------
alter table public.materiales add column if not exists codigo text;
alter table public.materiales add column if not exists marca text;
alter table public.materiales add column if not exists modelo text;

with n as (select id, row_number() over (partition by proyecto_id order by ctid) as rn from public.materiales where codigo is null)
update public.materiales m set codigo = 'MAT-' || lpad(n.rn::text, 3, '0') from n where m.id = n.id;

create or replace function public.al_codigo_material() returns trigger language plpgsql as
$$
begin
  if new.codigo is null or btrim(new.codigo) = '' then
    select 'MAT-' || lpad((coalesce(max(substring(codigo from 5)::int), 0) + 1)::text, 3, '0') into new.codigo
      from public.materiales where proyecto_id = new.proyecto_id and codigo ~ '^MAT-[0-9]+$';
  end if;
  return new;
end $$;
drop trigger if exists t_codigo_material on public.materiales;
create trigger t_codigo_material before insert on public.materiales for each row execute function public.al_codigo_material();
create unique index if not exists u_materiales_codigo on public.materiales (proyecto_id, codigo);

-- 2) Almacén "Vehículo / técnico" en cada proyecto -----------------------------------------
insert into public.almacenes(proyecto_id, nombre, tipo)
select p.id, 'Vehículo / técnico', 'vehiculo' from public.proyectos p
where not exists (select 1 from public.almacenes a where a.proyecto_id = p.id and a.tipo = 'vehiculo');

create or replace function public.al_crear_proyecto() returns trigger language plpgsql security definer set search_path = public as
$$
begin
  insert into public.almacenes(proyecto_id, nombre, tipo) values (new.id, 'Almacén central', 'central'), (new.id, 'Vehículo / técnico', 'vehiculo');
  return new;
end $$;

-- 3) Compra de material con el precio realmente pagado ---------------------------------------
--    Entra al almacén elegido, queda anotada con ese precio y el costo del material pasa a ser el promedio
--    ponderado entre lo que ya había y lo que se compró.
create or replace function public.registrar_compra(p_material uuid, p_almacen uuid, p_cantidad numeric, p_precio numeric, p_proveedor text default null, p_ref text default null) returns void
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
  insert into public.movimientos(proyecto_id, tipo, material_id, almacen_destino, cantidad, costo_unitario, proveedor, referencia)
  values (m.proyecto_id, 'ENTRADA', p_material, p_almacen, p_cantidad, p_precio, nullif(btrim(coalesce(p_proveedor, '')), ''), nullif(btrim(coalesce(p_ref, '')), ''));
  perform public.auditar(m.proyecto_id, 'COMPRA', 'materiales', p_material, jsonb_build_object('cantidad', p_cantidad, 'precio', p_precio, 'costo_nuevo', v_nuevo));
end $$;

-- 4) Socios: agregar (nuevo o existente) a una zona o a un proyecto, y quitar -----------------------------
--    A una zona: ve el proyecto de la zona y participa en sus utilidades con ese porcentaje.
--    A un proyecto: ve todas sus zonas (sin porcentaje).
create or replace function public.agregar_socio(p jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare
  v_user uuid := nullif(p ->> 'user_id', '')::uuid; v_zona uuid := nullif(p ->> 'zona_id', '')::uuid; v_proy uuid := nullif(p ->> 'proyecto_id', '')::uuid;
  f public.profiles%rowtype; z public.zonas%rowtype; v_pct numeric := coalesce(nullif(p ->> 'porcentaje', '')::numeric, 0); v_nom text;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede agregar socios'; end if;
  select * into f from public.profiles where id = v_user;
  if not found then raise exception 'No se encontró la cuenta del usuario'; end if;
  if f.rol = 'pendiente' then
    update public.profiles set rol = 'socio', activo = true, nombre = coalesce(nullif(btrim(coalesce(p ->> 'nombre', '')), ''), nombre) where id = v_user;
  elsif f.rol <> 'socio' then raise exception 'Ese usuario no es socio (su rol es %)', f.rol;
  end if;
  v_nom := coalesce(nullif(btrim(coalesce(p ->> 'nombre', '')), ''), nullif(f.nombre, ''), f.email);

  if v_zona is not null then
    select * into z from public.zonas where id = v_zona and eliminado_en is null;
    if not found then raise exception 'No se encontró la zona'; end if;
    v_proy := z.proyecto_id;
  elsif v_proy is null then raise exception 'Elige una zona o un proyecto';
  else
    perform 1 from public.proyectos where id = v_proy and eliminado_en is null;
    if not found then raise exception 'No se encontró el proyecto'; end if;
  end if;

  insert into public.proyecto_usuarios(proyecto_id, user_id) values (v_proy, v_user) on conflict do nothing;
  if v_zona is not null then
    if v_pct < 0 or v_pct > 100 then raise exception 'El porcentaje debe estar entre 0 y 100'; end if;
    insert into public.zona_socios(zona_id, user_id, porcentaje) values (v_zona, v_user, v_pct)
    on conflict (zona_id, user_id) do update set porcentaje = excluded.porcentaje;
    insert into public.historial_red(proyecto_id, zona_id, fecha, tipo, descripcion) values (v_proy, v_zona, current_date, 'Socio agregado', v_nom || ' participa con ' || v_pct || '% en la zona ' || z.nombre);
  end if;
  perform public.auditar(v_proy, 'SOCIO_AGREGAR', 'proyecto_usuarios', v_user, jsonb_build_object('zona', v_zona, 'porcentaje', v_pct));
end $$;

-- Quitar a un socio de una zona (deja de participar en sus utilidades) o de un proyecto (deja de verlo y de participar en sus zonas)
create or replace function public.quitar_socio(p_user uuid, p_zona uuid default null, p_proyecto uuid default null) returns void
language plpgsql security definer set search_path = public as
$$
declare z public.zonas%rowtype; v_nom text; v_proy uuid;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede quitar socios'; end if;
  select coalesce(nullif(nombre, ''), email) into v_nom from public.profiles where id = p_user;
  if v_nom is null then raise exception 'No se encontró al socio'; end if;
  if p_zona is not null then
    select * into z from public.zonas where id = p_zona; if not found then raise exception 'No se encontró la zona'; end if;
    delete from public.zona_socios where zona_id = p_zona and user_id = p_user;
    insert into public.historial_red(proyecto_id, zona_id, fecha, tipo, descripcion) values (z.proyecto_id, z.id, current_date, 'Socio quitado', v_nom || ' ya no participa en la zona ' || z.nombre);
    v_proy := z.proyecto_id;
  elsif p_proyecto is not null then
    delete from public.zona_socios where user_id = p_user and zona_id in (select id from public.zonas where proyecto_id = p_proyecto);
    delete from public.proyecto_usuarios where user_id = p_user and proyecto_id = p_proyecto;
    v_proy := p_proyecto;
  else raise exception 'Elige una zona o un proyecto';
  end if;
  perform public.auditar(v_proy, 'SOCIO_QUITAR', 'proyecto_usuarios', p_user, jsonb_build_object('zona', p_zona, 'proyecto', p_proyecto));
end $$;

-- 5) Permisos ----------------------------------------------------------------------------------------------
revoke all on function public.registrar_compra(uuid, uuid, numeric, numeric, text, text) from public, anon;
revoke all on function public.agregar_socio(jsonb) from public, anon;
revoke all on function public.quitar_socio(uuid, uuid, uuid) from public, anon;
grant execute on function public.registrar_compra(uuid, uuid, numeric, numeric, text, text) to authenticated;
grant execute on function public.agregar_socio(jsonb) to authenticated;
grant execute on function public.quitar_socio(uuid, uuid, uuid) to authenticated;
