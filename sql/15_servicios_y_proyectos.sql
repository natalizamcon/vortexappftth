-- =====================================================================
--  VORTEX · 15 · INSTALACIONES Y SERVICIOS + PROYECTOS CON SOCIOS
--   · Órdenes de trabajo, instaladores, diario de la zona
--   · Personal de cada viaje (con salida anticipada) y costo real del viaje
--   · Al finalizar un viaje, su costo pasa solo a gastos operativos (Transporte)
--   · Nuevo proyecto y socios que se agregan, quitan o cambian de proyecto
--   · Baja completa (autorizó, estado físico, fotos)
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra tus datos. Puedes correrlo dos veces. Va después del archivo 14.
-- =====================================================================

-- 1) Tablas nuevas ---------------------------------------------------------------
create table if not exists public.instaladores (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  nombre text not null, celular text, ci text,
  pago_dia numeric(12,2) not null default 150 check (pago_dia >= 0),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create table if not exists public.ordenes_trabajo (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  tipo text not null check (tipo in ('Instalación','Mantenimiento','Baja')),
  cliente_id uuid references public.clientes(id) on delete set null,
  referencia text, tecnico text, fecha_programada date,
  estado text not null default 'PROGRAMADA' check (estado in ('PROGRAMADA','EN PROCESO','COMPLETADA','CANCELADA')),
  notas text, resultado_id uuid,
  creado_por uuid default auth.uid(), creado_en timestamptz not null default now(), cerrado_en timestamptz,
  eliminado_en timestamptz, eliminado_por uuid, eliminado_motivo text
);
create table if not exists public.diario_zona (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  fecha date not null default current_date,
  clientes_instalados int not null default 0 check (clientes_instalados >= 0),
  metros_fibra numeric(12,2) not null default 0 check (metros_fibra >= 0),
  personal text, avance text,
  creado_por uuid default auth.uid(), creado_en timestamptz not null default now(),
  eliminado_en timestamptz, eliminado_por uuid, eliminado_motivo text
);
create table if not exists public.viaje_personal (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  viaje_id uuid not null references public.viajes(id) on delete cascade,
  nombre text not null,
  pago_dia numeric(12,2) not null default 0 check (pago_dia >= 0),
  dias_trabajados int not null default 1 check (dias_trabajados >= 0),
  nota text
);
create index if not exists i_ordenes_zona on public.ordenes_trabajo (zona_id, estado);
create index if not exists i_diario_zona on public.diario_zona (zona_id, fecha);
create index if not exists i_viaje_personal on public.viaje_personal (viaje_id);

-- 2) Columnas nuevas en tablas que ya tenías ---------------------------------------
create sequence if not exists public.seq_instalacion;
alter table public.instalaciones add column if not exists codigo text;
update public.instalaciones set codigo = 'INS-' || lpad(nextval('public.seq_instalacion')::text, 4, '0') where codigo is null;
alter table public.instalaciones alter column codigo set default ('INS-' || lpad(nextval('public.seq_instalacion')::text, 4, '0'));
create unique index if not exists u_instalaciones_codigo on public.instalaciones (codigo);

alter table public.bajas add column if not exists estado_fisico text;
alter table public.bajas add column if not exists fotos_path text;
alter table public.bajas add column if not exists autorizado_nombre text;

alter table public.fin_movimientos add column if not exists viaje_id uuid references public.viajes(id) on delete set null;
alter table public.viajes add column if not exists estimado numeric(12,2);
alter table public.viajes add column if not exists nota_estado text;
update public.viajes set estimado = gasolina + movilidad + (fecha_fin - fecha_inicio + 1) * personas * (pago_dia + viaticos_dia) where estimado is null;

-- 3) Costo real de un viaje (usa los días que trabajó cada persona, o el cálculo fijo si no hay lista) ---
create or replace function public.costo_viaje(v public.viajes) returns numeric language sql stable as
$$ select coalesce(v.gasolina, 0) + coalesce(v.movilidad, 0)
        + coalesce((select sum((p.pago_dia + v.viaticos_dia) * p.dias_trabajados) from public.viaje_personal p where p.viaje_id = v.id),
                   (v.fecha_fin - v.fecha_inicio + 1) * v.personas * (v.pago_dia + v.viaticos_dia))
        + coalesce((select sum(d.gasto) from public.viaje_dias d where d.viaje_id = v.id), 0) $$;

