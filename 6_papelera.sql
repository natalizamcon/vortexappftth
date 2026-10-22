-- =====================================================================
--  VORTEX · 6 · PAPELERA (nada se elimina de verdad)
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra datos. Puedes correrlo dos veces.
--
--  Qué hace:
--   · Zonas, espacios (proyectos), gastos, inversores, materiales, etc. se
--     "mandan a la papelera": desaparecen de las pantallas pero siguen guardados.
--   · Si mandas una zona o un espacio a la papelera, TODO lo que contiene
--     (clientes, red, cobranzas, finanzas) deja de verse y de contarse.
--   · Solo el administrador ve la papelera y restaura.
--   · Se bloquea el borrado real desde la app.
-- =====================================================================

-- 1) Columnas de papelera ----------------------------------------------
create or replace function public.papelera_tablas() returns text[] language sql immutable as
$$ select array['proyectos','zonas','costos_fijos','equipos_serie','fin_movimientos','fondos_movimientos',
                'historial_red','materiales','pagos_personal','presupuesto_lineas','simulaciones','inversores']::text[] $$;

do $$
declare t text;
begin
  foreach t in array public.papelera_tablas() loop
    execute format('alter table public.%I add column if not exists eliminado_en timestamptz', t);
    execute format('alter table public.%I add column if not exists eliminado_por uuid', t);
    execute format('alter table public.%I add column if not exists eliminado_motivo text', t);
  end loop;
end $$;

-- 2) Funciones de apoyo ---------------------------------------------------
create or replace function public.proyecto_activo(p uuid) returns boolean language sql stable security definer set search_path = public as
$$ select not exists (select 1 from public.proyectos where id = p and eliminado_en is not null) $$;

create or replace function public.zona_activa(z uuid) returns boolean language sql stable security definer set search_path = public as
$$ select z is null or not exists (select 1 from public.zonas where id = z and eliminado_en is not null) $$;

-- 3) Lo que está en la papelera se oculta para todos ----------------------
--    (políticas "restrictivas": se suman a las que ya existen, no las reemplazan)
do $$
declare t text;
begin
  -- a) cada registro enviado a la papelera
  foreach t in array public.papelera_tablas() loop
    execute format('drop policy if exists p_papelera on public.%I', t);
    execute format('create policy p_papelera on public.%I as restrictive for all to authenticated using (eliminado_en is null)', t);
  end loop;

  -- b) todo lo que pertenece a un espacio (proyecto) en la papelera
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'proyecto_id' and tb.table_type = 'BASE TABLE'
  loop
    execute format('drop policy if exists p_proyecto_activo on public.%I', t);
    execute format('create policy p_proyecto_activo on public.%I as restrictive for all to authenticated using (public.proyecto_activo(proyecto_id))', t);
  end loop;

  -- c) todo lo que pertenece a una zona en la papelera
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'zona_id' and tb.table_type = 'BASE TABLE'
  loop
    execute format('drop policy if exists p_zona_activa on public.%I', t);
    execute format('create policy p_zona_activa on public.%I as restrictive for all to authenticated using (public.zona_activa(zona_id))', t);
  end loop;
end $$;

-- los pagos a un inversor se ocultan junto con el inversor
drop policy if exists p_inversor_activo on public.pagos_inversores;
create policy p_inversor_activo on public.pagos_inversores as restrictive for all to authenticated
  using (exists (select 1 from public.inversores i where i.id = pagos_inversores.inversor_id));

