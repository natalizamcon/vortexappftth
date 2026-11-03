-- =====================================================================
--  VORTEX · 22 · BANCO: PAGOS AUTOMÁTICOS, LISTA DE QUIÉNES HABILITAR Y QUIÉNES CORTAR
--   · Bandeja de movimientos del banco (llegan por notificación automática, por extracto o a mano)
--   · Reconoce solo quién pagó (por su código C-0001, su carnet o un nombre que ya conoce) y registra el pago
--   · Lo dudoso queda "por revisar" para que lo resuelvas tú con un toque
--   · Listas siempre al día: quiénes pagaron y hay que habilitar, y quiénes siguen sin pagar y hay que cortar
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra tus datos. Puedes correrlo dos veces. Va después del archivo 21.
-- =====================================================================

-- 1) Ayudas para comparar nombres ------------------------------------------------------------------
create or replace function public.tokens_texto(t text) returns text language sql immutable as
$$ select coalesce(string_agg(x, ' ' order by x), '')
   from (select unnest(regexp_split_to_array(trim(regexp_replace(translate(lower(coalesce(t, '')), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', ' ', 'g')), ' ')) as x) s
   where x <> '' $$;

-- 2) Movimientos del banco -----------------------------------------------------------------------------
create table if not exists public.banco_movimientos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  origen text not null default 'manual' check (origen in ('webhook', 'extracto', 'manual')),
  banco text not null default '',
  referencia text not null,
  fecha timestamptz not null default now(),
  monto numeric(12,2) not null check (monto > 0),
  moneda text not null default 'BOB',
  remitente text, cuenta text, glosa text,
  estado text not null default 'NUEVO' check (estado in ('NUEVO', 'CONCILIADO', 'REVISAR', 'IGNORADO')),
  cliente_id uuid references public.clientes(id) on delete set null,
  pago_id uuid references public.pagos(id) on delete set null,
  confianza text, motivo text, candidatos jsonb, crudo jsonb,
  creado_en timestamptz not null default now(), resuelto_por uuid, resuelto_en timestamptz,
  unique (proyecto_id, banco, referencia)
);
create index if not exists i_banco_estado on public.banco_movimientos (proyecto_id, estado, fecha desc);

-- Nombres con los que cada cliente paga (se aprenden solos cuando confirmas un pago a mano)
create table if not exists public.banco_alias (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  alias text not null,
  creado_en timestamptz not null default now(),
  unique (proyecto_id, alias)
);

alter table public.banco_movimientos enable row level security;
drop policy if exists p_ver on public.banco_movimientos;
create policy p_ver on public.banco_movimientos for select to authenticated using (public.puede_rol(proyecto_id, array['socio','cobranzas','financiero','supervisor']));
drop policy if exists p_proyecto_activo on public.banco_movimientos;
create policy p_proyecto_activo on public.banco_movimientos as restrictive for all to authenticated using (public.proyecto_activo(proyecto_id));
alter table public.banco_alias enable row level security;
drop policy if exists p_ver on public.banco_alias;
create policy p_ver on public.banco_alias for select to authenticated using (public.puede_rol(proyecto_id, array['socio','cobranzas','financiero','supervisor']));

-- 3) Registrar un pago sin que haya una persona conectada (lo usa el reconocimiento automático) ------------
create or replace function public.registrar_pago_sistema(p_cliente uuid, p_monto numeric, p_medio text, p_periodo date, p_comprobante text, p_obs text, p_fecha date) returns uuid
language plpgsql security definer set search_path = public as
$$
declare c public.clientes%rowtype; v_pago uuid; v_rest numeric := p_monto; v_per date := date_trunc('month', coalesce(p_periodo, current_date))::date; v_min date;
        g public.cargos%rowtype; v_apl numeric; v_n int := 0; v_tipo text;
begin
  select * into c from public.clientes where id = p_cliente;
  if not found then raise exception 'Cliente no encontrado'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;
  select min(periodo) into v_min from public.cargos where cliente_id = p_cliente;
  if v_min is not null and v_per < v_min then v_per := v_min; end if;
  insert into public.pagos(cliente_id, proyecto_id, fecha, monto, medio, periodo_inicio, comprobante_path, observaciones, registrado_por)
  values (p_cliente, c.proyecto_id, coalesce(p_fecha, current_date), p_monto, p_medio, v_per, p_comprobante, p_obs, auth.uid()) returning id into v_pago;
  while v_rest > 0 and v_n < 60 loop
    select * into g from public.cargos where cliente_id = p_cliente and periodo = v_per;
    if not found then insert into public.cargos(cliente_id, proyecto_id, periodo, monto) values (p_cliente, c.proyecto_id, v_per, c.precio_mensual) returning * into g; end if;
    select least(v_rest, g.monto - coalesce(sum(pa.monto), 0)) into v_apl from public.pago_aplicaciones pa join public.pagos pg on pg.id = pa.pago_id where pa.cargo_id = g.id and not pg.anulado;
    v_apl := coalesce(v_apl, least(v_rest, g.monto));
    if v_apl > 0 then insert into public.pago_aplicaciones(pago_id, cargo_id, proyecto_id, monto) values (v_pago, g.id, c.proyecto_id, v_apl); v_rest := v_rest - v_apl; end if;
    v_per := (v_per + interval '1 month')::date; v_n := v_n + 1;
  end loop;
  v_tipo := case when p_monto < c.precio_mensual then 'Parcial' when p_monto >= 2 * c.precio_mensual then 'Anticipado' else 'Completo' end;
  update public.pagos set tipo = v_tipo, excedente = v_rest where id = v_pago;
  perform public.auditar(c.proyecto_id, 'PAGO_BANCO', 'pagos', v_pago, jsonb_build_object('monto', p_monto, 'tipo', v_tipo));
  return v_pago;
end $$;

-- 4) Recibir un movimiento del banco (por notificación automática, extracto o a mano). Si ya existe, no se duplica.
create or replace function public.registrar_movimiento_banco(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  v_proy uuid := nullif(p ->> 'proyecto_id', '')::uuid; v_ref text := nullif(btrim(coalesce(p ->> 'referencia', '')), ''); v_banco text := btrim(coalesce(p ->> 'banco', ''));
  v_monto numeric := nullif(p ->> 'monto', '')::numeric; v_id uuid;
begin
  if v_proy is null then select id into v_proy from public.proyectos where eliminado_en is null order by (nombre = 'Vortex') desc, creado_en limit 1; end if;
  if v_proy is null then raise exception 'No hay ningún proyecto'; end if;
  if auth.uid() is not null and not public.puede_rol(v_proy, array['socio', 'cobranzas', 'financiero']) then raise exception 'No tienes permiso para registrar movimientos del banco'; end if;
  if v_ref is null then raise exception 'Falta la referencia o número de operación'; end if;
  if v_monto is null or v_monto <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;
  insert into public.banco_movimientos(proyecto_id, origen, banco, referencia, fecha, monto, moneda, remitente, cuenta, glosa, crudo)
  values (v_proy, coalesce(nullif(p ->> 'origen', ''), 'manual'), v_banco, v_ref, coalesce(nullif(p ->> 'fecha', '')::timestamptz, now()), v_monto, coalesce(nullif(p ->> 'moneda', ''), 'BOB'),
          nullif(btrim(coalesce(p ->> 'remitente', '')), ''), nullif(btrim(coalesce(p ->> 'cuenta', '')), ''), nullif(btrim(coalesce(p ->> 'glosa', '')), ''), p -> 'crudo')
  on conflict (proyecto_id, banco, referencia) do nothing returning id into v_id;
  if v_id is not null then return jsonb_build_object('id', v_id, 'nuevo', true); end if;
  select id into v_id from public.banco_movimientos where proyecto_id = v_proy and banco = v_banco and referencia = v_ref;
  return jsonb_build_object('id', v_id, 'nuevo', false);
end $$;

-- 5) Reconocer quién pagó y registrar el pago solo cuando hay certeza ------------------------------------------
--    Certeza = el código del cliente (C-0001) o su carnet escrito en la glosa, o un nombre que ya se confirmó antes.
--    Un nombre parecido NO alcanza: queda "por revisar".
create or replace function public.conciliar_banco(p_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  m public.banco_movimientos%rowtype; c public.clientes%rowtype; v_texto text; v_cands uuid[]; v_cli uuid; v_conf text; v_motivo text; v_per date; v_pago uuid; v_auto int := 0; v_rev int := 0; v_n int; v_tok text;
begin
  if auth.uid() is not null and not (public.es_admin() or public.mi_rol() = any (array['socio', 'cobranzas', 'financiero'])) then raise exception 'No tienes permiso'; end if;
  for m in select * from public.banco_movimientos where estado = 'NUEVO' and (p_id is null or id = p_id)
                 and (auth.uid() is null or public.puede_rol(proyecto_id, array['socio', 'cobranzas', 'financiero'])) order by fecha loop
    v_cli := null; v_conf := null; v_motivo := null; v_cands := '{}'; v_texto := coalesce(m.glosa, '') || ' ' || coalesce(m.remitente, ''); v_tok := public.tokens_texto(m.remitente);
    -- 1) código del cliente (C-0001, c 1, C0001) o carnet en la glosa
    select coalesce(array_agg(distinct k.id), '{}') into v_cands from public.clientes k
    where k.proyecto_id = m.proyecto_id and k.estado <> 'BAJA' and (
      exists (select 1 from regexp_matches(v_texto, '(^|[^a-zA-Z0-9])[cC][ -]?0*([0-9]{1,6})([^0-9]|$)', 'g') as g(x) where nullif(regexp_replace(k.codigo, '[^0-9]', '', 'g'), '')::int = (g.x)[2]::int)
      or (nullif(regexp_replace(coalesce(k.ci, ''), '[^0-9]', '', 'g'), '') is not null
          and exists (select 1 from regexp_matches(v_texto, '(^|[^0-9])([0-9]{5,10})([^0-9]|$)', 'g') as g2(x) where (g2.x)[2] = regexp_replace(k.ci, '[^0-9]', '', 'g'))));
    v_n := coalesce(array_length(v_cands, 1), 0);
    if v_n = 1 then v_cli := v_cands[1]; v_conf := 'alta'; v_motivo := 'Su código o carnet está en la glosa';
    elsif v_n > 1 then v_motivo := 'Varios clientes coinciden con la glosa';
    else
      -- 2) un nombre con el que este cliente ya pagó antes
      if v_tok <> '' then
        select coalesce(array_agg(distinct a.cliente_id), '{}') into v_cands from public.banco_alias a join public.clientes k on k.id = a.cliente_id and k.estado <> 'BAJA' where a.proyecto_id = m.proyecto_id and a.alias = v_tok;
        v_n := coalesce(array_length(v_cands, 1), 0);
        if v_n = 1 then v_cli := v_cands[1]; v_conf := 'alta'; v_motivo := 'Ya pagó antes con este nombre';
        else
          -- 3) un nombre parecido: se propone, pero lo confirma una persona
          select coalesce(array_agg(distinct k.id), '{}') into v_cands from public.clientes k where k.proyecto_id = m.proyecto_id and k.estado <> 'BAJA' and public.tokens_texto(k.nombre) = v_tok;
          v_n := coalesce(array_length(v_cands, 1), 0);
          v_conf := case when v_n > 0 then 'media' else null end; v_motivo := case when v_n > 0 then 'El nombre se parece: confírmalo' else 'No se reconoce al cliente' end;
        end if;
      else v_motivo := 'No se reconoce al cliente';
      end if;
    end if;

    if v_cli is not null then
      select * into c from public.clientes where id = v_cli;
      if m.monto > 12 * c.precio_mensual then v_cli := null; v_motivo := 'El monto es muy alto para este cliente: revísalo'; v_cands := array[c.id]; end if;
    end if;

    if v_cli is not null then
      v_per := coalesce((select min(periodo) from public.v_cargos where cliente_id = v_cli and saldo > 0), date_trunc('month', current_date)::date);
      v_pago := public.registrar_pago_sistema(v_cli, m.monto, 'Transferencia QR', v_per, 'banco:' || m.id,
                  'Banco ' || coalesce(nullif(m.banco, ''), '') || ' · ref ' || m.referencia || coalesce(' · ' || m.remitente, ''), (m.fecha at time zone 'America/La_Paz')::date);
      update public.banco_movimientos set estado = 'CONCILIADO', cliente_id = v_cli, pago_id = v_pago, confianza = v_conf, motivo = v_motivo, resuelto_en = now(), candidatos = null where id = m.id;
      v_auto := v_auto + 1;
    else
      update public.banco_movimientos set estado = 'REVISAR', confianza = v_conf, motivo = v_motivo,
             candidatos = (select coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'codigo', k.codigo, 'nombre', k.nombre)), '[]'::jsonb) from public.clientes k where k.id = any (v_cands)) where id = m.id;
      v_rev := v_rev + 1;
    end if;
  end loop;
  return jsonb_build_object('automaticos', v_auto, 'por_revisar', v_rev);