-- Al finalizar un viaje, su costo pasa a gastos operativos (categoría Transporte); si se reabre, se retira
create or replace function public.al_cambiar_estado_viaje() returns trigger language plpgsql security definer set search_path = public as
$$
declare v_total numeric;
begin
  if new.estado = 'FINALIZADO' and old.estado is distinct from 'FINALIZADO' then
    v_total := public.costo_viaje(new);
    if v_total > 0 and not exists (select 1 from public.fin_movimientos m where m.viaje_id = new.id and m.eliminado_en is null) then
      insert into public.fin_movimientos(proyecto_id, zona_id, fecha, tipo, categoria, monto, descripcion, viaje_id)
      values (new.proyecto_id, new.zona_id, new.fecha_fin, 'GASTO_OPERATIVO', 'Transporte', round(v_total, 2),
              'Viaje ' || new.fecha_inicio || ' → ' || new.fecha_fin || coalesce(' · ' || nullif(new.personal, ''), ''), new.id);
    end if;
  elsif old.estado = 'FINALIZADO' and new.estado is distinct from 'FINALIZADO' then
    update public.fin_movimientos set eliminado_en = now(), eliminado_motivo = 'El viaje volvió a abrirse' where viaje_id = new.id and eliminado_en is null;
  end if;
  return new;
end $$;
drop trigger if exists t_viaje_estado on public.viajes;
create trigger t_viaje_estado after update of estado on public.viajes for each row execute function public.al_cambiar_estado_viaje();

-- 4) El proyecto de cada registro se toma de su padre (no se puede falsificar) -------------
do $$
declare r record;
begin
  for r in select * from (values
    ('instaladores','zonas','zona_id'), ('ordenes_trabajo','zonas','zona_id'), ('diario_zona','zonas','zona_id'), ('viaje_personal','viajes','viaje_id')
  ) as t(tabla, padre, col) loop
    execute format('drop trigger if exists t_heredar on public.%I', r.tabla);
    execute format('create trigger t_heredar before insert or update of %I on public.%I for each row execute function public.heredar_proyecto(%L, %L)', r.col, r.tabla, r.padre, r.col);
  end loop;
end $$;

-- 5) Papelera: órdenes y diario ---------------------------------------------------------------
create or replace function public.papelera_tablas() returns text[] language sql immutable as
$$ select array['proyectos','zonas','costos_fijos','equipos_serie','fin_movimientos','fondos_movimientos',
                'historial_red','materiales','pagos_personal','presupuesto_lineas','simulaciones','inversores',
                'olts','troncales','fusiones','postes','naps',
                'gastos_empresa','costos_compartidos','fondos_empresa','compras_empresa','costos_variables',
                'ordenes_trabajo','diario_zona']::text[] $$;

-- 6) Permisos (ver: todos los del proyecto · escribir: según rol) y ocultar lo que está en la papelera
do $$
declare t text;
begin
  foreach t in array array['instaladores','ordenes_trabajo','diario_zona','viaje_personal'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists p_ver on public.%I', t);
    execute format('create policy p_ver on public.%I for select to authenticated using (public.puede_ver(proyecto_id))', t);
    execute format('drop policy if exists p_esc on public.%I', t);
    execute format('create policy p_esc on public.%I for all to authenticated using (public.puede_escribir(proyecto_id)) with check (public.puede_escribir(proyecto_id))', t);
  end loop;
  foreach t in array public.papelera_tablas() loop
    execute format('drop policy if exists p_papelera on public.%I', t);
    execute format('create policy p_papelera on public.%I as restrictive for all to authenticated using (eliminado_en is null)', t);
  end loop;
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'proyecto_id' and tb.table_type = 'BASE TABLE'
  loop
    execute format('drop policy if exists p_proyecto_activo on public.%I', t);
    execute format('create policy p_proyecto_activo on public.%I as restrictive for all to authenticated using (public.proyecto_activo(proyecto_id))', t);
  end loop;
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'zona_id' and tb.table_type = 'BASE TABLE'
  loop
    execute format('drop policy if exists p_zona_activa on public.%I', t);
    execute format('create policy p_zona_activa on public.%I as restrictive for all to authenticated using (public.zona_activa(zona_id))', t);
  end loop;
end $$;
drop policy if exists p_viaje_activo on public.viaje_personal;
create policy p_viaje_activo on public.viaje_personal as restrictive for all to authenticated using (exists (select 1 from public.viajes v where v.id = viaje_personal.viaje_id));

-- 7) Proyectos y socios ------------------------------------------------------------------------------
create or replace function public.crear_proyecto(p jsonb) returns uuid
language plpgsql security definer set search_path = public as
$$
declare v_nombre text := btrim(coalesce(p ->> 'nombre', '')); v_id uuid; s text;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede crear proyectos'; end if;
  if v_nombre = '' then raise exception 'Falta el nombre del proyecto'; end if;
  if exists (select 1 from public.proyectos where lower(nombre) = lower(v_nombre) and eliminado_en is null) then raise exception 'Ya existe un proyecto llamado "%"', v_nombre; end if;
  insert into public.proyectos(nombre, codigo) values (v_nombre, nullif(btrim(coalesce(p ->> 'codigo', '')), '')) returning id into v_id;
  if jsonb_typeof(p -> 'socios') = 'array' then
    for s in select jsonb_array_elements_text(p -> 'socios') loop
      insert into public.proyecto_usuarios(proyecto_id, user_id) select v_id, f.id from public.profiles f where f.id = s::uuid and f.rol = 'socio' on conflict do nothing;
    end loop;
  end if;
  perform public.auditar(v_id, 'CREAR', 'proyectos', v_id, jsonb_build_object('nombre', v_nombre));
  return v_id;