-- 4) El resumen mensual deja de contar clientes de zonas en la papelera ----
create or replace view public.v_resumen_mensual with (security_invoker = true) as
select proyecto_id, mes, sum(ingresos) as ingresos_servicio, sum(cobrado) as cobrado, sum(gastos) as gastos_operativos, sum(inversion) as inversion
from (
  select g.proyecto_id, date_trunc('month', g.periodo)::date as mes, g.monto as ingresos, 0::numeric as cobrado, 0::numeric as gastos, 0::numeric as inversion
    from public.cargos g join public.clientes c on c.id = g.cliente_id
  union all select p.proyecto_id, date_trunc('month', p.fecha)::date, 0, p.monto, 0, 0
    from public.pagos p join public.clientes c on c.id = p.cliente_id where not p.anulado
  union all select proyecto_id, date_trunc('month', fecha)::date, 0, 0, case when tipo = 'GASTO_OPERATIVO' then monto else 0 end, case when tipo = 'INVERSION' then monto else 0 end from public.fin_movimientos
) x group by proyecto_id, mes;

-- 5) Mandar a la papelera ---------------------------------------------------
create or replace function public.enviar_a_papelera(p_tabla text, p_ids uuid[], p_motivo text default null) returns int
language plpgsql security definer set search_path = public as
$$
declare
  v_tabla text := lower(coalesce(p_tabla, '')); v_id uuid; v_proy uuid; v_n int; v_total int := 0;
  v_fin boolean; v_con_socios boolean;
begin
  if not (v_tabla = any (public.papelera_tablas())) then raise exception 'Esto no se puede enviar a la papelera'; end if;
  v_fin := v_tabla in ('fin_movimientos','fondos_movimientos','pagos_personal','inversores','presupuesto_lineas','simulaciones');

  foreach v_id in array coalesce(p_ids, array[]::uuid[]) loop
    if v_tabla = 'proyectos' then v_proy := v_id;
    else execute format('select proyecto_id from public.%I where id = $1 and eliminado_en is null', v_tabla) into v_proy using v_id;
    end if;
    if v_proy is null then continue; end if;

    if v_tabla in ('proyectos', 'zonas') then
      if not public.es_admin() then raise exception 'Solo el administrador puede enviar zonas o espacios a la papelera'; end if;
    elsif v_fin then
      if not public.puede_finanzas(v_proy) then raise exception 'No tienes permiso para esto'; end if;
    else
      if not public.puede_escribir(v_proy) then raise exception 'No tienes permiso para esto'; end if;
    end if;

    execute format('update public.%I set eliminado_en = now(), eliminado_por = auth.uid(), eliminado_motivo = $2 where id = $1 and eliminado_en is null', v_tabla) using v_id, p_motivo;
    get diagnostics v_n = row_count;
    if v_n = 0 then continue; end if;
    v_total := v_total + v_n;

    -- una zona con espacio propio que era la última del espacio: el espacio también se va a la papelera
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

-- 6) Restaurar (solo administrador) -------------------------------------------
create or replace function public.restaurar_de_papelera(p_tabla text, p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as
$$
declare
  v_tabla text := lower(coalesce(p_tabla, '')); v_id uuid; v_row jsonb; v_proy uuid; v_zona uuid; v_n int; v_total int := 0;
  v_nom text;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede restaurar'; end if;
  if not (v_tabla = any (public.papelera_tablas())) then raise exception 'Esto no está en la papelera'; end if;

  foreach v_id in array coalesce(p_ids, array[]::uuid[]) loop
    execute format('select to_jsonb(t) from public.%I t where id = $1 and eliminado_en is not null', v_tabla) into v_row using v_id;
    if v_row is null then continue; end if;
    v_proy := case when v_tabla = 'proyectos' then v_id else (v_row ->> 'proyecto_id')::uuid end;
    v_zona := case when v_tabla = 'zonas' then null else (v_row ->> 'zona_id')::uuid end;

    if v_tabla <> 'proyectos' and exists (select 1 from public.proyectos where id = v_proy and eliminado_en is not null) then
      if v_tabla = 'zonas' and coalesce((v_row ->> 'con_socios')::boolean, false) then
        update public.proyectos set eliminado_en = null, eliminado_por = null, eliminado_motivo = null where id = v_proy;
      else
        select nombre into v_nom from public.proyectos where id = v_proy;
        raise exception 'Primero restaura el espacio "%" (está en la papelera).', v_nom;
      end if;
    end if;
    if v_tabla <> 'zonas' and v_tabla <> 'proyectos' and v_zona is not null and exists (select 1 from public.zonas where id = v_zona and eliminado_en is not null) then
      select nombre into v_nom from public.zonas where id = v_zona;
      raise exception 'Primero restaura la zona "%" (está en la papelera).', v_nom;
    end if;

    begin
      execute format('update public.%I set eliminado_en = null, eliminado_por = null, eliminado_motivo = null where id = $1', v_tabla) using v_id;
    exception when unique_violation then
      raise exception 'No se puede restaurar: ya existe otro registro con el mismo nombre. Cámbiale el nombre al nuevo o restaura este después.';
    end;
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    perform public.auditar(v_proy, 'RESTAURAR', v_tabla, v_id, null);
  end loop;
  return v_total;
end $$;

-- 7) Ver la papelera (solo administrador) -------------------------------------
create or replace function public.listar_papelera() returns table (
  tabla text, id uuid, proyecto_id uuid, eliminado_en timestamptz, eliminado_por text, motivo text, zona text, espacio text, datos jsonb)
