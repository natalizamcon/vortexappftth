-- =====================================================================
--  VORTEX · 12 · RED PERFECCIONADA
--   · NAP: editar, de dónde se alimenta, ampliar puertos y mandar a la papelera
--   · Historial de cada puerto (quién cambió qué y cuándo)
--   · Al mandar una troncal a la papelera, su puerto PON se libera
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra tus datos. Puedes correrlo dos veces.
-- =====================================================================

-- 1) NAP: nuevos datos y papelera ------------------------------------------
alter table public.naps add column if not exists ubicacion text;
alter table public.naps add column if not exists troncal_id uuid references public.troncales(id) on delete set null;
alter table public.naps add column if not exists padre_id uuid references public.naps(id) on delete set null;
alter table public.naps add column if not exists eliminado_en timestamptz;
alter table public.naps add column if not exists eliminado_por uuid;
alter table public.naps add column if not exists eliminado_motivo text;

-- el código de una NAP se puede volver a usar si la anterior está en la papelera
alter table public.naps drop constraint if exists naps_zona_id_codigo_key;
create unique index if not exists u_naps_codigo on public.naps (zona_id, lower(codigo)) where eliminado_en is null;

create or replace function public.papelera_tablas() returns text[] language sql immutable as
$$ select array['proyectos','zonas','costos_fijos','equipos_serie','fin_movimientos','fondos_movimientos',
                'historial_red','materiales','pagos_personal','presupuesto_lineas','simulaciones','inversores',
                'olts','troncales','fusiones','postes','naps',
                'gastos_empresa','costos_compartidos','fondos_empresa','compras_empresa']::text[] $$;

drop policy if exists p_papelera on public.naps;
create policy p_papelera on public.naps as restrictive for all to authenticated using (eliminado_en is null);
-- los puertos se ocultan junto con su NAP
drop policy if exists p_nap_activa on public.puertos;
create policy p_nap_activa on public.puertos as restrictive for all to authenticated using (exists (select 1 from public.naps n where n.id = puertos.nap_id));

-- 2) Mandar a la papelera: ahora también NAP (se bloquea si tiene clientes conectados) ---
create or replace function public.enviar_a_papelera(p_tabla text, p_ids uuid[], p_motivo text default null) returns int
language plpgsql security definer set search_path = public as
$$
declare
  v_tabla text := lower(coalesce(p_tabla, '')); v_id uuid; v_proy uuid; v_n int; v_total int := 0;
  v_fin boolean; v_emp boolean; v_con_socios boolean; v_existe boolean; v_origen text; v_cod text;
begin
  if not (v_tabla = any (public.papelera_tablas())) then raise exception 'Esto no se puede enviar a la papelera'; end if;
  v_fin := v_tabla in ('fin_movimientos','fondos_movimientos','pagos_personal','inversores','presupuesto_lineas','simulaciones');
  v_emp := v_tabla = any (public.papelera_tablas_empresa());

  foreach v_id in array coalesce(p_ids, array[]::uuid[]) loop
    v_proy := null;
    if v_tabla = 'proyectos' then v_proy := v_id;
    elsif v_emp then
      execute format('select exists (select 1 from public.%I where id = $1 and eliminado_en is null)', v_tabla) into v_existe using v_id;
      if not v_existe then continue; end if;
    else
      execute format('select proyecto_id from public.%I where id = $1 and eliminado_en is null', v_tabla) into v_proy using v_id;
      if v_proy is null then continue; end if;
    end if;

    if v_tabla in ('proyectos', 'zonas') or v_emp then
      if not public.es_admin() then raise exception 'Solo el administrador puede hacer esto'; end if;
    elsif v_fin then
      if not public.puede_finanzas(v_proy) then raise exception 'No tienes permiso para esto'; end if;
    else
      if not public.puede_escribir(v_proy) then raise exception 'No tienes permiso para esto'; end if;
    end if;

    if v_tabla = 'fondos_empresa' then
      select origen into v_origen from public.fondos_empresa where id = v_id;
      if v_origen <> 'manual' then raise exception 'Este movimiento viene de un reparto o de un gasto de la empresa. Anula el reparto o manda el gasto a la papelera.'; end if;
    end if;
    if v_tabla = 'naps' then
      select codigo into v_cod from public.naps where id = v_id;
      if exists (select 1 from public.clientes c where c.nap_id = v_id and c.estado <> 'BAJA') then
        raise exception 'La NAP % tiene clientes conectados. Primero da de baja o muda a esos clientes.', v_cod;
      end if;
    end if;

    execute format('update public.%I set eliminado_en = now(), eliminado_por = auth.uid(), eliminado_motivo = $2 where id = $1 and eliminado_en is null', v_tabla) using v_id, p_motivo;
    get diagnostics v_n = row_count;
    if v_n = 0 then continue; end if;
    v_total := v_total + v_n;

    if v_tabla = 'zonas' then
      select con_socios into v_con_socios from public.zonas where id = v_id;
      if v_con_socios and not exists (select 1 from public.zonas where proyecto_id = v_proy and eliminado_en is null) then
        update public.proyectos set eliminado_en = now(), eliminado_por = auth.uid(), eliminado_motivo = 'Se envió su única zona a la papelera' where id = v_proy and eliminado_en is null;
      end if;
    end if;
    perform public.auditar(v_proy, 'PAPELERA', v_tabla, v_id, jsonb_build_object('motivo', p_motivo));
  end loop;
  return v_total;
end $$;

