-- =====================================================================
--  VORTEX · BASE DE DATOS COMPLETA (pegar UNA sola vez en el SQL Editor)
--  Crea tablas, seguridad por proyecto, funciones y carpetas de archivos.
--  Se puede volver a ejecutar sin romper nada.
-- =====================================================================
create extension if not exists pgcrypto;
create sequence if not exists public.seq_cliente;

-- ---------- 1. USUARIOS, PROYECTOS Y SOCIOS ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text, nombre text, telefono text,
  rol text not null default 'pendiente' check (rol in ('pendiente','admin','socio','supervisor','tecnico','cobranzas','almacen','financiero')),
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);
create table if not exists public.proyectos (
  id uuid primary key default gen_random_uuid(),
  codigo text unique, nombre text not null, creado_en timestamptz not null default now()
);
create table if not exists public.proyecto_usuarios (
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (proyecto_id, user_id)
);

-- ---------- 2. FUNCIONES DE PERMISO (la seguridad vive aquí, en la base) ----------
create or replace function public.es_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists(select 1 from public.profiles where id = auth.uid() and rol = 'admin' and activo) $$;

create or replace function public.mi_rol() returns text language sql stable security definer set search_path = public as
$$ select rol from public.profiles where id = auth.uid() and activo $$;

create or replace function public.puede_ver(p uuid) returns boolean language sql stable security definer set search_path = public as
$$ select public.es_admin() or exists(
     select 1 from public.proyecto_usuarios pu join public.profiles f on f.id = pu.user_id
     where pu.user_id = auth.uid() and pu.proyecto_id = p and f.activo and f.rol <> 'pendiente') $$;

create or replace function public.puede_rol(p uuid, roles text[]) returns boolean language sql stable security definer set search_path = public as
$$ select public.es_admin() or (public.puede_ver(p) and public.mi_rol() = any(roles)) $$;

create or replace function public.puede_escribir(p uuid) returns boolean language sql stable security definer set search_path = public as
$$ select public.puede_rol(p, array['socio','supervisor','tecnico','cobranzas','almacen','financiero']) $$;

create or replace function public.puede_finanzas(p uuid) returns boolean language sql stable security definer set search_path = public as
$$ select public.puede_rol(p, array['socio','financiero']) $$;

create or replace function public.puede_ver_texto(p text) returns boolean language plpgsql stable security definer set search_path = public as
$$ begin return public.puede_ver(p::uuid); exception when others then return false; end $$;

create or replace function public.puede_escribir_texto(p text) returns boolean language plpgsql stable security definer set search_path = public as
$$ begin return public.puede_escribir(p::uuid); exception when others then return false; end $$;

-- ---------- 3. ZONAS, PLANES Y RED ----------
create table if not exists public.zonas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  nombre text not null,
  fecha_inicio date not null default current_date,
  dia_corte int not null default 5 check (dia_corte between 1 and 28),
  meta_clientes int, meta_meses int, fecha_meta date,
  presupuesto_viajes numeric(12,2) not null default 0, presupuesto_materiales numeric(12,2) not null default 0,
  creado_en timestamptz not null default now(), unique (proyecto_id, nombre)
);
create table if not exists public.planes (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  nombre text not null, mbps int not null, precio numeric(12,2) not null, activo boolean not null default true
);
create table if not exists public.naps (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  codigo text not null, tipo text not null default 'Secundaria' check (tipo in ('Principal','Secundaria')),
  puertos int not null check (puertos between 1 and 128), lat numeric, lng numeric, observaciones text,
  creado_en timestamptz not null default now(), unique (zona_id, codigo)
);
create table if not exists public.puertos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  nap_id uuid not null references public.naps(id) on delete cascade,
  numero int not null,
  estado text not null default 'LIBRE' check (estado in ('LIBRE','OCUPADO','RESERVADO','DAÑADO')),
  cliente_id uuid, reservado_para text, reservado_tel text, reservado_hasta date,
  unique (nap_id, numero)
);

-- ---------- 4. CLIENTES ----------
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  codigo text unique default ('C-' || lpad(nextval('public.seq_cliente')::text, 4, '0')),
  nombre text not null, ci text, telefono text, referencia_nombre text, referencia_tel text,
  direccion text, lat numeric, lng numeric,
  plan_id uuid references public.planes(id), plan_nombre text, mbps int, precio_mensual numeric(12,2) not null default 0,
  nap_id uuid references public.naps(id), puerto_id uuid references public.puertos(id),
  fecha_instalacion date, precio_instalacion numeric(12,2) default 0,
  estado text not null default 'ACTIVO' check (estado in ('ACTIVO','SUSPENDIDO','BAJA')),
  no_cortar boolean not null default false, no_cortar_hasta date, motivo_estado text,
  problematico boolean not null default false, motivo_problematico text,
  fecha_baja date, observaciones text, creado_en timestamptz not null default now()
);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'puertos_cliente_fk') then
    alter table public.puertos add constraint puertos_cliente_fk foreign key (cliente_id) references public.clientes(id) on delete set null;
  end if;
