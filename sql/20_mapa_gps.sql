-- =====================================================================
--  VORTEX · 20 · MAPA GPS (trazados importados de KML, KMZ y GPX)
--   · Guarda los recorridos de fibra (troncales, rutas) con su largo en metros
--   · Se pueden ligar a una troncal
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra tus datos. Puedes correrlo dos veces. Va después del archivo 19.
-- =====================================================================

create table if not exists public.trazados_gps (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  nombre text not null,
  tipo text not null default 'Troncal' check (tipo in ('Troncal','Ruta','Otro')),
  troncal_id uuid references public.troncales(id) on delete set null,
  coords jsonb not null,
  longitud_m numeric(12,1) not null default 0 check (longitud_m >= 0),
  origen text,
  creado_por uuid default auth.uid(), creado_en timestamptz not null default now(),
  eliminado_en timestamptz, eliminado_por uuid, eliminado_motivo text
);
create index if not exists i_trazados_zona on public.trazados_gps (zona_id);

drop trigger if exists t_heredar on public.trazados_gps;
create trigger t_heredar before insert or update of zona_id on public.trazados_gps for each row execute function public.heredar_proyecto('zonas', 'zona_id');

-- Papelera: el trazado se puede mandar y recuperar como todo lo demás
create or replace function public.papelera_tablas() returns text[] language sql immutable as
$$ select array['proyectos','zonas','costos_fijos','equipos_serie','fin_movimientos','fondos_movimientos',
                'historial_red','materiales','pagos_personal','presupuesto_lineas','simulaciones','inversores',
                'olts','troncales','fusiones','postes','naps',
                'gastos_empresa','costos_compartidos','fondos_empresa','compras_empresa','costos_variables',
                'ordenes_trabajo','diario_zona','trazados_gps']::text[] $$;

alter table public.trazados_gps enable row level security;
drop policy if exists p_ver on public.trazados_gps;
create policy p_ver on public.trazados_gps for select to authenticated using (public.puede_ver(proyecto_id));
drop policy if exists p_esc on public.trazados_gps;
create policy p_esc on public.trazados_gps for all to authenticated using (public.puede_escribir(proyecto_id)) with check (public.puede_escribir(proyecto_id));
drop policy if exists p_papelera on public.trazados_gps;
create policy p_papelera on public.trazados_gps as restrictive for all to authenticated using (eliminado_en is null);
drop policy if exists p_proyecto_activo on public.trazados_gps;
create policy p_proyecto_activo on public.trazados_gps as restrictive for all to authenticated using (public.proyecto_activo(proyecto_id));
drop policy if exists p_zona_activa on public.trazados_gps;
create policy p_zona_activa on public.trazados_gps as restrictive for all to authenticated using (public.zona_activa(zona_id));
drop policy if exists p_zona_usuario on public.trazados_gps;
create policy p_zona_usuario on public.trazados_gps as restrictive for all to authenticated using (zona_id is null or public.zona_permitida(zona_id));

revoke all on public.trazados_gps from anon;
grant select, insert, update on public.trazados_gps to authenticated;
revoke delete on public.trazados_gps from authenticated;
