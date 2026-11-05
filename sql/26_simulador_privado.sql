-- =====================================================================
--  VORTEX · 26 · LOS ESCENARIOS DEL SIMULADOR SON PRIVADOS DE CADA CUENTA
--   · Cada persona ve, abre, cambia y quita solamente los escenarios que guardó con su propia cuenta.
--   · Lo exige la base de datos (no solo la pantalla): ni siquiera el administrador ve los escenarios de otras cuentas.
--   · El presupuesto de cada zona NO cambia: sigue siendo compartido por quienes manejan las finanzas de esa zona.
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra nada. Puedes correrlo dos veces. Va después del archivo 25.
-- =====================================================================

alter table public.simulaciones add column if not exists creado_por uuid default auth.uid();

-- Una regla "restrictiva" se suma a las que ya existían: para ver un escenario hay que poder ver finanzas Y haberlo creado.
drop policy if exists p_solo_propias on public.simulaciones;
create policy p_solo_propias on public.simulaciones as restrictive for all to authenticated
  using (creado_por = auth.uid())
  with check (creado_por = auth.uid());
