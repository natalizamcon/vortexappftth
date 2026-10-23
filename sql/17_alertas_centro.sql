-- =====================================================================
--  VORTEX · 17 · CENTRO DE ALERTAS (activas, historial, destinatarios y reglas)
--   · Quién recibe cada alerta (el administrador la cambia desde la pantalla)
--   · Alertas revisadas o resueltas, con nota, quién y cuándo
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra tus datos. Puedes correrlo dos veces. Va después del archivo 16.
-- =====================================================================

-- 1) Destinatarios: qué rol recibe cada tipo de alerta (el administrador siempre las recibe) ---------
create table if not exists public.alertas_reglas (
  tipo text not null,
  rol text not null check (rol in ('socio','financiero','cobranzas','supervisor','almacen')),
  activo boolean not null default true,
  primary key (tipo, rol)
);
alter table public.alertas_reglas enable row level security;
drop policy if exists p_ver on public.alertas_reglas;
create policy p_ver on public.alertas_reglas for select to authenticated using (true);
drop policy if exists p_admin on public.alertas_reglas;
create policy p_admin on public.alertas_reglas for all to authenticated using (public.es_admin()) with check (public.es_admin());

-- 2) Alertas revisadas o resueltas ---------------------------------------------------------------------
--    La firma es el texto de la alerta: si el problema cambia (por ejemplo, de 2 a 3 clientes con deuda), la alerta vuelve a aparecer.
create table if not exists public.alertas_estado (
  clave text primary key,
  proyecto_id uuid references public.proyectos(id) on delete cascade,
  zona_id uuid references public.zonas(id) on delete set null,
  tipo text not null, prioridad text, descripcion text, fecha_alerta date,
  firma text not null,
  estado text not null check (estado in ('REVISADA','RESUELTA')),
  nota text,
  usuario uuid default auth.uid(), usuario_nombre text,
  fecha timestamptz not null default now()
);
alter table public.alertas_estado enable row level security;
drop policy if exists p_ver on public.alertas_estado;
create policy p_ver on public.alertas_estado for select to authenticated using ((proyecto_id is null and public.es_admin()) or (proyecto_id is not null and public.puede_ver(proyecto_id)));
drop policy if exists p_proyecto_activo on public.alertas_estado;
create policy p_proyecto_activo on public.alertas_estado as restrictive for all to authenticated using (proyecto_id is null or public.proyecto_activo(proyecto_id));

create or replace function public.marcar_alerta(p jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare
  v_clave text := nullif(btrim(coalesce(p ->> 'clave', '')), ''); v_proy uuid := nullif(p ->> 'proyecto_id', '')::uuid; v_estado text := upper(coalesce(p ->> 'estado', ''));
  v_nom text;
begin
  if v_clave is null then raise exception 'Falta la alerta'; end if;
  if v_estado not in ('REVISADA', 'RESUELTA') then raise exception 'Estado no válido'; end if;
  if v_proy is null then
    if not public.es_admin() then raise exception 'No tienes permiso para esta alerta'; end if;
  elsif not public.puede_ver(v_proy) then raise exception 'No tienes permiso para esta alerta';
  end if;
  select coalesce(nullif(nombre, ''), email) into v_nom from public.profiles where id = auth.uid();
  insert into public.alertas_estado(clave, proyecto_id, zona_id, tipo, prioridad, descripcion, fecha_alerta, firma, estado, nota, usuario, usuario_nombre, fecha)
  values (v_clave, v_proy, nullif(p ->> 'zona_id', '')::uuid, coalesce(p ->> 'tipo', ''), p ->> 'prioridad', p ->> 'descripcion', nullif(p ->> 'fecha_alerta', '')::date,
          coalesce(p ->> 'firma', ''), v_estado, nullif(btrim(coalesce(p ->> 'nota', '')), ''), auth.uid(), v_nom, now())
  on conflict (clave) do update set proyecto_id = excluded.proyecto_id, zona_id = excluded.zona_id, tipo = excluded.tipo, prioridad = excluded.prioridad, descripcion = excluded.descripcion,
         fecha_alerta = excluded.fecha_alerta, firma = excluded.firma, estado = excluded.estado, nota = excluded.nota, usuario = excluded.usuario, usuario_nombre = excluded.usuario_nombre, fecha = now();
  if v_proy is not null then perform public.auditar(v_proy, 'ALERTA_' || v_estado, 'alertas_estado', null, jsonb_build_object('clave', v_clave, 'nota', p ->> 'nota')); end if;
end $$;

-- Volver a poner una alerta como activa (se quita de la lista de revisadas y resueltas)
create or replace function public.reabrir_alerta(p_clave text) returns void
language plpgsql security definer set search_path = public as
$$
declare e public.alertas_estado%rowtype;
begin
  select * into e from public.alertas_estado where clave = p_clave;
  if not found then return; end if;
  if e.proyecto_id is null then
    if not public.es_admin() then raise exception 'No tienes permiso para esta alerta'; end if;
  elsif not public.puede_ver(e.proyecto_id) then raise exception 'No tienes permiso para esta alerta';
  end if;
  delete from public.alertas_estado where clave = p_clave;
  if e.proyecto_id is not null then perform public.auditar(e.proyecto_id, 'ALERTA_REABIERTA', 'alertas_estado', null, jsonb_build_object('clave', p_clave)); end if;
end $$;

-- 3) Permisos ------------------------------------------------------------------------------------------------
revoke all on public.alertas_reglas, public.alertas_estado from anon;
grant select on public.alertas_reglas, public.alertas_estado to authenticated;
grant insert, update on public.alertas_reglas to authenticated;
revoke all on function public.marcar_alerta(jsonb) from public, anon;
revoke all on function public.reabrir_alerta(text) from public, anon;
grant execute on function public.marcar_alerta(jsonb) to authenticated;
grant execute on function public.reabrir_alerta(text) to authenticated;
