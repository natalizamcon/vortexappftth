-- =====================================================================
--  VORTEX · 28 · HISTORIAL COMPLETO DE CADA DIRIGENTE
--   · Además de las llamadas y los recordatorios, guarda los cambios: de estado, de datos y a quién se compartió.
--   · Solo lo ven quienes pueden ver ese dirigente (misma privacidad de la Agenda). No se puede editar ni borrar.
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra nada. Puedes correrlo dos veces. Va después del archivo 27.
--  (Si no lo corres, la Agenda sigue funcionando: el historial solo mostrará llamadas y recordatorios.)
-- =====================================================================

create table if not exists public.agenda_eventos (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid not null references public.agenda_contactos(id) on delete cascade,
  tipo text not null check (tipo in ('Estado', 'Datos', 'Compartido', 'Recordatorio')),
  detalle text,
  creado_por uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  creado_en timestamptz not null default now()
);
create index if not exists i_agenda_eventos on public.agenda_eventos (contacto_id, creado_en desc);

alter table public.agenda_eventos enable row level security;
drop policy if exists p_ver on public.agenda_eventos;   create policy p_ver on public.agenda_eventos for select to authenticated using (public.agenda_puede_ver(contacto_id));
drop policy if exists p_crear on public.agenda_eventos; create policy p_crear on public.agenda_eventos for insert to authenticated with check (creado_por = auth.uid() and public.agenda_puede_editar(contacto_id));

revoke all on public.agenda_eventos from anon;
grant select, insert on public.agenda_eventos to authenticated;
