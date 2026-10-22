-- =====================================================================
--  VORTEX · 14 · CLIENTES COMO EN EL PROTOTIPO
--   · Comportamiento de pago de cada cliente (puntual, generalmente puntual…)
--   · Detalle de cómo se aplicó cada pago (para los gráficos de cobranza)
--   · Registro de pagos completo
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Solo crea 3 vistas de lectura. No cambia ni borra nada. Puedes correrlo dos veces.
-- =====================================================================

-- Cómo paga cada cliente: de sus meses ya vencidos, cuántos pagó a tiempo (hasta 3 días después del vencimiento), tarde, o no pagó
create or replace view public.v_comportamiento with (security_invoker = true) as
select c.id as cliente_id, c.proyecto_id, c.zona_id,
       count(g.id) filter (where g.vence < current_date)::int                                                        as cargos_vencidos,
       count(g.id) filter (where g.vence < current_date and g.saldo <= 0 and g.pagado_el <= g.vence + 3)::int       as a_tiempo,
       count(g.id) filter (where g.vence < current_date and g.saldo <= 0 and g.pagado_el > g.vence + 3)::int        as tarde,
       count(g.id) filter (where g.vence < current_date and g.saldo > 0)::int                                       as impagos
from public.clientes c
left join (
  select v.id, v.cliente_id, v.vence, v.saldo,
         (select max(p.fecha) from public.pago_aplicaciones pa join public.pagos p on p.id = pa.pago_id where pa.cargo_id = v.id and not p.anulado) as pagado_el
  from public.v_cargos v
) g on g.cliente_id = c.id
group by c.id;

-- A qué mes se aplicó cada parte de cada pago
create or replace view public.v_aplicaciones with (security_invoker = true) as
select pa.id, pa.proyecto_id, c.zona_id, p.cliente_id, p.fecha as fecha_pago, g.periodo as periodo_cargo, pa.monto, p.anulado
from public.pago_aplicaciones pa
join public.pagos p on p.id = pa.pago_id
join public.cargos g on g.id = pa.cargo_id
join public.clientes c on c.id = p.cliente_id;

-- Registro de pagos con el cliente, la zona y hasta qué mes cubre cada pago
create or replace view public.v_pagos_registro with (security_invoker = true) as
select p.id, p.proyecto_id, c.zona_id, p.cliente_id, c.codigo as cliente_codigo, c.nombre as cliente_nombre,
       p.fecha, p.monto, p.medio, p.periodo_inicio, p.tipo, p.excedente, p.comprobante_path, p.observaciones,
       p.anulado, p.motivo_anulacion, p.creado_en,
       (select max(g.periodo) from public.pago_aplicaciones pa join public.cargos g on g.id = pa.cargo_id where pa.pago_id = p.id) as cubre_hasta,
       (select coalesce(nullif(f.nombre, ''), f.email) from public.profiles f where f.id = p.registrado_por) as registrado_por
from public.pagos p
join public.clientes c on c.id = p.cliente_id;

revoke all on public.v_comportamiento, public.v_aplicaciones, public.v_pagos_registro from anon;
grant select on public.v_comportamiento, public.v_aplicaciones, public.v_pagos_registro to authenticated;