end $$;

-- 6) Confirmar a mano a quién corresponde un movimiento ------------------------------------------------------
create or replace function public.aplicar_banco(p_mov uuid, p_cliente uuid, p_aprender boolean default true) returns uuid
language plpgsql security definer set search_path = public as
$$
declare m public.banco_movimientos%rowtype; v_per date; v_pago uuid; v_tok text;
begin
  select * into m from public.banco_movimientos where id = p_mov; if not found then raise exception 'No se encontró el movimiento'; end if;
  if not public.puede_rol(m.proyecto_id, array['socio', 'cobranzas', 'financiero']) then raise exception 'No tienes permiso para registrar pagos'; end if;
  if m.estado not in ('NUEVO', 'REVISAR') then raise exception 'Este movimiento ya se resolvió'; end if;
  perform 1 from public.clientes where id = p_cliente and proyecto_id = m.proyecto_id and estado <> 'BAJA'; if not found then raise exception 'Elige un cliente activo de este proyecto'; end if;
  v_per := coalesce((select min(periodo) from public.v_cargos where cliente_id = p_cliente and saldo > 0), date_trunc('month', current_date)::date);
  v_pago := public.registrar_pago_sistema(p_cliente, m.monto, 'Transferencia QR', v_per, 'banco:' || m.id, 'Banco ' || coalesce(nullif(m.banco, ''), '') || ' · ref ' || m.referencia || coalesce(' · ' || m.remitente, ''), (m.fecha at time zone 'America/La_Paz')::date);
  update public.banco_movimientos set estado = 'CONCILIADO', cliente_id = p_cliente, pago_id = v_pago, confianza = 'manual', motivo = 'Confirmado por una persona', resuelto_por = auth.uid(), resuelto_en = now(), candidatos = null where id = p_mov;
  v_tok := public.tokens_texto(m.remitente);
  if p_aprender and v_tok <> '' then insert into public.banco_alias(proyecto_id, cliente_id, alias) values (m.proyecto_id, p_cliente, v_tok) on conflict (proyecto_id, alias) do nothing; end if;
  return v_pago;
