-- =====================================================================
--  VORTEX · 27 · AGENDA DE DIRIGENTES (contactos, llamadas y recordatorios)
--   · Cada dirigente anotado es PRIVADO de quien lo creó. Solo lo ven las personas con las que él decida compartirlo.
--   · Se puede compartir "solo para ver" o "para ver y anotar llamadas y recordatorios".
--   · Lo exige la base de datos: ni siquiera el administrador ve lo que otra cuenta no le compartió.
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra nada. Puedes correrlo dos veces. Va después del archivo 26.
-- =====================================================================

-- 1) Tablas ---------------------------------------------------------------------------------------------------
create table if not exists public.agenda_contactos (
  id uuid primary key default gen_random_uuid(),
  creado_por uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  nombre text not null,
  telefono text, telefono2 text,
  cargo text,                 -- por ejemplo: Presidente, Secretario, Dirigente
  organizacion text,          -- por ejemplo: OTB, junta vecinal, sindicato
  zona text,                  -- zona o comunidad
  ubicacion text,             -- dirección o referencia
  lat numeric, lng numeric,
  estado text not null default 'Nuevo' check (estado in ('Nuevo', 'Contactado', 'Reunión agendada', 'Interesado', 'Negociando', 'Cerrado', 'Descartado')),
  notas text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists i_agenda_contactos_dueno on public.agenda_contactos (creado_por, actualizado_en desc);

create table if not exists public.agenda_llamadas (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid not null references public.agenda_contactos(id) on delete cascade,
  fecha timestamptz not null default now(),
  resultado text not null default 'Contestó' check (resultado in ('Contestó', 'No contestó', 'Ocupado', 'Número equivocado', 'Reunión acordada', 'Pidió que llame después')),
  nota text,
  creado_por uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  creado_en timestamptz not null default now()
);
create index if not exists i_agenda_llamadas_contacto on public.agenda_llamadas (contacto_id, fecha desc);

create table if not exists public.agenda_recordatorios (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid references public.agenda_contactos(id) on delete cascade,   -- vacío = recordatorio general, solo de quien lo creó
  tipo text not null default 'Llamar' check (tipo in ('Llamar', 'Viaje o reunión', 'Otro')),
  titulo text not null,
  fecha_hora timestamptz not null,
  lugar text, nota text,
  hecho boolean not null default false, hecho_en timestamptz,
  creado_por uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  creado_en timestamptz not null default now()
);
create index if not exists i_agenda_recordatorios on public.agenda_recordatorios (creado_por, hecho, fecha_hora);
create index if not exists i_agenda_recordatorios_contacto on public.agenda_recordatorios (contacto_id);

create table if not exists public.agenda_compartido (
  contacto_id uuid not null references public.agenda_contactos(id) on delete cascade,
  usuario_id uuid not null references public.profiles(id) on delete cascade,
  puede_editar boolean not null default false,
  creado_en timestamptz not null default now(),
  primary key (contacto_id, usuario_id)
);

-- 2) Funciones de permiso (se saltan la seguridad por filas para no entrar en ciclos) ----------------------------
create or replace function public.agenda_usuario_activo() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and activo and rol <> 'pendiente') $$;

-- ¿Me compartieron este contacto? (solo mira la tabla de compartidos; así el dueño no depende de esta consulta)
create or replace function public.agenda_comparte(p_contacto uuid, p_editar boolean) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.agenda_compartido s where s.contacto_id = p_contacto and s.usuario_id = auth.uid() and (not p_editar or s.puede_editar)) $$;

create or replace function public.agenda_es_dueno(p_contacto uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.agenda_contactos where id = p_contacto and creado_por = auth.uid()) and public.agenda_usuario_activo() $$;

create or replace function public.agenda_puede_ver(p_contacto uuid) returns boolean language sql stable security definer set search_path = public as
$$ select public.agenda_usuario_activo() and exists (
     select 1 from public.agenda_contactos c where c.id = p_contacto and (c.creado_por = auth.uid()
       or exists (select 1 from public.agenda_compartido s where s.contacto_id = c.id and s.usuario_id = auth.uid()))) $$;

create or replace function public.agenda_puede_editar(p_contacto uuid) returns boolean language sql stable security definer set search_path = public as
$$ select public.agenda_usuario_activo() and exists (
     select 1 from public.agenda_contactos c where c.id = p_contacto and (c.creado_por = auth.uid()
       or exists (select 1 from public.agenda_compartido s where s.contacto_id = c.id and s.usuario_id = auth.uid() and s.puede_editar))) $$;

-- 3) Seguridad por filas -----------------------------------------------------------------------------------------
alter table public.agenda_contactos enable row level security;
drop policy if exists p_ver on public.agenda_contactos;     create policy p_ver on public.agenda_contactos for select to authenticated using (public.agenda_usuario_activo() and (creado_por = auth.uid() or public.agenda_comparte(id, false)));
drop policy if exists p_crear on public.agenda_contactos;   create policy p_crear on public.agenda_contactos for insert to authenticated with check (creado_por = auth.uid() and public.agenda_usuario_activo());
drop policy if exists p_editar on public.agenda_contactos;  create policy p_editar on public.agenda_contactos for update to authenticated using (public.agenda_usuario_activo() and (creado_por = auth.uid() or public.agenda_comparte(id, true))) with check (public.agenda_usuario_activo() and (creado_por = auth.uid() or public.agenda_comparte(id, true)));
drop policy if exists p_borrar on public.agenda_contactos;  create policy p_borrar on public.agenda_contactos for delete to authenticated using (creado_por = auth.uid() and public.agenda_usuario_activo());

