-- =====================================================================
--  VORTEX · 8 · REPORTES
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Solo crea 2 vistas de lectura. No cambia ni borra nada. Puedes correrlo dos veces.
-- =====================================================================

-- Pagos con la zona y el nombre del cliente (para filtrar por zona en los reportes)
create or replace view public.v_pagos with (security_invoker = true) as
select p.id, p.proyecto_id, c.zona_id, p.cliente_id, c.codigo as cliente_codigo, c.nombre as cliente_nombre,
       p.fecha, p.monto, p.medio, p.anulado
from public.pagos p
join public.clientes c on c.id = p.cliente_id;

-- Instalaciones con el nombre del cliente
create or replace view public.v_instalaciones with (security_invoker = true) as
select i.id, i.proyecto_id, i.zona_id, i.fecha, i.tecnico, i.costo_materiales, i.mano_obra,
       c.codigo as cliente_codigo, c.nombre as cliente_nombre
from public.instalaciones i
left join public.clientes c on c.id = i.cliente_id;

revoke all on public.v_pagos, public.v_instalaciones from anon;
grant select on public.v_pagos, public.v_instalaciones to authenticated;