end $$;

create or replace function public.ignorar_banco(p_mov uuid, p_motivo text default null) returns void
language plpgsql security definer set search_path = public as
$$
declare m public.banco_movimientos%rowtype;
begin
  select * into m from public.banco_movimientos where id = p_mov; if not found then raise exception 'No se encontró el movimiento'; end if;
  if not public.puede_rol(m.proyecto_id, array['socio', 'cobranzas', 'financiero']) then raise exception 'No tienes permiso'; end if;
  if m.estado not in ('NUEVO', 'REVISAR') then raise exception 'Este movimiento ya se resolvió'; end if;
  update public.banco_movimientos set estado = 'IGNORADO', motivo = coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'No corresponde a un cliente'), resuelto_por = auth.uid(), resuelto_en = now() where id = p_mov;
end $$;

-- Si se anula un pago que vino del banco, el movimiento vuelve a "por revisar"
create or replace function public.al_anular_pago_banco() returns trigger language plpgsql security definer set search_path = public as
$$
begin
  if new.anulado and not old.anulado then
    update public.banco_movimientos set estado = 'REVISAR', pago_id = null, cliente_id = null, motivo = 'El pago se anuló: vuelve a revisarlo', resuelto_en = null where pago_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists t_banco_pago_anulado on public.pagos;