end $$;
create table if not exists public.clientes_credenciales (
  cliente_id uuid primary key references public.clientes(id) on delete cascade,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  equipo text, serie text, mac text, ip text, potencia text, usuario_tecnico text, clave_tecnica text
);

-- ---------- 5. COBRANZAS ----------
create table if not exists public.cargos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  periodo date not null, monto numeric(12,2) not null, prorrateado boolean not null default false,
  unique (cliente_id, periodo)
);
create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  fecha date not null default current_date, monto numeric(12,2) not null, medio text,
  periodo_inicio date, tipo text, excedente numeric(12,2) not null default 0,
  comprobante_path text not null, observaciones text,
  anulado boolean not null default false, motivo_anulacion text,
  registrado_por uuid default auth.uid(), creado_en timestamptz not null default now()
);
create table if not exists public.pago_aplicaciones (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null references public.pagos(id) on delete cascade,
  cargo_id uuid not null references public.cargos(id) on delete cascade,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  monto numeric(12,2) not null
);

-- ---------- 6. TRABAJO DE CAMPO ----------
create table if not exists public.instalaciones (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  cliente_id uuid references public.clientes(id) on delete set null,
  fecha date not null default current_date, tecnico text, costo_materiales numeric(12,2) default 0, mano_obra numeric(12,2) default 0, observaciones text,
  creado_en timestamptz not null default now()
);
create table if not exists public.bajas (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  cliente_id uuid not null references public.clientes(id) on delete cascade,
  fecha date not null default current_date, motivo text, destino_equipo text, autorizado_por uuid default auth.uid(), observaciones text
);
create table if not exists public.mantenimientos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  objeto text not null default 'NAP' check (objeto in ('NAP','Red troncal','Equipo','Cambio de antena','Otro')),
  referencia text, tipo text default 'Correctivo', problema text, fecha_programada date,
  estado text not null default 'PENDIENTE' check (estado in ('PENDIENTE','EN PROCESO','PAUSADO','COMPLETADA','CANCELADA')),
  tecnico text, solucion text, costo numeric(12,2) default 0, fecha_cierre date, creado_en timestamptz not null default now()
);
create table if not exists public.mantenimiento_seguimiento (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  mantenimiento_id uuid not null references public.mantenimientos(id) on delete cascade,
  fecha date not null default current_date, nota text, concepto text, gasto numeric(12,2) not null default 0, creado_por uuid default auth.uid()
);
create table if not exists public.viajes (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  fecha_inicio date not null, fecha_fin date not null, tipo text default 'Instalaciones', detalle text,
  estado text not null default 'PROGRAMADO' check (estado in ('PROGRAMADO','EN EJECUCION','PAUSADO','FINALIZADO','CANCELADO')),
  personal text, personas int not null default 1,
  gasolina numeric(12,2) not null default 0, movilidad numeric(12,2) not null default 0,
  pago_dia numeric(12,2) not null default 0, viaticos_dia numeric(12,2) not null default 0,
  creado_en timestamptz not null default now()
);
create table if not exists public.viaje_dias (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  viaje_id uuid not null references public.viajes(id) on delete cascade,
  fecha date not null, actividad text, concepto_gasto text, gasto numeric(12,2) not null default 0, comprobante_path text
);

-- ---------- 7. INVENTARIO Y ALMACENES ----------
create table if not exists public.materiales (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  nombre text not null, categoria text, unidad text not null default 'u', costo numeric(12,2) not null default 0, minimo numeric(12,2) not null default 0, proveedor text,
  unique (proyecto_id, nombre)
);
create table if not exists public.almacenes (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid references public.zonas(id) on delete cascade,
  nombre text not null, tipo text not null default 'zona' check (tipo in ('central','zona','vehiculo'))
);
create table if not exists public.stock (
  material_id uuid not null references public.materiales(id) on delete cascade,
  almacen_id uuid not null references public.almacenes(id) on delete cascade,
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  cantidad numeric(12,2) not null default 0 check (cantidad >= 0),
  primary key (material_id, almacen_id)
);
create table if not exists public.movimientos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  fecha timestamptz not null default now(), tipo text not null,
  material_id uuid not null references public.materiales(id) on delete cascade,
  almacen_origen uuid references public.almacenes(id), almacen_destino uuid references public.almacenes(id),
  cantidad numeric(12,2) not null, costo_unitario numeric(12,2), proveedor text, referencia text, usuario uuid default auth.uid()
);
create table if not exists public.equipos_serie (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  serie text not null, modelo text, mac text,
  estado text not null default 'ALMACEN' check (estado in ('ALMACEN','INSTALADO','MANTENIMIENTO','DESCARTE','PENDIENTE')),
  almacen_id uuid references public.almacenes(id), cliente_id uuid references public.clientes(id) on delete set null,
  cliente_anterior text, proveedor text, foto_path text, creado_en timestamptz not null default now()
);

