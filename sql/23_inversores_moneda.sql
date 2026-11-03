-- =====================================================================
--  VORTEX · 23 · INVERSORES EN DÓLARES O BOLIVIANOS, INTERÉS POR % O POR MONTO, Y COMPROBANTE
--   · Cada inversor guarda su moneda, lo que puso en esa moneda y el tipo de cambio que se usó
--   · El interés se puede pactar por porcentaje o por monto (por mes, por año o en total)
--   · Se puede subir la foto o el comprobante de lo que invirtió
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra tus datos. Puedes correrlo dos veces. Va después del archivo 22.
-- =====================================================================

alter table public.inversores add column if not exists moneda text not null default 'BOB';
alter table public.inversores add column if not exists monto_original numeric(14,2);
alter table public.inversores add column if not exists tipo_cambio numeric(10,4);
alter table public.inversores add column if not exists interes_modo text not null default 'porcentaje';
alter table public.inversores add column if not exists interes_monto numeric(14,2);
alter table public.inversores add column if not exists interes_base text;
alter table public.inversores add column if not exists comprobante_path text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'inversores_moneda_chk') then
    alter table public.inversores add constraint inversores_moneda_chk check (moneda in ('BOB', 'USD'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inversores_modo_chk') then
    alter table public.inversores add constraint inversores_modo_chk check (interes_modo in ('porcentaje', 'monto'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inversores_base_chk') then
    alter table public.inversores add constraint inversores_base_chk check (interes_base is null or interes_base in ('mensual', 'anual', 'total'));
  end if;
end $$;

-- El porcentaje ahora guarda más decimales (si pactas un monto, el % equivalente sale exacto)
alter table public.inversores alter column interes type numeric(12,6);

-- Los inversores que ya tenías están en Bs: su monto original es el mismo
update public.inversores set monto_original = monto where monto_original is null;