end $$;

-- Agregar un socio al proyecto de una zona, quitarlo, o pasarlo a otro proyecto. Todo queda en el historial de la red.
create or replace function public.gestionar_socio_zona(p_zona uuid, p_user uuid, p_accion text, p_proyecto_destino uuid default null) returns void
language plpgsql security definer set search_path = public as
$$
declare z public.zonas%rowtype; v_nom text; v_origen text; v_destino text; v_acc text := upper(coalesce(p_accion, ''));
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede hacer esto'; end if;
  select * into z from public.zonas where id = p_zona; if not found then raise exception 'No se encontró la zona'; end if;
  select coalesce(nullif(f.nombre, ''), f.email) into v_nom from public.profiles f where f.id = p_user and f.rol = 'socio';
  if v_nom is null then raise exception 'Ese usuario no tiene el rol Socio'; end if;
  select nombre into v_origen from public.proyectos where id = z.proyecto_id;

  if v_acc = 'AGREGAR' then
    insert into public.proyecto_usuarios(proyecto_id, user_id) values (z.proyecto_id, p_user) on conflict do nothing;
    insert into public.historial_red(proyecto_id, zona_id, fecha, tipo, descripcion) values (z.proyecto_id, z.id, current_date, 'Socio agregado', v_nom || ' ahora ve el proyecto ' || v_origen);
  elsif v_acc = 'QUITAR' then
    delete from public.proyecto_usuarios where proyecto_id = z.proyecto_id and user_id = p_user;
    insert into public.historial_red(proyecto_id, zona_id, fecha, tipo, descripcion) values (z.proyecto_id, z.id, current_date, 'Socio quitado', v_nom || ' ya no ve el proyecto ' || v_origen);
  elsif v_acc = 'CAMBIAR' then
    if p_proyecto_destino is null or p_proyecto_destino = z.proyecto_id then raise exception 'Elige otro proyecto'; end if;
    select nombre into v_destino from public.proyectos where id = p_proyecto_destino and eliminado_en is null;
    if v_destino is null then raise exception 'El proyecto elegido no existe o está en la papelera'; end if;
    delete from public.proyecto_usuarios where proyecto_id = z.proyecto_id and user_id = p_user;
    insert into public.proyecto_usuarios(proyecto_id, user_id) values (p_proyecto_destino, p_user) on conflict do nothing;
    insert into public.historial_red(proyecto_id, zona_id, fecha, tipo, descripcion) values (z.proyecto_id, z.id, current_date, 'Socio cambiado de proyecto', v_nom || ': de ' || v_origen || ' a ' || v_destino);
  else raise exception 'Acción no válida'; end if;
  perform public.auditar(z.proyecto_id, 'SOCIO_' || v_acc, 'proyecto_usuarios', p_user, jsonb_build_object('zona', z.nombre));
end $$;