-- ---------- 8. FINANZAS ----------
create table if not exists public.fin_movimientos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid references public.zonas(id) on delete set null,
  fecha date not null default current_date,
  tipo text not null check (tipo in ('INGRESO','GASTO_OPERATIVO','INVERSION')),
  categoria text, monto numeric(12,2) not null, descripcion text, comprobante_path text, creado_por uuid default auth.uid()
);
create table if not exists public.costos_fijos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  concepto text not null, cantidad numeric(10,2) not null default 1, monto_unitario numeric(12,2) not null default 0, activo boolean not null default true
);
create table if not exists public.inversores (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  nombre text not null, monto numeric(12,2) not null, interes numeric(7,2) not null default 0,
  periodo_interes text not null default 'mensual' check (periodo_interes in ('mensual','anual')),
  plazo_meses int not null default 12, fecha_inicio date not null default current_date
);
create table if not exists public.pagos_inversores (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  inversor_id uuid not null references public.inversores(id) on delete cascade,
  fecha date not null default current_date, monto numeric(12,2) not null, nota text, comprobante_path text
);
create table if not exists public.pagos_personal (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  fecha date not null default current_date, trabajador text not null, concepto text default 'Jornal', monto numeric(12,2) not null, nota text, comprobante_path text
);
create table if not exists public.fondos_movimientos (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  fondo text not null check (fondo in ('Caja chica','Ahorro','Inversión','Retiro del dueño')),
  tipo text not null check (tipo in ('Aporte','Gasto')), monto numeric(12,2) not null, nota text, fecha date not null default current_date
);
create table if not exists public.historial_red (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references public.proyectos(id) on delete cascade,
  zona_id uuid not null references public.zonas(id) on delete cascade,
  fecha date not null default current_date, tipo text not null, descripcion text, monto numeric(12,2) not null default 0, proveedor text, creado_por uuid default auth.uid()
);
create table if not exists public.auditoria (
  id bigserial primary key,
  proyecto_id uuid references public.proyectos(id) on delete cascade,
  usuario uuid default auth.uid(), fecha timestamptz not null default now(),
  accion text not null, entidad text, entidad_id uuid, detalle jsonb
);

-- ---------- 9. EL PROYECTO SE HEREDA DEL "PADRE" (nadie puede mentir sobre el proyecto) ----------
create or replace function public.heredar_proyecto() returns trigger language plpgsql security definer set search_path = public as
$$
declare pid uuid;
begin
  execute format('select proyecto_id from public.%I where id = $1', tg_argv[0]) into pid using (to_jsonb(new) ->> tg_argv[1])::uuid;
  if pid is null then raise exception 'No se encontró el registro relacionado (%)', tg_argv[0]; end if;
  new.proyecto_id := pid;
  return new;
end $$;

do $$
declare r record;
begin
  for r in select * from (values
    ('planes','zonas','zona_id'), ('naps','zonas','zona_id'), ('puertos','naps','nap_id'), ('clientes','zonas','zona_id'),
    ('clientes_credenciales','clientes','cliente_id'), ('cargos','clientes','cliente_id'), ('pagos','clientes','cliente_id'),
    ('pago_aplicaciones','pagos','pago_id'), ('instalaciones','zonas','zona_id'), ('bajas','clientes','cliente_id'),
    ('mantenimientos','zonas','zona_id'), ('mantenimiento_seguimiento','mantenimientos','mantenimiento_id'),
    ('viajes','zonas','zona_id'), ('viaje_dias','viajes','viaje_id'), ('stock','almacenes','almacen_id'),
    ('movimientos','materiales','material_id'), ('costos_fijos','zonas','zona_id'), ('inversores','zonas','zona_id'),
    ('pagos_inversores','inversores','inversor_id'), ('pagos_personal','zonas','zona_id'), ('historial_red','zonas','zona_id')
  ) as t(tabla, padre, col) loop
    execute format('drop trigger if exists t_heredar on public.%I', r.tabla);
    execute format('create trigger t_heredar before insert or update of %I on public.%I for each row execute function public.heredar_proyecto(%L, %L)', r.col, r.tabla, r.padre, r.col);
  end loop;
end $$;

-- ---------- 10. AUTOMATISMOS ----------
create or replace function public.al_crear_usuario() returns trigger language plpgsql security definer set search_path = public as
$$
begin
  insert into public.profiles(id, email, nombre) values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'nombre', split_part(new.email, '@', 1))) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.al_crear_usuario();

create or replace function public.al_crear_proyecto() returns trigger language plpgsql security definer set search_path = public as
$$ begin insert into public.almacenes(proyecto_id, nombre, tipo) values (new.id, 'Almacén central', 'central'); return new; end $$;
drop trigger if exists t_proyecto_nuevo on public.proyectos;
create trigger t_proyecto_nuevo after insert on public.proyectos for each row execute function public.al_crear_proyecto();

