-- =====================================================================
--  VORTEX · 9 · RED COMPLETA
--  Troncales, hilos, fusiones, postes, OLT y puertos PON.
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra ni cambia lo que ya tienes. Puedes correrlo dos veces.
-- =====================================================================

-- 1) OLT y sus puertos PON ------------------------------------------------
create table if not exists public.olts (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  nombre text not null, marca text, modelo text, serie text, ip_gestion text, ubicacion text,
  puertos_pon int not null check (puertos_pon between 1 and 64),
  fecha_instalacion date default current_date,
  estado text not null default 'ACTIVA' check (estado in ('ACTIVA','MANTENIMIENTO','BAJA')),
  observaciones text,
  creado_por uuid default auth.uid(), creado_en timestamptz not null default now()
);
create table if not exists public.puertos_pon (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  olt_id uuid not null references public.olts(id) on delete cascade,
  numero int not null,
  potencia_dbm numeric(5,2),
  estado text not null default 'LIBRE' check (estado in ('LIBRE','EN USO','DAÑADO')),
  nota text,
  unique (olt_id, numero)
);

-- 2) Troncales e hilos ----------------------------------------------------
create table if not exists public.troncales (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  codigo text not null, desde text, hasta text,
  tipo_fibra text not null default 'G.652D',
  longitud_km numeric(8,3) not null default 0 check (longitud_km >= 0),
  hilos int not null check (hilos between 1 and 288),
  pon_id uuid references public.puertos_pon(id) on delete set null,
  observaciones text,
  creado_por uuid default auth.uid(), creado_en timestamptz not null default now()
);
create table if not exists public.hilos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  troncal_id uuid not null references public.troncales(id) on delete cascade,
  numero int not null,
  estado text not null default 'LIBRE' check (estado in ('LIBRE','UTILIZADO','RESERVADO','DAÑADO')),
  nota text,
  unique (troncal_id, numero)
);

-- 3) Fusiones y postes ------------------------------------------------------
create table if not exists public.fusiones (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  troncal_id uuid not null references public.troncales(id) on delete cascade,
  hilo_entrada int, caja_empalme text, splitter text, hilo_salida text,
  nap_id uuid references public.naps(id) on delete set null,
  perdida_db numeric(5,2), fecha date default current_date, tecnico text, observaciones text, foto_path text,
  creado_por uuid default auth.uid(), creado_en timestamptz not null default now()
);
create table if not exists public.postes (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  codigo text not null, tipo text, ferreteria text, fecha_instalacion date, tecnico text,
  lat numeric, lng numeric,
  troncal_id uuid references public.troncales(id) on delete set null,
  observaciones text, foto_path text,
  creado_por uuid default auth.uid(), creado_en timestamptz not null default now()
);

-- 4) Papelera: estos registros se pueden mandar a la papelera ----------------
do $$
declare t text;
begin
  foreach t in array array['olts','troncales','fusiones','postes'] loop
    execute format('alter table public.%I add column if not exists eliminado_en timestamptz', t);
    execute format('alter table public.%I add column if not exists eliminado_por uuid', t);
    execute format('alter table public.%I add column if not exists eliminado_motivo text', t);
  end loop;
end $$;

create or replace function public.papelera_tablas() returns text[] language sql immutable as
$$ select array['proyectos','zonas','costos_fijos','equipos_serie','fin_movimientos','fondos_movimientos',
                'historial_red','materiales','pagos_personal','presupuesto_lineas','simulaciones','inversores',
                'olts','troncales','fusiones','postes']::text[] $$;

-- los códigos se pueden volver a usar si el anterior está en la papelera
create unique index if not exists u_olts_nombre on public.olts (zona_id, lower(nombre)) where eliminado_en is null;
create unique index if not exists u_troncales_codigo on public.troncales (zona_id, lower(codigo)) where eliminado_en is null;
create unique index if not exists u_postes_codigo on public.postes (zona_id, lower(codigo)) where eliminado_en is null;
create index if not exists i_hilos_troncal on public.hilos (troncal_id);
create index if not exists i_fusiones_troncal on public.fusiones (troncal_id);
create index if not exists i_pon_olt on public.puertos_pon (olt_id);

-- 5) El proyecto de cada registro se toma de su registro padre (no se puede falsificar)
do $$
declare r record;
begin
  for r in select * from (values
    ('olts','zonas','zona_id'), ('troncales','zonas','zona_id'), ('postes','zonas','zona_id'),
    ('puertos_pon','olts','olt_id'), ('hilos','troncales','troncal_id')
  ) as t(tabla, padre, col) loop
    execute format('drop trigger if exists t_heredar on public.%I', r.tabla);
    execute format('create trigger t_heredar before insert or update of %I on public.%I for each row execute function public.heredar_proyecto(%L, %L)', r.col, r.tabla, r.padre, r.col);
  end loop;
end $$;

-- una fusión toma la zona y el proyecto de su troncal
create or replace function public.heredar_de_troncal() returns trigger language plpgsql security definer set search_path = public as
$$
declare t public.troncales%rowtype;
begin
  select * into t from public.troncales where id = new.troncal_id;
  if not found then raise exception 'No se encontró la troncal'; end if;
  new.zona_id := t.zona_id; new.proyecto_id := t.proyecto_id;
  return new;
end $$;
drop trigger if exists t_heredar on public.fusiones;
create trigger t_heredar before insert or update of troncal_id on public.fusiones for each row execute function public.heredar_de_troncal();

