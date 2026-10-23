-- =====================================================================
--  VORTEX · 18 · CONFIGURACIÓN (usuarios, roles y permisos, socios y proyectos)
--   · Roles con permisos por módulo (Ver, Crear, Editar, Eliminar) y roles propios
--   · Zonas asignadas a cada usuario (la base de datos le oculta las demás zonas)
--   · Guardar usuario y registrar socio en un solo paso
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra tus datos y los usuarios que ya tienes siguen igual. Puedes correrlo dos veces. Va después del archivo 17.
-- =====================================================================

-- 1) Roles ---------------------------------------------------------------------------------------------
--    "base" es el rol del sistema en el que se apoya la base de datos; los roles propios que crees se apoyan en uno de ellos.
create table if not exists public.roles (
  clave text primary key,
  nombre text not null,
  base text not null check (base in ('admin','socio','supervisor','tecnico','cobranzas','almacen','financiero')),
  activo boolean not null default true,
  sistema boolean not null default false,
  creado_en timestamptz not null default now()
);
insert into public.roles(clave, nombre, base, sistema) values
  ('admin', 'Administrador principal', 'admin', true), ('socio', 'Socio', 'socio', true), ('supervisor', 'Supervisor técnico', 'supervisor', true),
  ('tecnico', 'Técnico', 'tecnico', true), ('cobranzas', 'Cobranzas', 'cobranzas', true), ('almacen', 'Almacén', 'almacen', true), ('financiero', 'Financiero', 'financiero', true)
on conflict (clave) do nothing;

create table if not exists public.roles_permisos (
  rol_clave text not null references public.roles(clave) on delete cascade,
  modulo text not null,
  ver boolean not null default false, crear boolean not null default false, editar boolean not null default false, eliminar boolean not null default false,
  primary key (rol_clave, modulo)
);

alter table public.profiles add column if not exists rol_clave text;
update public.profiles set rol_clave = rol where rol_clave is null and rol <> 'pendiente';

do $$
declare t text;
begin
  foreach t in array array['roles','roles_permisos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists p_ver on public.%I', t);
    execute format('create policy p_ver on public.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists p_admin on public.%I', t);
    execute format('create policy p_admin on public.%I for all to authenticated using (public.es_admin()) with check (public.es_admin())', t);
  end loop;
end $$;

-- 2) Zonas de cada usuario ------------------------------------------------------------------------------
--    Si un usuario no tiene zonas marcadas en un proyecto, ve todas las zonas de ese proyecto (como hasta ahora).
create table if not exists public.usuario_zonas (
  user_id uuid not null references public.profiles(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  primary key (user_id, zona_id)
);
alter table public.usuario_zonas enable row level security;
drop policy if exists p_propio on public.usuario_zonas;
create policy p_propio on public.usuario_zonas for select to authenticated using (user_id = auth.uid() or public.es_admin());
drop policy if exists p_admin on public.usuario_zonas;
create policy p_admin on public.usuario_zonas for all to authenticated using (public.es_admin()) with check (public.es_admin());

create or replace function public.zona_permitida(z uuid) returns boolean language sql stable security definer set search_path = public as
$$ select public.es_admin()
       or not exists (select 1 from public.usuario_zonas uz join public.zonas zz on zz.id = uz.zona_id
                      where uz.user_id = auth.uid() and zz.proyecto_id = (select proyecto_id from public.zonas where id = z))
       or exists (select 1 from public.usuario_zonas where user_id = auth.uid() and zona_id = z) $$;

-- La base de datos oculta lo de las zonas que el usuario no tiene asignadas
do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'zona_id' and tb.table_type = 'BASE TABLE' and c.table_name <> 'usuario_zonas'
  loop
    execute format('drop policy if exists p_zona_usuario on public.%I', t);
    execute format('create policy p_zona_usuario on public.%I as restrictive for all to authenticated using (zona_id is null or public.zona_permitida(zona_id))', t);
  end loop;
end $$;
drop policy if exists p_zona_usuario on public.zonas;
create policy p_zona_usuario on public.zonas as restrictive for all to authenticated using (public.zona_permitida(id));

-- 3) Guardar un usuario: nombre, teléfono, rol, estado, proyectos y zonas -------------------------------------
create or replace function public.admin_guardar_usuario2(p jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare
  v_user uuid := (p ->> 'user_id')::uuid; v_clave text := coalesce(nullif(p ->> 'rol_clave', ''), 'pendiente'); r public.roles%rowtype;
  v_base text; v_activo boolean := coalesce((p ->> 'activo')::boolean, true);
  v_proys uuid[] := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p -> 'proyectos', '[]'::jsonb)) x), '{}');
  v_zonas uuid[] := coalesce((select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p -> 'zonas', '[]'::jsonb)) x), '{}');
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede hacer esto'; end if;
  if v_clave = 'pendiente' then v_base := 'pendiente';
  else
    select * into r from public.roles where clave = v_clave;
    if not found then raise exception 'Rol no válido'; end if;
    v_base := r.base;
  end if;
  if v_user = auth.uid() and (not v_activo or v_base <> 'admin') then raise exception 'No puedes quitarte a ti mismo el acceso de administrador'; end if;
  update public.profiles set nombre = coalesce(nullif(btrim(coalesce(p ->> 'nombre', '')), ''), nombre), telefono = case when p ? 'telefono' then nullif(btrim(coalesce(p ->> 'telefono', '')), '') else telefono end,
         rol = v_base, rol_clave = case when v_base = 'pendiente' then null else v_clave end, activo = v_activo where id = v_user;
  if not found then raise exception 'No se encontró al usuario'; end if;
  delete from public.proyecto_usuarios where user_id = v_user;
  delete from public.usuario_zonas where user_id = v_user;
  if v_base not in ('admin', 'pendiente') then
    insert into public.proyecto_usuarios(proyecto_id, user_id) select x, v_user from unnest(v_proys) x on conflict do nothing;
    insert into public.usuario_zonas(user_id, zona_id) select v_user, z.id from public.zonas z where z.id = any(v_zonas) and z.proyecto_id = any(v_proys) on conflict do nothing;
  end if;