create or replace function public.al_crear_zona() returns trigger language plpgsql security definer set search_path = public as
$$
begin
  insert into public.almacenes(proyecto_id, zona_id, nombre, tipo) values (new.proyecto_id, new.id, 'Almacén ' || new.nombre, 'zona');
  insert into public.planes(proyecto_id, zona_id, nombre, mbps, precio) values
    (new.proyecto_id, new.id, 'Básico', 50, 90), (new.proyecto_id, new.id, 'Medio', 100, 140), (new.proyecto_id, new.id, 'Premium', 200, 200);
  insert into public.historial_red(proyecto_id, zona_id, fecha, tipo, descripcion) values (new.proyecto_id, new.id, new.fecha_inicio, 'Zona creada', 'Se creó la zona ' || new.nombre);
  return new;
end $$;
drop trigger if exists t_zona_nueva on public.zonas;
create trigger t_zona_nueva after insert on public.zonas for each row execute function public.al_crear_zona();

create or replace function public.al_crear_nap() returns trigger language plpgsql security definer set search_path = public as
$$
begin
  insert into public.puertos(proyecto_id, nap_id, numero) select new.proyecto_id, new.id, g from generate_series(1, new.puertos) g;
  insert into public.historial_red(proyecto_id, zona_id, fecha, tipo, descripcion) values (new.proyecto_id, new.zona_id, current_date, 'NAP nueva', 'NAP ' || new.codigo || ' (' || new.tipo || ', ' || new.puertos || ' puertos)');
  return new;
end $$;
drop trigger if exists t_nap_nueva on public.naps;
create trigger t_nap_nueva after insert on public.naps for each row execute function public.al_crear_nap();

create or replace function public.auditar(p_proyecto uuid, p_accion text, p_entidad text, p_id uuid, p_detalle jsonb default null) returns void language sql security definer set search_path = public as
$$ insert into public.auditoria(proyecto_id, accion, entidad, entidad_id, detalle) values (p_proyecto, p_accion, p_entidad, p_id, p_detalle) $$;

-- ---------- 11. VISTAS (ya respetan los permisos de quien consulta) ----------
create or replace view public.v_cargos with (security_invoker = true) as
select g.id, g.cliente_id, g.proyecto_id, c.zona_id, g.periodo, g.monto, g.prorrateado,
       coalesce(a.pagado, 0) as pagado, g.monto - coalesce(a.pagado, 0) as saldo,
       (g.periodo + (z.dia_corte - 1))::date as vence
from public.cargos g
join public.clientes c on c.id = g.cliente_id
join public.zonas z on z.id = c.zona_id
left join lateral (select sum(pa.monto) as pagado from public.pago_aplicaciones pa join public.pagos p on p.id = pa.pago_id where pa.cargo_id = g.id and not p.anulado) a on true;

create or replace view public.v_cobranza with (security_invoker = true) as
select c.id as cliente_id, c.proyecto_id, c.zona_id, c.codigo, c.nombre, c.telefono, c.plan_nombre, c.precio_mensual,
       c.estado as estado_servicio, c.no_cortar, c.no_cortar_hasta, c.motivo_estado, c.problematico,
       coalesce(d.deuda, 0) as deuda, coalesce(d.meses, 0) as meses_deuda, d.mas_antiguo, up.ultimo_pago,
       case when c.estado = 'BAJA' then 'BAJA' when c.estado = 'SUSPENDIDO' then 'SUSPENDIDO'
            when coalesce(d.deuda, 0) > 0 then 'VENCIDO' when coalesce(pv.n, 0) > 0 then 'POR VENCER' else 'PAGADO' end as estado_cuenta
from public.clientes c
left join lateral (select sum(v.saldo) as deuda, count(*) as meses, min(v.vence) as mas_antiguo from public.v_cargos v where v.cliente_id = c.id and v.vence < current_date and v.saldo > 0) d on true
left join lateral (select count(*) as n from public.v_cargos v where v.cliente_id = c.id and v.vence >= current_date and v.vence <= current_date + 5 and v.saldo > 0) pv on true
left join lateral (select max(p.fecha) as ultimo_pago from public.pagos p where p.cliente_id = c.id and not p.anulado) up on true;

create or replace view public.v_cobranza_resumen with (security_invoker = true) as
select proyecto_id, zona_id, estado_cuenta, count(*)::int as clientes, coalesce(sum(deuda), 0) as deuda from public.v_cobranza group by proyecto_id, zona_id, estado_cuenta;

create or replace view public.v_puertos_resumen with (security_invoker = true) as
select p.proyecto_id, n.zona_id, p.estado, count(*)::int as puertos from public.puertos p join public.naps n on n.id = p.nap_id group by p.proyecto_id, n.zona_id, p.estado;

create or replace view public.v_resumen_mensual with (security_invoker = true) as
select proyecto_id, mes, sum(ingresos) as ingresos_servicio, sum(cobrado) as cobrado, sum(gastos) as gastos_operativos, sum(inversion) as inversion
from (
  select proyecto_id, date_trunc('month', periodo)::date as mes, monto as ingresos, 0::numeric as cobrado, 0::numeric as gastos, 0::numeric as inversion from public.cargos
  union all select proyecto_id, date_trunc('month', fecha)::date, 0, monto, 0, 0 from public.pagos where not anulado
  union all select proyecto_id, date_trunc('month', fecha)::date, 0, 0, case when tipo = 'GASTO_OPERATIVO' then monto else 0 end, case when tipo = 'INVERSION' then monto else 0 end from public.fin_movimientos
) x group by proyecto_id, mes;