-- Crear zona: ahora puede ir en un proyecto que ya existe
create or replace function public.crear_zona_completa(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare
  v_nombre text := btrim(coalesce(p ->> 'nombre', ''));
  v_con_socios boolean := coalesce((p ->> 'con_socios')::boolean, false);
  v_proy uuid; v_zona uuid;
  v_inicio date := coalesce(nullif(p ->> 'fecha_inicio', '')::date, current_date);
  v_meses int := nullif(p ->> 'meta_meses', '')::int;
  x jsonb; s text; v_pp uuid := nullif(p ->> 'proyecto_id', '')::uuid;
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede crear zonas'; end if;
  if v_nombre = '' then raise exception 'Falta el nombre de la zona'; end if;

  if v_con_socios then
    insert into public.proyectos(nombre) values (v_nombre) returning id into v_proy;
  else
    if v_pp is not null then
      select id into v_proy from public.proyectos where id = v_pp and eliminado_en is null;
      if v_proy is null then raise exception 'El proyecto elegido no existe o está en la papelera'; end if;
    else
      select id into v_proy from public.proyectos where nombre = 'Vortex' and eliminado_en is null order by creado_en limit 1;
      if v_proy is null then insert into public.proyectos(nombre) values ('Vortex') returning id into v_proy; end if;
    end if;
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

-- 8) Baja completa: quién autorizó, estado físico del equipo y fotos --------------------------------------
create or replace function public.completar_baja(p jsonb) returns void
language plpgsql security definer set search_path = public as
$$
declare v_cli uuid := (p ->> 'cliente_id')::uuid; v_baja uuid; v_fecha date := coalesce(nullif(p ->> 'fecha', '')::date, current_date);
begin
  perform public.dar_baja(v_cli, v_fecha, coalesce(nullif(btrim(coalesce(p ->> 'motivo', '')), ''), 'Sin motivo'), coalesce(nullif(p ->> 'destino', ''), 'ALMACEN'));
  select id into v_baja from public.bajas where cliente_id = v_cli order by fecha desc, id limit 1;
  update public.bajas set estado_fisico = nullif(p ->> 'estado_fisico', ''), fotos_path = nullif(p ->> 'fotos_path', ''), autorizado_nombre = nullif(p ->> 'autorizado_nombre', '') where id = v_baja;
  update public.ordenes_trabajo set estado = 'COMPLETADA', cerrado_en = now(), resultado_id = v_baja where cliente_id = v_cli and tipo = 'Baja' and estado in ('PROGRAMADA', 'EN PROCESO');
end $$;

-- 9) Historial de la red: ahora incluye el costo real del viaje y los cambios de socios --------------------
create or replace view public.v_historial_red with (security_invoker = true) as
select h.id, h.proyecto_id, h.zona_id, h.fecha, h.tipo::text as tipo, h.descripcion::text as detalle, h.monto::numeric as monto,
       (case when h.tipo in ('Troncal nueva','NAP nueva','OLT registrada','Ampliación de red','Socio agregado','Socio quitado','Socio cambiado de proyecto') then 'Automático' else 'Manual' end)::text as origen,
       'historial'::text as fuente
from public.historial_red h
union all
select i.id, i.proyecto_id, i.zona_id, i.fecha, 'Instalación'::text,
       ('Cliente ' || coalesce(c.nombre, '(sin nombre)') || coalesce(' · técnico ' || nullif(i.tecnico, ''), ''))::text,
       (coalesce(i.costo_materiales, 0) + coalesce(i.mano_obra, 0))::numeric, 'Automático'::text, 'instalacion'::text
from public.instalaciones i left join public.clientes c on c.id = i.cliente_id
union all
select b.id, b.proyecto_id, c.zona_id, b.fecha, 'Baja'::text,
       ('Cliente ' || c.nombre || coalesce(' · ' || nullif(b.motivo, ''), ''))::text, 0::numeric, 'Automático'::text, 'baja'::text
from public.bajas b join public.clientes c on c.id = b.cliente_id
union all
select m.id, m.proyecto_id, m.zona_id, coalesce(m.fecha_cierre, m.fecha_programada, m.creado_en::date), 'Mantenimiento'::text,
       (coalesce(m.referencia || ': ', '') || coalesce(nullif(m.solucion, ''), m.problema, m.objeto))::text, coalesce(m.costo, 0)::numeric, 'Automático'::text, 'mantenimiento'::text