create trigger t_banco_pago_anulado after update of anulado on public.pagos for each row execute function public.al_anular_pago_banco();

-- 7) Listas del día -------------------------------------------------------------------------------------------------
--    Por habilitar: están cortados y ya no deben nada.  Por cortar: están activos y tienen meses vencidos sin pagar (y no tienen "No cortar").
create or replace view public.v_habilitar with (security_invoker = true) as
select k.cliente_id, k.proyecto_id, k.zona_id, k.codigo, k.nombre, k.telefono, k.plan_nombre, k.motivo_estado, k.ultimo_pago,
       n.codigo as nap_codigo, pt.numero as puerto_numero,
       (select max(p.creado_en) from public.pagos p where p.cliente_id = k.cliente_id and not p.anulado) as pago_en
from public.v_cobranza k
join public.clientes c on c.id = k.cliente_id
left join public.naps n on n.id = c.nap_id
left join public.puertos pt on pt.id = c.puerto_id
where k.estado_servicio = 'SUSPENDIDO' and k.deuda <= 0;

create or replace view public.v_cortar with (security_invoker = true) as
select k.cliente_id, k.proyecto_id, k.zona_id, k.codigo, k.nombre, k.telefono, k.plan_nombre, k.precio_mensual, k.deuda, k.meses_deuda, k.mas_antiguo,
       n.codigo as nap_codigo, pt.numero as puerto_numero