-- 3) Troncal en la papelera: se libera su puerto PON (y se vuelve a ocupar al restaurarla) -----
create or replace function public.al_papelera_troncal() returns trigger language plpgsql security definer set search_path = public as
$$
begin
  if new.pon_id is not null then
    if new.eliminado_en is not null then update public.puertos_pon set estado = 'LIBRE' where id = new.pon_id and estado = 'EN USO';
    else update public.puertos_pon set estado = 'EN USO' where id = new.pon_id and estado = 'LIBRE'; end if;
  end if;
  return new;
end $$;
drop trigger if exists t_papelera_troncal on public.troncales;
create trigger t_papelera_troncal after update of eliminado_en on public.troncales for each row when (old.eliminado_en is distinct from new.eliminado_en) execute function public.al_papelera_troncal();

-- 4) Historial de cada puerto ----------------------------------------------------------------
create table if not exists public.puertos_historial (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  puerto_id uuid not null references public.puertos(id) on delete cascade,
  nap_id uuid not null,
  fecha timestamptz not null default now(),
  usuario_id uuid default auth.uid(), usuario text,
  estado_anterior text, estado_nuevo text, detalle text
);
create index if not exists i_pto_hist on public.puertos_historial (puerto_id, fecha desc);

create or replace function public.al_cambiar_puerto() returns trigger language plpgsql security definer set search_path = public as
$$
declare v_user text; v_det text;
begin
  select coalesce(nullif(f.nombre, ''), f.email) into v_user from public.profiles f where f.id = auth.uid();
  v_det := case
    when new.estado = 'OCUPADO'   then 'Cliente: ' || coalesce((select c.nombre from public.clientes c where c.id = new.cliente_id), 'sin nombre')
    when new.estado = 'RESERVADO' then 'Reservado para ' || coalesce(new.reservado_para, 'sin nombre') || coalesce(' (' || nullif(new.reservado_tel, '') || ')', '') || coalesce(' hasta ' || new.reservado_hasta::text, '')
    when new.estado = 'DAÑADO'    then 'Marcado como dañado'
    else 'Quedó libre' end;
  insert into public.puertos_historial(proyecto_id, puerto_id, nap_id, usuario, estado_anterior, estado_nuevo, detalle)
  values (new.proyecto_id, new.id, new.nap_id, coalesce(v_user, 'Sistema'), old.estado, new.estado, v_det);
  return new;
end $$;
drop trigger if exists t_puerto_hist on public.puertos;
create trigger t_puerto_hist after update on public.puertos for each row
  when (old.estado is distinct from new.estado or old.cliente_id is distinct from new.cliente_id or old.reservado_para is distinct from new.reservado_para or old.reservado_hasta is distinct from new.reservado_hasta)
  execute function public.al_cambiar_puerto();

alter table public.puertos_historial enable row level security;
drop policy if exists p_ver on public.puertos_historial;
create policy p_ver on public.puertos_historial for select to authenticated using (public.puede_ver(proyecto_id));
drop policy if exists p_proyecto_activo on public.puertos_historial;
create policy p_proyecto_activo on public.puertos_historial as restrictive for all to authenticated using (public.proyecto_activo(proyecto_id));
drop policy if exists p_nap_activa on public.puertos_historial;
create policy p_nap_activa on public.puertos_historial as restrictive for all to authenticated using (exists (select 1 from public.naps n where n.id = puertos_historial.nap_id));
revoke all on public.puertos_historial from anon;
grant select on public.puertos_historial to authenticated;

-- 5) Ampliar los puertos de una NAP (solo se puede subir, nunca bajar) -----------------------------
create or replace function public.nap_solo_amplia() returns trigger language plpgsql as
$$
begin
  if new.puertos is distinct from old.puertos and coalesce(current_setting('vortex.ampliando', true), '') <> '1' then
    raise exception 'Para cambiar la cantidad de puertos usa "Ampliar puertos".';
  end if;
  return new;
end $$;
drop trigger if exists t_nap_solo_amplia on public.naps;
create trigger t_nap_solo_amplia before update of puertos on public.naps for each row execute function public.nap_solo_amplia();

create or replace function public.ampliar_nap(p_nap uuid, p_total int) returns void
language plpgsql security definer set search_path = public as
$$
declare n public.naps%rowtype;
begin
  select * into n from public.naps where id = p_nap and eliminado_en is null;
  if not found then raise exception 'No se encontró la NAP'; end if;
  if not public.puede_escribir(n.proyecto_id) then raise exception 'No tienes permiso para esto'; end if;
  if p_total is null or p_total <= n.puertos then raise exception 'El nuevo total debe ser mayor que los % puertos actuales', n.puertos; end if;
  if p_total > 128 then raise exception 'Una NAP puede tener hasta 128 puertos'; end if;
  insert into public.puertos(proyecto_id, nap_id, numero) select n.proyecto_id, n.id, g from generate_series(n.puertos + 1, p_total) g;
  perform set_config('vortex.ampliando', '1', true);
  update public.naps set puertos = p_total where id = p_nap;
  insert into public.historial_red(proyecto_id, zona_id, fecha, tipo, descripcion)
    values (n.proyecto_id, n.zona_id, current_date, 'Ampliación de red', 'NAP ' || n.codigo || ' ampliada de ' || n.puertos || ' a ' || p_total || ' puertos');
  perform public.auditar(n.proyecto_id, 'AMPLIAR_NAP', 'naps', n.id, jsonb_build_object('de', n.puertos, 'a', p_total));
end $$;

revoke all on function public.ampliar_nap(uuid, int) from public, anon;
revoke all on function public.enviar_a_papelera(text, uuid[], text) from public, anon;
grant execute on function public.ampliar_nap(uuid, int) to authenticated;
grant execute on function public.enviar_a_papelera(text, uuid[], text) to authenticated;