end $$;

-- 4) Registrar un socio (la cuenta ya creada) en uno o varios proyectos, o en un proyecto nuevo ------------------
create or replace function public.registrar_socio(p jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare
  v_user uuid := (p ->> 'user_id')::uuid; v_nuevo text := nullif(btrim(coalesce(p ->> 'proyecto_nuevo', '')), ''); v_id uuid; x text;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede registrar socios'; end if;
  update public.profiles set rol = 'socio', rol_clave = 'socio', activo = true, nombre = coalesce(nullif(btrim(coalesce(p ->> 'nombre', '')), ''), nombre), telefono = nullif(btrim(coalesce(p ->> 'telefono', '')), '')
  where id = v_user and rol in ('pendiente', 'socio');
  if not found then raise exception 'Esa cuenta ya existe con otro rol'; end if;
  if jsonb_typeof(p -> 'proyectos') = 'array' then
    for x in select jsonb_array_elements_text(p -> 'proyectos') loop
      insert into public.proyecto_usuarios(proyecto_id, user_id) select pr.id, v_user from public.proyectos pr where pr.id = x::uuid and pr.eliminado_en is null on conflict do nothing;
    end loop;
  end if;
  if v_nuevo is not null then
    if exists (select 1 from public.proyectos where lower(nombre) = lower(v_nuevo) and eliminado_en is null) then raise exception 'Ya existe un proyecto llamado "%"', v_nuevo; end if;
    insert into public.proyectos(nombre) values (v_nuevo) returning id into v_id;
    insert into public.proyecto_usuarios(proyecto_id, user_id) values (v_id, v_user) on conflict do nothing;
  end if;
end $$;

-- Activar o desactivar a un usuario (sin tocar sus proyectos ni zonas)
create or replace function public.usuario_activar(p_user uuid, p_activo boolean) returns void
language plpgsql security definer set search_path = public as
$$
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede hacer esto'; end if;
  if p_user = auth.uid() and not p_activo then raise exception 'No puedes desactivarte a ti mismo'; end if;
  update public.profiles set activo = p_activo where id = p_user;
  if not found then raise exception 'No se encontró al usuario'; end if;
end $$;

-- 5) Permisos ------------------------------------------------------------------------------------------------------
revoke all on public.roles, public.roles_permisos, public.usuario_zonas from anon;
grant select on public.roles, public.roles_permisos, public.usuario_zonas to authenticated;
grant insert, update on public.roles, public.roles_permisos to authenticated;
grant insert, delete on public.usuario_zonas to authenticated;
revoke all on function public.admin_guardar_usuario2(jsonb) from public, anon;
revoke all on function public.registrar_socio(jsonb) from public, anon;
revoke all on function public.usuario_activar(uuid, boolean) from public, anon;
grant execute on function public.admin_guardar_usuario2(jsonb) to authenticated;
grant execute on function public.registrar_socio(jsonb) to authenticated;
grant execute on function public.usuario_activar(uuid, boolean) to authenticated;
