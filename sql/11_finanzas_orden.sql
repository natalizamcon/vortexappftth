-- =====================================================================
--  VORTEX · 11 · FINANZAS ORDENADA: gráficos por zona y compras de la empresa
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra ni cambia tus datos. Puedes correrlo dos veces.
-- =====================================================================

-- 1) Resumen por zona y por mes (para los gráficos de Rentabilidad e Ingresos y gastos)
create or replace view public.v_resumen_zona_mes with (security_invoker = true) as
select proyecto_id, zona_id, mes,
       sum(ingresos_servicio) as ingresos_servicio, sum(cobrado) as cobrado, sum(otros_ingresos) as otros_ingresos,
       sum(gastos_operativos) as gastos_operativos, sum(inversion) as inversion
from (
  select g.proyecto_id, c.zona_id, date_trunc('month', g.periodo)::date as mes,
         g.monto as ingresos_servicio, 0::numeric as cobrado, 0::numeric as otros_ingresos, 0::numeric as gastos_operativos, 0::numeric as inversion
    from public.cargos g join public.clientes c on c.id = g.cliente_id
  union all
  select p.proyecto_id, c.zona_id, date_trunc('month', p.fecha)::date, 0::numeric, p.monto, 0::numeric, 0::numeric, 0::numeric
    from public.pagos p join public.clientes c on c.id = p.cliente_id where not p.anulado
  union all
  select f.proyecto_id, f.zona_id, date_trunc('month', f.fecha)::date, 0::numeric, 0::numeric,
         case when f.tipo = 'INGRESO' then f.monto else 0 end,
         case when f.tipo = 'GASTO_OPERATIVO' then f.monto else 0 end,
         case when f.tipo = 'INVERSION' then f.monto else 0 end
    from public.fin_movimientos f
) x
group by proyecto_id, zona_id, mes;

-- 2) Compras de la empresa: herramientas y equipos de toda la empresa (no pertenecen a ninguna zona)
create table if not exists public.compras_empresa (
  id uuid primary key default gen_random_uuid(),
  articulo text not null,
  categoria text not null default 'Herramienta',
  cantidad int not null default 1 check (cantidad >= 1),
  costo_unitario numeric(12,2) not null default 0 check (costo_unitario >= 0),
  fecha date not null default current_date,
  proveedor text,
  ubicacion text,
  estado text not null default 'En uso' check (estado in ('En uso','Almacén','En mantenimiento')),
  foto_path text,
  creado_por uuid default auth.uid(), creado_en timestamptz not null default now(),
  eliminado_en timestamptz, eliminado_por uuid, eliminado_motivo text
);

create or replace function public.papelera_tablas() returns text[] language sql immutable as
$$ select array['proyectos','zonas','costos_fijos','equipos_serie','fin_movimientos','fondos_movimientos',
                'historial_red','materiales','pagos_personal','presupuesto_lineas','simulaciones','inversores',
                'olts','troncales','fusiones','postes',
                'gastos_empresa','costos_compartidos','fondos_empresa','compras_empresa']::text[] $$;

create or replace function public.papelera_tablas_empresa() returns text[] language sql immutable as
$$ select array['gastos_empresa','costos_compartidos','fondos_empresa','compras_empresa']::text[] $$;

alter table public.compras_empresa enable row level security;
drop policy if exists p_admin on public.compras_empresa;
create policy p_admin on public.compras_empresa for all to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists p_papelera on public.compras_empresa;
create policy p_papelera on public.compras_empresa as restrictive for all to authenticated using (eliminado_en is null);

-- 3) Permisos
revoke all on public.compras_empresa, public.v_resumen_zona_mes from anon;
grant select, insert, update on public.compras_empresa to authenticated;
revoke delete on public.compras_empresa from authenticated;
grant select on public.v_resumen_zona_mes to authenticated;