-- ---------- 12. OPERACIONES (todo pasa por aquí para que los números siempre cuadren) ----------
create or replace function public.crear_cliente_instalacion(p jsonb) returns uuid language plpgsql security definer set search_path = public as
$$
declare z public.zonas%rowtype; pl public.planes%rowtype; pu public.puertos%rowtype; v_id uuid;
        v_fecha date := coalesce(nullif(p ->> 'fecha', '')::date, current_date); v_corte date; v_dias int; v_dim int; v_monto numeric; v_pinst numeric := coalesce(nullif(p ->> 'precio_instalacion', '')::numeric, 0);
begin
  select * into z from public.zonas where id = (p ->> 'zona_id')::uuid;
  if not found then raise exception 'Zona no encontrada'; end if;
  if not public.puede_escribir(z.proyecto_id) then raise exception 'No tienes permiso en este proyecto'; end if;
  if v_fecha < z.fecha_inicio then raise exception 'La zona inicia el %: no se puede registrar antes de esa fecha', z.fecha_inicio; end if;
  select * into pl from public.planes where id = (p ->> 'plan_id')::uuid and zona_id = z.id;
  if not found then raise exception 'El plan no es válido para esta zona'; end if;
  select pt.* into pu from public.puertos pt join public.naps n on n.id = pt.nap_id
   where pt.nap_id = (p ->> 'nap_id')::uuid and pt.numero = (p ->> 'puerto')::int and n.zona_id = z.id for update of pt;
  if not found then raise exception 'No se encontró ese puerto'; end if;
  if pu.estado <> 'LIBRE' then raise exception 'El puerto % está %: elige uno libre', pu.numero, pu.estado; end if;

  insert into public.clientes(proyecto_id, zona_id, nombre, ci, telefono, referencia_nombre, referencia_tel, direccion, lat, lng, plan_id, plan_nombre, mbps, precio_mensual, nap_id, puerto_id, fecha_instalacion, precio_instalacion, observaciones)
  values (z.proyecto_id, z.id, p ->> 'nombre', p ->> 'ci', p ->> 'telefono', p ->> 'ref_nombre', p ->> 'ref_tel', p ->> 'direccion', nullif(p ->> 'lat', '')::numeric, nullif(p ->> 'lng', '')::numeric,
          pl.id, pl.nombre, pl.mbps, pl.precio, pu.nap_id, pu.id, v_fecha, v_pinst, p ->> 'observaciones') returning id into v_id;
  update public.puertos set estado = 'OCUPADO', cliente_id = v_id, reservado_para = null, reservado_tel = null, reservado_hasta = null where id = pu.id;
  insert into public.clientes_credenciales(cliente_id, proyecto_id, equipo, serie, mac, ip, potencia, usuario_tecnico, clave_tecnica)
  values (v_id, z.proyecto_id, p ->> 'equipo', p ->> 'serie', p ->> 'mac', p ->> 'ip', p ->> 'potencia', p ->> 'usuario_tecnico', p ->> 'clave_tecnica');
  insert into public.instalaciones(proyecto_id, zona_id, cliente_id, fecha, tecnico, observaciones) values (z.proyecto_id, z.id, v_id, v_fecha, p ->> 'tecnico', p ->> 'observaciones');

  -- primer mes prorrateado por días reales hasta el próximo corte de la zona
  if extract(day from v_fecha) < z.dia_corte then v_corte := (date_trunc('month', v_fecha) + (z.dia_corte - 1) * interval '1 day')::date;
  else v_corte := (date_trunc('month', v_fecha) + interval '1 month' + (z.dia_corte - 1) * interval '1 day')::date; end if;
  v_dias := v_corte - v_fecha;
  v_dim := extract(day from (date_trunc('month', v_fecha) + interval '1 month' - interval '1 day'))::int;
  v_monto := round(pl.precio * least(1, v_dias::numeric / v_dim), 2);
  insert into public.cargos(cliente_id, proyecto_id, periodo, monto, prorrateado) values (v_id, z.proyecto_id, date_trunc('month', v_corte)::date, v_monto, true);
  insert into public.historial_red(proyecto_id, zona_id, fecha, tipo, descripcion, monto) values (z.proyecto_id, z.id, v_fecha, 'Instalación', p ->> 'nombre', v_pinst);
  perform public.auditar(z.proyecto_id, 'INSTALACION', 'clientes', v_id, jsonb_build_object('nombre', p ->> 'nombre'));
  return v_id;
end $$;