from public.v_cobranza k
join public.clientes c on c.id = k.cliente_id
left join public.naps n on n.id = c.nap_id
left join public.puertos pt on pt.id = c.puerto_id
where k.estado_servicio = 'ACTIVO' and k.deuda > 0 and not (k.no_cortar and (k.no_cortar_hasta is null or k.no_cortar_hasta >= current_date));

-- 8) Permisos ----------------------------------------------------------------------------------------------------------
revoke all on public.banco_movimientos, public.banco_alias, public.v_habilitar, public.v_cortar from anon;
grant select on public.banco_movimientos, public.banco_alias, public.v_habilitar, public.v_cortar to authenticated;
revoke all on function public.registrar_pago_sistema(uuid, numeric, text, date, text, text, date) from public, anon, authenticated;
revoke all on function public.registrar_movimiento_banco(jsonb) from public, anon;
revoke all on function public.conciliar_banco(uuid) from public, anon;
revoke all on function public.aplicar_banco(uuid, uuid, boolean) from public, anon;
revoke all on function public.ignorar_banco(uuid, text) from public, anon;
grant execute on function public.registrar_movimiento_banco(jsonb) to authenticated, service_role;
grant execute on function public.conciliar_banco(uuid) to authenticated, service_role;
grant execute on function public.aplicar_banco(uuid, uuid, boolean) to authenticated;
grant execute on function public.ignorar_banco(uuid, text) to authenticated;
