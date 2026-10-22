-- =====================================================================
--  VORTEX · 4 · SIMULADOR Y PRESUPUESTO POR ZONA
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra ni cambia nada de lo que ya tienes. Si lo corres
--  dos veces, no pasa nada.
-- =====================================================================

-- Simulaciones guardadas (el detalle del cálculo se guarda en "datos")
create table if not exists public.simulaciones (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid references public.zonas(id) on delete set null,
  nombre text not null,
  datos jsonb not null default '{}'::jsonb,
  creado_por uuid default auth.uid(),
  creado_en timestamptz not null default now()
);

-- Líneas del presupuesto de cada zona
create table if not exists public.presupuesto_lineas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  tipo text not null check (tipo in ('INVERSION', 'GASTO_OPERATIVO')),
  categoria text not null,
  concepto text not null,
  cantidad numeric(12,2) not null default 1 check (cantidad >= 0),
  monto_unitario numeric(12,2) not null default 0 check (monto_unitario >= 0),
  periodo text not null default 'unico' check (periodo in ('unico', 'mensual')),
  origen text,
  creado_en timestamptz not null default now()
);
create index if not exists i_presupuesto_zona on public.presupuesto_lineas (zona_id);
create index if not exists i_simulaciones_proyecto on public.simulaciones (proyecto_id);

-- El proyecto de cada línea se toma de su zona (no se puede falsificar)
drop trigger if exists t_heredar on public.presupuesto_lineas;
create trigger t_heredar before insert or update of zona_id on public.presupuesto_lineas
  for each row execute function public.heredar_proyecto('zonas', 'zona_id');

-- Seguridad: solo administración, socios y financieros
alter table public.simulaciones enable row level security;
drop policy if exists p_fin on public.simulaciones;
create policy p_fin on public.simulaciones for all to authenticated
  using (public.puede_finanzas(proyecto_id))
  with check (
    public.puede_finanzas(proyecto_id)
    and (zona_id is null or exists (select 1 from public.zonas z where z.id = simulaciones.zona_id and z.proyecto_id = simulaciones.proyecto_id))
  );

alter table public.presupuesto_lineas enable row level security;
drop policy if exists p_fin on public.presupuesto_lineas;
create policy p_fin on public.presupuesto_lineas for all to authenticated
  using (public.puede_finanzas(proyecto_id))
  with check (public.puede_finanzas(proyecto_id));

revoke all on public.simulaciones, public.presupuesto_lineas from anon;
grant select, insert, update, delete on public.simulaciones, public.presupuesto_lineas to authenticated;