create or replace function public.registrar_pago(p_cliente uuid, p_monto numeric, p_medio text, p_periodo date, p_comprobante text, p_obs text default null) returns uuid language plpgsql security definer set search_path = public as
$$
declare c public.clientes%rowtype; v_pago uuid; v_rest numeric := p_monto; v_per date := date_trunc('month', coalesce(p_periodo, current_date))::date; v_min date;
        g public.cargos%rowtype; v_apl numeric; v_n int := 0; v_tipo text;
begin
  select * into c from public.clientes where id = p_cliente;
  if not found then raise exception 'Cliente no encontrado'; end if;
  if not public.puede_rol(c.proyecto_id, array['socio','cobranzas','financiero']) then raise exception 'No tienes permiso para registrar pagos'; end if;
  if p_monto is null or p_monto <= 0 then raise exception 'El monto debe ser mayor a 0'; end if;
  if p_comprobante is null or length(trim(p_comprobante)) = 0 then raise exception 'El comprobante es obligatorio'; end if;
  select min(periodo) into v_min from public.cargos where cliente_id = p_cliente;
  if v_min is not null and v_per < v_min then v_per := v_min; end if;
  insert into public.pagos(cliente_id, proyecto_id, monto, medio, periodo_inicio, comprobante_path, observaciones) values (p_cliente, c.proyecto_id, p_monto, p_medio, v_per, p_comprobante, p_obs) returning id into v_pago;
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
  perform public.auditar(c.proyecto_id, 'PAGO', 'pagos', v_pago, jsonb_build_object('monto', p_monto, 'tipo', v_tipo));
  return v_pago;
end $$;

create or replace function public.anular_pago(p_pago uuid, p_motivo text) returns void language plpgsql security definer set search_path = public as
$$
declare pg public.pagos%rowtype;
begin
  select * into pg from public.pagos where id = p_pago;
  if not found then raise exception 'Pago no encontrado'; end if;
  if not public.puede_rol(pg.proyecto_id, array['socio','cobranzas','financiero']) then raise exception 'No tienes permiso'; end if;
  if p_motivo is null or length(trim(p_motivo)) = 0 then raise exception 'Escribe el motivo'; end if;
  update public.pagos set anulado = true, motivo_anulacion = p_motivo where id = p_pago;
  perform public.auditar(pg.proyecto_id, 'PAGO_ANULADO', 'pagos', p_pago, jsonb_build_object('motivo', p_motivo));
end $$;

create or replace function public.generar_cargos(p_periodo date) returns int language plpgsql security definer set search_path = public as
$$
declare v_per date := date_trunc('month', p_periodo)::date; v_n int;
begin
  with ins as (
    insert into public.cargos(cliente_id, proyecto_id, periodo, monto)
    select c.id, c.proyecto_id, v_per, c.precio_mensual from public.clientes c
    where c.estado <> 'BAJA' and public.puede_rol(c.proyecto_id, array['socio','cobranzas','financiero'])
      and c.fecha_instalacion < (v_per + interval '1 month')::date
      and not exists (select 1 from public.cargos g where g.cliente_id = c.id and g.periodo = v_per)
      and coalesce((select min(g.periodo) from public.cargos g where g.cliente_id = c.id and g.prorrateado), date '1900-01-01') < v_per
    returning 1)
  select count(*) into v_n from ins;
  return v_n;
end $$;

create or replace function public.cambiar_estado_cliente(p_cliente uuid, p_accion text, p_motivo text default null, p_hasta date default null) returns void language plpgsql security definer set search_path = public as
$$
declare c public.clientes%rowtype;
begin
  select * into c from public.clientes where id = p_cliente;
  if not found then raise exception 'Cliente no encontrado'; end if;
  if not public.puede_rol(c.proyecto_id, array['socio','cobranzas','supervisor']) then raise exception 'No tienes permiso'; end if;
  if p_accion in ('NO_CORTAR','SUSPENDER') and (p_motivo is null or length(trim(p_motivo)) = 0) then raise exception 'Escribe la razón'; end if;
  if p_accion = 'NO_CORTAR' then update public.clientes set no_cortar = true, no_cortar_hasta = p_hasta, motivo_estado = p_motivo where id = p_cliente;
  elsif p_accion = 'QUITAR_NO_CORTAR' then update public.clientes set no_cortar = false, no_cortar_hasta = null where id = p_cliente;
  elsif p_accion = 'SUSPENDER' then update public.clientes set estado = 'SUSPENDIDO', motivo_estado = p_motivo where id = p_cliente;
  elsif p_accion = 'RECONECTAR' then update public.clientes set estado = 'ACTIVO', motivo_estado = p_motivo where id = p_cliente;
  else raise exception 'Acción desconocida'; end if;
  perform public.auditar(c.proyecto_id, p_accion, 'clientes', p_cliente, jsonb_build_object('motivo', p_motivo, 'hasta', p_hasta));
end $$;