alter table public.agenda_llamadas enable row level security;
drop policy if exists p_ver on public.agenda_llamadas;      create policy p_ver on public.agenda_llamadas for select to authenticated using (public.agenda_puede_ver(contacto_id));
drop policy if exists p_crear on public.agenda_llamadas;    create policy p_crear on public.agenda_llamadas for insert to authenticated with check (creado_por = auth.uid() and public.agenda_puede_editar(contacto_id));
drop policy if exists p_editar on public.agenda_llamadas;   create policy p_editar on public.agenda_llamadas for update to authenticated using (creado_por = auth.uid() or public.agenda_es_dueno(contacto_id)) with check (creado_por = auth.uid() or public.agenda_es_dueno(contacto_id));
drop policy if exists p_borrar on public.agenda_llamadas;   create policy p_borrar on public.agenda_llamadas for delete to authenticated using (creado_por = auth.uid() or public.agenda_es_dueno(contacto_id));

alter table public.agenda_recordatorios enable row level security;
drop policy if exists p_ver on public.agenda_recordatorios;     create policy p_ver on public.agenda_recordatorios for select to authenticated using (creado_por = auth.uid() or (contacto_id is not null and public.agenda_puede_ver(contacto_id)));
drop policy if exists p_crear on public.agenda_recordatorios;   create policy p_crear on public.agenda_recordatorios for insert to authenticated with check (creado_por = auth.uid() and (contacto_id is null or public.agenda_puede_editar(contacto_id)));
drop policy if exists p_editar on public.agenda_recordatorios;  create policy p_editar on public.agenda_recordatorios for update to authenticated using (creado_por = auth.uid() or (contacto_id is not null and public.agenda_puede_editar(contacto_id))) with check (creado_por = auth.uid() or (contacto_id is not null and public.agenda_puede_editar(contacto_id)));
drop policy if exists p_borrar on public.agenda_recordatorios;  create policy p_borrar on public.agenda_recordatorios for delete to authenticated using (creado_por = auth.uid() or (contacto_id is not null and public.agenda_es_dueno(contacto_id)));

alter table public.agenda_compartido enable row level security;
drop policy if exists p_ver on public.agenda_compartido;     create policy p_ver on public.agenda_compartido for select to authenticated using (usuario_id = auth.uid() or public.agenda_es_dueno(contacto_id));
drop policy if exists p_crear on public.agenda_compartido;   create policy p_crear on public.agenda_compartido for insert to authenticated with check (public.agenda_es_dueno(contacto_id) and usuario_id <> auth.uid());
drop policy if exists p_editar on public.agenda_compartido;  create policy p_editar on public.agenda_compartido for update to authenticated using (public.agenda_es_dueno(contacto_id)) with check (public.agenda_es_dueno(contacto_id));
drop policy if exists p_borrar on public.agenda_compartido;  create policy p_borrar on public.agenda_compartido for delete to authenticated using (public.agenda_es_dueno(contacto_id) or usuario_id = auth.uid());

-- 4) Orden y protección: el dueño no se puede cambiar, y la fecha de actualización se mueve sola ------------------
create or replace function public.agenda_antes_de_actualizar() returns trigger language plpgsql as
$$ begin new.creado_por := old.creado_por; new.actualizado_en := now(); return new; end $$;
drop trigger if exists t_agenda_actualizar on public.agenda_contactos;
create trigger t_agenda_actualizar before update on public.agenda_contactos for each row execute function public.agenda_antes_de_actualizar();

create or replace function public.agenda_actividad() returns trigger language plpgsql security definer set search_path = public as
$$ begin if new.contacto_id is not null then update public.agenda_contactos set actualizado_en = now() where id = new.contacto_id; end if; return new; end $$;
drop trigger if exists t_agenda_llamada on public.agenda_llamadas;
create trigger t_agenda_llamada after insert on public.agenda_llamadas for each row execute function public.agenda_actividad();
drop trigger if exists t_agenda_recordatorio on public.agenda_recordatorios;
create trigger t_agenda_recordatorio after insert on public.agenda_recordatorios for each row execute function public.agenda_actividad();

-- 5) A quién se puede compartir: personas activas de tus mismos proyectos (y quienes ya comparten contigo) ------------
create or replace function public.agenda_personas() returns table (id uuid, nombre text, email text, rol text)
language sql stable security definer set search_path = public as
$$ select p.id, p.nombre, p.email, p.rol from public.profiles p
   where public.agenda_usuario_activo() and p.activo and p.rol <> 'pendiente' and p.id <> auth.uid()
     and (public.es_admin() or p.rol = 'admin'
          or exists (select 1 from public.proyecto_usuarios a join public.proyecto_usuarios b on b.proyecto_id = a.proyecto_id where a.user_id = auth.uid() and b.user_id = p.id)
          or p.id in (select c.creado_por from public.agenda_contactos c join public.agenda_compartido s on s.contacto_id = c.id where s.usuario_id = auth.uid())
          or p.id in (select s.usuario_id from public.agenda_compartido s join public.agenda_contactos c on c.id = s.contacto_id where c.creado_por = auth.uid()))
   order by p.nombre $$;

-- 6) Permisos ---------------------------------------------------------------------------------------------------------
revoke all on public.agenda_contactos, public.agenda_llamadas, public.agenda_recordatorios, public.agenda_compartido from anon;
grant select, insert, update, delete on public.agenda_contactos, public.agenda_llamadas, public.agenda_recordatorios, public.agenda_compartido to authenticated;
revoke all on function public.agenda_personas() from public, anon;
grant execute on function public.agenda_personas() to authenticated;
grant execute on function public.agenda_usuario_activo(), public.agenda_comparte(uuid, boolean), public.agenda_es_dueno(uuid), public.agenda_puede_ver(uuid), public.agenda_puede_editar(uuid) to authenticated;