-- 6) Al crear una OLT se crean sus puertos PON; al crear una troncal se crean sus hilos
create or replace function public.al_crear_olt() returns trigger language plpgsql security definer set search_path = public as
$$
begin
  insert into public.puertos_pon(proyecto_id, olt_id, numero) select new.proyecto_id, new.id, g from generate_series(1, new.puertos_pon) g;
  insert into public.historial_red(proyecto_id, zona_id, fecha, tipo, descripcion)
    values (new.proyecto_id, new.zona_id, coalesce(new.fecha_instalacion, current_date), 'OLT registrada', 'OLT ' || new.nombre || ' (' || new.puertos_pon || ' puertos PON)');
  return new;
end $$;
drop trigger if exists t_olt_nueva on public.olts;
create trigger t_olt_nueva after insert on public.olts for each row execute function public.al_crear_olt();

create or replace function public.al_crear_troncal() returns trigger language plpgsql security definer set search_path = public as
$$
begin
  insert into public.hilos(proyecto_id, troncal_id, numero) select new.proyecto_id, new.id, g from generate_series(1, new.hilos) g;
  if new.pon_id is not null then update public.puertos_pon set estado = 'EN USO' where id = new.pon_id and estado = 'LIBRE'; end if;
  insert into public.historial_red(proyecto_id, zona_id, fecha, tipo, descripcion)
    values (new.proyecto_id, new.zona_id, current_date, 'Troncal nueva', 'Troncal ' || new.codigo || ' (' || new.hilos || ' hilos, ' || new.longitud_km || ' km)');
  return new;
end $$;
drop trigger if exists t_troncal_nueva on public.troncales;
create trigger t_troncal_nueva after insert on public.troncales for each row execute function public.al_crear_troncal();

-- 7) Permisos (igual que el resto de la red: ver = todos los del espacio; escribir = según rol)
do $$
declare t text;
begin
  foreach t in array array['olts','puertos_pon','troncales','hilos','fusiones','postes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists p_ver on public.%I', t);
    execute format('create policy p_ver on public.%I for select to authenticated using (public.puede_ver(proyecto_id))', t);
    execute format('drop policy if exists p_esc on public.%I', t);
    execute format('create policy p_esc on public.%I for all to authenticated using (public.puede_escribir(proyecto_id)) with check (public.puede_escribir(proyecto_id))', t);
  end loop;
end $$;

-- 8) Lo que está en la papelera (o dentro de una zona o espacio en la papelera) se oculta
do $$
declare t text;
begin
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

-- hilos y fusiones se ocultan junto con su troncal; puertos PON junto con su OLT
drop policy if exists p_troncal_activa on public.hilos;
create policy p_troncal_activa on public.hilos as restrictive for all to authenticated using (exists (select 1 from public.troncales t where t.id = hilos.troncal_id));
drop policy if exists p_troncal_activa on public.fusiones;
create policy p_troncal_activa on public.fusiones as restrictive for all to authenticated using (exists (select 1 from public.troncales t where t.id = fusiones.troncal_id));
drop policy if exists p_olt_activa on public.puertos_pon;
create policy p_olt_activa on public.puertos_pon as restrictive for all to authenticated using (exists (select 1 from public.olts o where o.id = puertos_pon.olt_id));

-- 9) Vistas de lectura ---------------------------------------------------------
create or replace view public.v_troncales_resumen with (security_invoker = true) as
select t.id as troncal_id, t.proyecto_id, t.zona_id, t.codigo, t.desde, t.hasta, t.tipo_fibra, t.longitud_km, t.hilos as total, t.pon_id,
       count(h.id) filter (where h.estado = 'LIBRE')::int     as libres,
       count(h.id) filter (where h.estado = 'UTILIZADO')::int as utilizados,
       count(h.id) filter (where h.estado = 'RESERVADO')::int as reservados,
       count(h.id) filter (where h.estado = 'DAÑADO')::int    as danados
from public.troncales t
left join public.hilos h on h.troncal_id = t.id
group by t.id;

create or replace view public.v_olts_resumen with (security_invoker = true) as
select o.id as olt_id, o.proyecto_id, o.zona_id, o.nombre, o.marca, o.modelo, o.ip_gestion, o.estado, o.puertos_pon as total,
       count(p.id) filter (where p.estado = 'LIBRE')::int  as libres,
       count(p.id) filter (where p.estado = 'EN USO')::int as en_uso,
       count(p.id) filter (where p.estado = 'DAÑADO')::int as danados
from public.olts o
left join public.puertos_pon p on p.olt_id = o.id
group by o.id;

create or replace view public.v_puertos_pon with (security_invoker = true) as
select p.id, p.proyecto_id, o.zona_id, p.olt_id, o.nombre as olt_nombre, p.numero, p.potencia_dbm, p.estado, p.nota
from public.puertos_pon p
join public.olts o on o.id = p.olt_id;

create or replace view public.v_fusiones with (security_invoker = true) as
select f.id, f.proyecto_id, f.zona_id, f.troncal_id, t.codigo as troncal_codigo, f.hilo_entrada, f.caja_empalme, f.splitter, f.hilo_salida,
       f.nap_id, n.codigo as nap_codigo, f.perdida_db, f.fecha, f.tecnico, f.observaciones, f.foto_path
from public.fusiones f
join public.troncales t on t.id = f.troncal_id
left join public.naps n on n.id = f.nap_id;

-- 10) Seguridad de los permisos de tabla ------------------------------------------
revoke all on public.olts, public.puertos_pon, public.troncales, public.hilos, public.fusiones, public.postes,
              public.v_troncales_resumen, public.v_olts_resumen, public.v_puertos_pon, public.v_fusiones from anon;
grant select, insert, update on public.olts, public.puertos_pon, public.troncales, public.hilos, public.fusiones, public.postes to authenticated;
revoke delete on public.olts, public.puertos_pon, public.troncales, public.hilos, public.fusiones, public.postes from authenticated;
grant select on public.v_troncales_resumen, public.v_olts_resumen, public.v_puertos_pon, public.v_fusiones to authenticated;