create or replace function public.dar_baja(p_cliente uuid, p_fecha date, p_motivo text, p_destino text default 'ALMACEN') returns void language plpgsql security definer set search_path = public as
$$
declare c public.clientes%rowtype;
begin
  select * into c from public.clientes where id = p_cliente;
  if not found then raise exception 'Cliente no encontrado'; end if;
  if not public.puede_escribir(c.proyecto_id) then raise exception 'No tienes permiso'; end if;
  if c.estado = 'BAJA' then raise exception 'El cliente ya está dado de baja'; end if;
  update public.clientes set estado = 'BAJA', fecha_baja = coalesce(p_fecha, current_date), no_cortar = false, motivo_estado = p_motivo where id = p_cliente;
  update public.puertos set estado = 'LIBRE', cliente_id = null where cliente_id = p_cliente;
  insert into public.bajas(proyecto_id, cliente_id, fecha, motivo, destino_equipo) values (c.proyecto_id, p_cliente, coalesce(p_fecha, current_date), p_motivo, p_destino);
  update public.equipos_serie set cliente_anterior = c.nombre, cliente_id = null,
         estado = case upper(p_destino) when 'ALMACEN' then 'ALMACEN' when 'MANTENIMIENTO' then 'MANTENIMIENTO' when 'DESCARTE' then 'DESCARTE' else 'PENDIENTE' end
   where cliente_id = p_cliente;
  insert into public.historial_red(proyecto_id, zona_id, fecha, tipo, descripcion) values (c.proyecto_id, c.zona_id, coalesce(p_fecha, current_date), 'Baja', c.nombre);
  perform public.auditar(c.proyecto_id, 'BAJA', 'clientes', p_cliente, jsonb_build_object('motivo', p_motivo, 'equipo', p_destino));
end $$;

create or replace function public.registrar_movimiento(p_tipo text, p_material uuid, p_origen uuid, p_destino uuid, p_cantidad numeric, p_ref text default null, p_proveedor text default null) returns void language plpgsql security definer set search_path = public as
$$
declare m public.materiales%rowtype; v_tipo text := upper(p_tipo); v_disp numeric;
begin
  select * into m from public.materiales where id = p_material;
  if not found then raise exception 'Material no encontrado'; end if;
  if not public.puede_rol(m.proyecto_id, array['socio','almacen','supervisor','tecnico']) then raise exception 'No tienes permiso para mover inventario'; end if;
  if v_tipo in ('BAJA','AJUSTE_NEGATIVO','AJUSTE_POSITIVO') and not public.es_admin() then raise exception 'Los ajustes y bajas de inventario requieren al administrador'; end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'La cantidad debe ser mayor a 0'; end if;
  if v_tipo in ('SALIDA','TRANSFERENCIA','INSTALACION','MANTENIMIENTO','BAJA','AJUSTE_NEGATIVO') then
    if p_origen is null then raise exception 'Falta el almacén de origen'; end if;
    perform 1 from public.almacenes where id = p_origen and proyecto_id = m.proyecto_id;
    if not found then raise exception 'El almacén de origen no pertenece a este proyecto'; end if;
    select coalesce(cantidad, 0) into v_disp from public.stock where material_id = p_material and almacen_id = p_origen;
    v_disp := coalesce(v_disp, 0);
    if v_disp < p_cantidad then raise exception 'No hay suficiente en el almacén: hay % y pides %', v_disp, p_cantidad; end if;
    update public.stock set cantidad = cantidad - p_cantidad where material_id = p_material and almacen_id = p_origen;
  end if;
  if v_tipo in ('ENTRADA','TRANSFERENCIA','DEVOLUCION','AJUSTE_POSITIVO') then
    if p_destino is null then raise exception 'Falta el almacén de destino'; end if;
    if v_tipo = 'TRANSFERENCIA' and p_origen = p_destino then raise exception 'El origen y el destino deben ser distintos'; end if;
    perform 1 from public.almacenes where id = p_destino and proyecto_id = m.proyecto_id;
    if not found then raise exception 'El almacén de destino no pertenece a este proyecto'; end if;
    insert into public.stock(material_id, almacen_id, proyecto_id, cantidad) values (p_material, p_destino, m.proyecto_id, p_cantidad)
    on conflict (material_id, almacen_id) do update set cantidad = public.stock.cantidad + excluded.cantidad;
  end if;
  insert into public.movimientos(proyecto_id, tipo, material_id, almacen_origen, almacen_destino, cantidad, costo_unitario, proveedor, referencia)
  values (m.proyecto_id, v_tipo, p_material, p_origen, p_destino, p_cantidad, m.costo, p_proveedor, p_ref);
end $$;

-- ---------- 13. ADMINISTRACIÓN DE USUARIOS (desde dentro del sistema) ----------
create or replace function public.admin_guardar_usuario(p_user uuid, p_nombre text, p_rol text, p_activo boolean, p_proyectos uuid[]) returns void language plpgsql security definer set search_path = public as
$$
begin
  if not public.es_admin() then raise exception 'Solo el administrador puede hacer esto'; end if;
  if p_rol not in ('pendiente','admin','socio','supervisor','tecnico','cobranzas','almacen','financiero') then raise exception 'Rol no válido'; end if;
  update public.profiles set nombre = coalesce(p_nombre, nombre), rol = p_rol, activo = p_activo where id = p_user;
  delete from public.proyecto_usuarios where user_id = p_user;
  if p_rol <> 'admin' and p_proyectos is not null then
    insert into public.proyecto_usuarios(proyecto_id, user_id) select x, p_user from unnest(p_proyectos) x on conflict do nothing;
  end if;
