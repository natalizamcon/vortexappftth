-- =====================================================================
--  VORTEX · 7 · CENTRO DE ALERTAS
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Solo crea 2 vistas de lectura. No cambia ni borra nada. Puedes correrlo dos veces.
-- =====================================================================

-- Cuántos puertos tiene cada NAP y cuántos están libres, ocupados, reservados o dañados
create or replace view public.v_naps_ocupacion with (security_invoker = true) as
select n.id as nap_id, n.proyecto_id, n.zona_id, n.codigo, n.tipo, n.puertos as total,
       count(*) filter (where p.estado = 'OCUPADO')::int   as ocupados,
       count(*) filter (where p.estado = 'RESERVADO')::int as reservados,
       count(*) filter (where p.estado = 'DAÑADO')::int    as danados,
       count(*) filter (where p.estado = 'LIBRE')::int     as libres
from public.naps n
left join public.puertos p on p.nap_id = n.id
group by n.id;

-- Reservas de puerto cuya fecha ya pasó
create or replace view public.v_reservas_vencidas with (security_invoker = true) as
select p.proyecto_id, n.zona_id, n.codigo as nap, p.numero, p.reservado_para, p.reservado_hasta
from public.puertos p
join public.naps n on n.id = p.nap_id
where p.estado = 'RESERVADO' and p.reservado_hasta is not null and p.reservado_hasta < current_date;

revoke all on public.v_naps_ocupacion, public.v_reservas_vencidas from anon;
grant select on public.v_naps_ocupacion, public.v_reservas_vencidas to authenticated;
