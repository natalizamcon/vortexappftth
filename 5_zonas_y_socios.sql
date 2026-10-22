-- =====================================================================
--  VORTEX · 5 · CREAR ZONA PASO A PASO + SOCIOS QUE VEN SOLO SU ZONA
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra ni cambia datos existentes. Puedes correrlo dos veces.
-- =====================================================================

alter table public.zonas add column if not exists ubicacion text;
alter table public.zonas add column if not exists con_socios boolean not null default false;

-- ---------------------------------------------------------------------
--  Crea una zona completa en un solo paso (si algo falla, no queda nada a medias).
--  Solo la puede usar el administrador.
-- ---------------------------------------------------------------------
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
    -- espacio propio: lo que vea un socio queda limitado a esta zona
    insert into public.proyectos(nombre) values (v_nombre) returning id into v_proy;
  else
    -- espacio principal compartido con tus otras zonas
    select id into v_proy from public.proyectos where nombre = 'Vortex' order by creado_en limit 1;
    if v_proy is null then insert into public.proyectos(codigo, nombre) values ('PRINCIPAL', 'Vortex') returning id into v_proy; end if;
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

  -- el sistema ya creó el almacén de la zona y 3 planes base; si enviaste tus planes, los reemplazan
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

-- ---------------------------------------------------------------------
--  Da o quita a un socio el acceso a UNA zona con espacio propio.
-- ---------------------------------------------------------------------
create or replace function public.dar_acceso_zona(p_zona uuid, p_user uuid, p_dar boolean) returns void
language plpgsql security definer set search_path = public as
$$
declare z public.zonas%rowtype;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede hacer esto'; end if;
  select * into z from public.zonas where id = p_zona;
  if not found then raise exception 'No se encontró la zona'; end if;
  if not z.con_socios then raise exception 'Esta zona comparte espacio con tus otras zonas, por eso no se le puede dar acceso a un socio solo para ella.'; end if;
  if p_dar then
    if not exists (select 1 from public.profiles where id = p_user and rol = 'socio') then raise exception 'Ese usuario no tiene el rol Socio'; end if;
    insert into public.proyecto_usuarios(proyecto_id, user_id) values (z.proyecto_id, p_user) on conflict do nothing;
  else
    delete from public.proyecto_usuarios where proyecto_id = z.proyecto_id and user_id = p_user;
  end if;
  perform public.auditar(z.proyecto_id, case when p_dar then 'DAR_ACCESO' else 'QUITAR_ACCESO' end, 'zonas', z.id, jsonb_build_object('user', p_user));
end $$;

revoke all on function public.crear_zona_completa(jsonb) from public, anon;
revoke all on function public.dar_acceso_zona(uuid, uuid, boolean) from public, anon;
grant execute on function public.crear_zona_completa(jsonb) to authenticated;
grant execute on function public.dar_acceso_zona(uuid, uuid, boolean) to authenticated;