end $$;

create or replace function public.hacer_admin(p_email text) returns text language plpgsql security definer set search_path = public as
$$
declare u auth.users%rowtype;
begin
  select * into u from auth.users where lower(email) = lower(p_email);
  if not found then return 'No existe un usuario con ese correo. Primero créalo en Authentication → Users.'; end if;
  insert into public.profiles(id, email, nombre, rol, activo) values (u.id, u.email, split_part(u.email, '@', 1), 'admin', true)
  on conflict (id) do update set rol = 'admin', activo = true;
  return 'Listo: ' || u.email || ' ahora es administrador.';
end $$;
revoke all on function public.hacer_admin(text) from public, anon, authenticated;

-- ---------- 14. SEGURIDAD POR FILAS (RLS) ----------
alter table public.profiles enable row level security;
alter table public.proyectos enable row level security;
alter table public.proyecto_usuarios enable row level security;
drop policy if exists p_prof_ver on public.profiles;      create policy p_prof_ver on public.profiles for select to authenticated using (id = auth.uid() or public.es_admin());
drop policy if exists p_prof_admin on public.profiles;    create policy p_prof_admin on public.profiles for all to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists p_proy_ver on public.proyectos;     create policy p_proy_ver on public.proyectos for select to authenticated using (public.puede_ver(id));
drop policy if exists p_proy_admin on public.proyectos;   create policy p_proy_admin on public.proyectos for all to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists p_pu_ver on public.proyecto_usuarios;   create policy p_pu_ver on public.proyecto_usuarios for select to authenticated using (user_id = auth.uid() or public.es_admin());
drop policy if exists p_pu_admin on public.proyecto_usuarios; create policy p_pu_admin on public.proyecto_usuarios for all to authenticated using (public.es_admin()) with check (public.es_admin());

do $$
declare t text;
begin
  -- Tablas de trabajo: ven y editan quienes pertenecen al proyecto
  foreach t in array array['zonas','planes','naps','puertos','clientes','clientes_credenciales','instalaciones','bajas','mantenimientos','mantenimiento_seguimiento',
                           'viajes','viaje_dias','materiales','almacenes','equipos_serie','costos_fijos','historial_red'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists p_ver on public.%I', t);
    execute format('create policy p_ver on public.%I for select to authenticated using (public.puede_ver(proyecto_id))', t);
    execute format('drop policy if exists p_esc on public.%I', t);
    execute format('create policy p_esc on public.%I for all to authenticated using (public.puede_escribir(proyecto_id)) with check (public.puede_escribir(proyecto_id))', t);
  end loop;
  -- Solo lectura (se escriben únicamente con las funciones de arriba): inventario y auditoría
  foreach t in array array['stock','movimientos','auditoria'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists p_ver on public.%I', t);
    execute format('create policy p_ver on public.%I for select to authenticated using (public.puede_ver(proyecto_id))', t);
  end loop;
  -- Cobranzas: solo roles de cobranza y administración; se escriben con funciones
  foreach t in array array['cargos','pagos','pago_aplicaciones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists p_ver on public.%I', t);
    execute format('create policy p_ver on public.%I for select to authenticated using (public.puede_rol(proyecto_id, array[''socio'',''cobranzas'',''financiero'',''supervisor'']))', t);
  end loop;
  -- Finanzas: solo administración, socios y financieros
  foreach t in array array['fin_movimientos','inversores','pagos_inversores','pagos_personal','fondos_movimientos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists p_fin on public.%I', t);
    execute format('create policy p_fin on public.%I for all to authenticated using (public.puede_finanzas(proyecto_id)) with check (public.puede_finanzas(proyecto_id))', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.hacer_admin(text) from authenticated;

-- ---------- 15. CARPETAS PARA ARCHIVOS (privadas, separadas por proyecto) ----------
insert into storage.buckets (id, name, public) values ('comprobantes', 'comprobantes', false), ('fotos', 'fotos', false) on conflict (id) do nothing;
drop policy if exists vortex_leer on storage.objects;
create policy vortex_leer on storage.objects for select to authenticated using (bucket_id in ('comprobantes','fotos') and public.puede_ver_texto((storage.foldername(name))[1]));
drop policy if exists vortex_subir on storage.objects;
create policy vortex_subir on storage.objects for insert to authenticated with check (bucket_id in ('comprobantes','fotos') and public.puede_escribir_texto((storage.foldername(name))[1]));
drop policy if exists vortex_borrar on storage.objects;
create policy vortex_borrar on storage.objects for delete to authenticated using (bucket_id in ('comprobantes','fotos') and public.puede_escribir_texto((storage.foldername(name))[1]));