language plpgsql security definer set search_path = public as
$$
declare v_t text;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede ver la papelera'; end if;
  foreach v_t in array public.papelera_tablas() loop
    return query execute format(
      'select %L::text, t.id, %s, t.eliminado_en,
              (select coalesce(f.nombre, f.email) from public.profiles f where f.id = t.eliminado_por),
              t.eliminado_motivo,
              (select z.nombre from public.zonas z where z.id = (to_jsonb(t) ->> ''zona_id'')::uuid),
              (select p.nombre from public.proyectos p where p.id = %s),
              to_jsonb(t)
         from public.%I t where t.eliminado_en is not null',
      v_t, case when v_t = 'proyectos' then 't.id' else 't.proyecto_id' end, case when v_t = 'proyectos' then 't.id' else 't.proyecto_id' end, v_t);
  end loop;
end $$;

-- 8) Crear zona: ahora ignora el espacio principal si está en la papelera -----
create or replace function public.crear_zona_completa(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  v_nombre text := btrim(coalesce(p ->> 'nombre', ''));
  v_con_socios boolean := coalesce((p ->> 'con_socios')::boolean, false);
  v_proy uuid; v_zona uuid;
  v_inicio date := coalesce(nullif(p ->> 'fecha_inicio', '')::date, current_date);
  v_meses int := nullif(p ->> 'meta_meses', '')::int;
  x jsonb; s text;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede crear zonas'; end if;
  if v_nombre = '' then raise exception 'Falta el nombre de la zona'; end if;

  if v_con_socios then
    insert into public.proyectos(nombre) values (v_nombre) returning id into v_proy;
  else
    select id into v_proy from public.proyectos where nombre = 'Vortex' and eliminado_en is null order by creado_en limit 1;
    if v_proy is null then insert into public.proyectos(nombre) values ('Vortex') returning id into v_proy; end if;
    if exists (select 1 from public.zonas where proyecto_id = v_proy and lower(nombre) = lower(v_nombre) and eliminado_en is not null) then
      raise exception 'Ya hay una zona llamada "%" en la Papelera. Restáurala desde el menú Papelera o usa otro nombre.', v_nombre;
    end if;
  end if;

  begin
    insert into public.zonas(proyecto_id, nombre, ubicacion, fecha_inicio, dia_corte, meta_clientes, meta_meses, fecha_meta, con_socios)
    values (v_proy, v_nombre, nullif(btrim(coalesce(p ->> 'ubicacion', '')), ''), v_inicio,
            coalesce(nullif(p ->> 'dia_corte', '')::int, 5),
            nullif(p ->> 'meta_clientes', '')::int, v_meses,
            case when v_meses is not null then (v_inicio + make_interval(months => v_meses))::date end,
            v_con_socios)
    returning id into v_zona;
  exception when unique_violation then
    raise exception 'Ya existe una zona con el nombre "%"', v_nombre;
  end;

  if jsonb_typeof(p -> 'planes') = 'array' and jsonb_array_length(p -> 'planes') > 0 then
    delete from public.planes where zona_id = v_zona;
    for x in select * from jsonb_array_elements(p -> 'planes') loop
      if btrim(coalesce(x ->> 'nombre', '')) <> '' then
        insert into public.planes(proyecto_id, zona_id, nombre, mbps, precio)
        values (v_proy, v_zona, btrim(x ->> 'nombre'), coalesce(nullif(x ->> 'mbps', '')::int, 0), coalesce(nullif(x ->> 'precio', '')::numeric, 0));
      end if;
    end loop;
  end if;

  if jsonb_typeof(p -> 'costos') = 'array' then
    for x in select * from jsonb_array_elements(p -> 'costos') loop
      if btrim(coalesce(x ->> 'concepto', '')) <> '' then
        insert into public.costos_fijos(proyecto_id, zona_id, concepto, cantidad, monto_unitario)
        values (v_proy, v_zona, btrim(x ->> 'concepto'), coalesce(nullif(x ->> 'cantidad', '')::numeric, 1), coalesce(nullif(x ->> 'monto_unitario', '')::numeric, 0));
      end if;
    end loop;
  end if;

  if jsonb_typeof(p -> 'inversores') = 'array' then
    for x in select * from jsonb_array_elements(p -> 'inversores') loop
      if btrim(coalesce(x ->> 'nombre', '')) <> '' and coalesce(nullif(x ->> 'monto', '')::numeric, 0) > 0 then
        insert into public.inversores(proyecto_id, zona_id, nombre, monto, interes, periodo_interes, plazo_meses, fecha_inicio)
        values (v_proy, v_zona, btrim(x ->> 'nombre'), (x ->> 'monto')::numeric, coalesce(nullif(x ->> 'interes', '')::numeric, 0),
                case when x ->> 'periodo_interes' = 'anual' then 'anual' else 'mensual' end,
                coalesce(nullif(x ->> 'plazo_meses', '')::int, 12), v_inicio);
      end if;
    end loop;
  end if;

  if jsonb_typeof(p -> 'nap') = 'object' and btrim(coalesce(p -> 'nap' ->> 'codigo', '')) <> '' then
    insert into public.naps(proyecto_id, zona_id, codigo, tipo, puertos)
    values (v_proy, v_zona, btrim(p -> 'nap' ->> 'codigo'), 'Principal', coalesce(nullif(p -> 'nap' ->> 'puertos', '')::int, 16));
  end if;

  if v_con_socios and jsonb_typeof(p -> 'socios') = 'array' then
    for s in select jsonb_array_elements_text(p -> 'socios') loop
      insert into public.proyecto_usuarios(proyecto_id, user_id)
      select v_proy, f.id from public.profiles f where f.id = s::uuid and f.rol = 'socio' on conflict do nothing;
    end loop;
  end if;

  perform public.auditar(v_proy, 'CREAR', 'zonas', v_zona, jsonb_build_object('nombre', v_nombre, 'con_socios', v_con_socios));
  return jsonb_build_object('zona_id', v_zona, 'proyecto_id', v_proy);
end $$;

-- 9) Permisos: se puede enviar a la papelera, pero ya no se puede borrar de verdad
revoke all on function public.enviar_a_papelera(text, uuid[], text) from public, anon;
revoke all on function public.restaurar_de_papelera(text, uuid[]) from public, anon;
revoke all on function public.listar_papelera() from public, anon;
revoke all on function public.crear_zona_completa(jsonb) from public, anon;
grant execute on function public.enviar_a_papelera(text, uuid[], text) to authenticated;
grant execute on function public.restaurar_de_papelera(text, uuid[]) to authenticated;
grant execute on function public.listar_papelera() to authenticated;
grant execute on function public.crear_zona_completa(jsonb) to authenticated;

revoke delete on all tables in schema public from authenticated;
alter default privileges in schema public revoke delete on tables from authenticated;