from public.mantenimientos m where m.estado = 'COMPLETADA'
union all
select v.id, v.proyecto_id, v.zona_id, v.fecha_fin, 'Viaje'::text,
       ('Viaje · ' || coalesce(nullif(v.personal, ''), v.tipo))::text,
       public.costo_viaje(v)::numeric, 'Automático'::text, 'viaje'::text
from public.viajes v where v.estado = 'FINALIZADO'
union all
select cv.id, cv.proyecto_id, cv.zona_id, cv.fecha, 'Costo de red'::text,
       (cv.concepto || coalesce(' → ' || cv.destino, ''))::text, cv.real_total::numeric, 'Automático'::text, 'costo_variable'::text
from public.costos_variables cv;

-- 10) Vistas de lectura ------------------------------------------------------------------------------------
create or replace view public.v_instalaciones_lista with (security_invoker = true) as
select i.id, i.codigo, i.proyecto_id, i.zona_id, i.fecha, i.tecnico, c.nombre as cliente_nombre, c.ci as cliente_ci, c.codigo as cliente_codigo,
       n.codigo as nap_codigo, pt.numero as puerto_numero
from public.instalaciones i
left join public.clientes c on c.id = i.cliente_id
left join public.naps n on n.id = c.nap_id
left join public.puertos pt on pt.id = c.puerto_id;

create or replace view public.v_actividades with (security_invoker = true) as
select o.id, 'orden'::text as fuente, o.proyecto_id, o.zona_id, coalesce(c.nombre, o.referencia, '—')::text as cliente, o.tecnico::text as tecnico,
       o.tipo::text as trabajo, o.fecha_programada as fecha, o.estado::text as estado
from public.ordenes_trabajo o left join public.clientes c on c.id = o.cliente_id where o.estado <> 'COMPLETADA'
union all
select i.id, 'instalacion'::text, i.proyecto_id, i.zona_id, coalesce(c.nombre, '—')::text, i.tecnico::text, 'Instalación'::text, i.fecha, 'COMPLETADA'::text
from public.instalaciones i left join public.clientes c on c.id = i.cliente_id
union all
select m.id, 'mantenimiento'::text, m.proyecto_id, m.zona_id, coalesce(nullif(m.referencia, ''), m.objeto)::text, m.tecnico::text, 'Mantenimiento'::text,
       coalesce(m.fecha_cierre, m.fecha_programada), (case m.estado when 'PENDIENTE' then 'PROGRAMADA' when 'PAUSADO' then 'PAUSADA' else m.estado end)::text
from public.mantenimientos m
union all
select b.id, 'baja'::text, b.proyecto_id, c.zona_id, c.nombre::text, null::text, 'Baja'::text, b.fecha, 'COMPLETADA'::text
from public.bajas b join public.clientes c on c.id = b.cliente_id;

create or replace view public.v_bajas_lista with (security_invoker = true) as
select b.id, b.proyecto_id, c.zona_id, b.fecha, b.motivo, b.destino_equipo, b.estado_fisico, b.autorizado_nombre, b.fotos_path,
       c.codigo as cliente_codigo, c.nombre as cliente_nombre
from public.bajas b join public.clientes c on c.id = b.cliente_id;

-- 11) Seguridad de permisos -----------------------------------------------------------------------------------
revoke all on public.instaladores, public.ordenes_trabajo, public.diario_zona, public.viaje_personal,
              public.v_instalaciones_lista, public.v_actividades, public.v_bajas_lista from anon;
grant select, insert, update on public.instaladores, public.ordenes_trabajo, public.diario_zona, public.viaje_personal to authenticated;
revoke delete on public.instaladores, public.ordenes_trabajo, public.diario_zona, public.viaje_personal from authenticated;
grant select on public.v_instalaciones_lista, public.v_actividades, public.v_bajas_lista to authenticated;

revoke all on function public.crear_proyecto(jsonb) from public, anon;
revoke all on function public.gestionar_socio_zona(uuid, uuid, text, uuid) from public, anon;
revoke all on function public.completar_baja(jsonb) from public, anon;
revoke all on function public.crear_zona_completa(jsonb) from public, anon;
grant execute on function public.crear_proyecto(jsonb) to authenticated;
grant execute on function public.gestionar_socio_zona(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.completar_baja(jsonb) to authenticated;
grant execute on function public.crear_zona_completa(jsonb) to authenticated;
