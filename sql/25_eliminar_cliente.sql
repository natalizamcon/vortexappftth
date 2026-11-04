-- =====================================================================
--  VORTEX · 25 · ELIMINAR CLIENTES (SOLO EL ADMINISTRADOR PRINCIPAL)
--   · Útil para borrar clientes de prueba. Nadie más puede hacerlo: lo exige la base de datos, no solo la pantalla.
--   · Antes de eliminar se muestra qué se perdería (pagos, meses, instalaciones…) y hay que escribir el código del cliente.
--   · El puerto de la NAP queda libre, los equipos con serie vuelven al almacén y los movimientos del banco ligados vuelven a "por revisar".
--   · Queda un registro de lo que se eliminó (mismo registro del archivo 24).
--  Pégalo en Supabase → SQL Editor → New query → Run.
--  Es seguro: no borra nada por sí solo. Puedes correrlo dos veces. Va después del archivo 24.
-- =====================================================================

-- Solo el administrador principal (rol "admin" con su rol original; un rol personalizado que apunte a admin NO cuenta)
create or replace function public.es_admin_principal() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where id = auth.uid() and rol = 'admin' and coalesce(rol_clave, 'admin') = 'admin' and coalesce(activo, true)) $$;

-- Qué contiene un cliente (para mostrarlo antes de eliminar)
create or replace function public.resumen_eliminacion_cliente(p_cliente uuid) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare c public.clientes%rowtype; n_pagos int; v_monto numeric; n_cargos int; n_inst int; n_equipos int; n_banco int; n_ordenes int; v_items jsonb;
begin
  if not public.es_admin_principal() then raise exception 'Solo el administrador principal puede eliminar clientes'; end if;
  select * into c from public.clientes where id = p_cliente; if not found then raise exception 'No se encontró el cliente'; end if;
  select count(*), coalesce(sum(monto) filter (where not anulado), 0) into n_pagos, v_monto from public.pagos where cliente_id = p_cliente;
  select count(*) into n_cargos from public.cargos where cliente_id = p_cliente;
  select count(*) into n_inst from public.instalaciones where cliente_id = p_cliente;
  select count(*) into n_equipos from public.equipos_serie where cliente_id = p_cliente;
  select count(*) into n_banco from public.banco_movimientos where cliente_id = p_cliente;
  select count(*) into n_ordenes from public.ordenes_trabajo where cliente_id = p_cliente;
  v_items := jsonb_build_array(
    jsonb_build_object('etiqueta', 'Pagos registrados (' || to_char(v_monto, 'FM999G999G990D00') || ' Bs en total)', 'n', n_pagos),
    jsonb_build_object('etiqueta', 'Meses facturados', 'n', n_cargos), jsonb_build_object('etiqueta', 'Instalaciones', 'n', n_inst),
    jsonb_build_object('etiqueta', 'Equipos con serie que vuelven al almacén', 'n', n_equipos),
    jsonb_build_object('etiqueta', 'Movimientos del banco que vuelven a "por revisar"', 'n', n_banco),
    jsonb_build_object('etiqueta', 'Órdenes de trabajo que quedan sin cliente', 'n', n_ordenes),
    jsonb_build_object('etiqueta', 'Puerto de la NAP que queda libre', 'n', case when c.puerto_id is not null then 1 else 0 end));
  return jsonb_build_object('codigo', c.codigo, 'nombre', c.nombre, 'estado', c.estado, 'items', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(v_items) x where (x ->> 'n')::int > 0));
end $$;

-- Eliminar el cliente
create or replace function public.eliminar_cliente(p_cliente uuid) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare c public.clientes%rowtype; r jsonb; v_central uuid;
begin
  if not public.es_admin_principal() then raise exception 'Solo el administrador principal puede eliminar clientes'; end if;
  select * into c from public.clientes where id = p_cliente; if not found then raise exception 'No se encontró el cliente'; end if;
  r := public.resumen_eliminacion_cliente(p_cliente);
  select id into v_central from public.almacenes where proyecto_id = c.proyecto_id and tipo = 'central' limit 1;
  update public.equipos_serie set estado = 'ALMACEN', cliente_id = null, almacen_id = coalesce(almacen_id, v_central) where cliente_id = p_cliente;
  update public.puertos set estado = 'LIBRE', cliente_id = null, reservado_para = null, reservado_tel = null, reservado_hasta = null where cliente_id = p_cliente or id = c.puerto_id;
  update public.banco_movimientos set estado = 'REVISAR', cliente_id = null, pago_id = null, motivo = 'El cliente se eliminó: revisa a quién corresponde' where cliente_id = p_cliente;
  delete from public.historial_red where proyecto_id = c.proyecto_id and zona_id = c.zona_id and tipo = 'Instalación' and descripcion = c.nombre and fecha = c.fecha_instalacion;
  insert into public.eliminaciones_definitivas(tabla, nombre, proyecto_id, resumen, eliminado_por) values ('clientes', coalesce(c.codigo || ' · ', '') || c.nombre, c.proyecto_id, r, auth.uid());
  begin
    delete from public.clientes where id = p_cliente;
  exception when foreign_key_violation then
    raise exception 'No se pudo eliminar: todavía hay datos ligados a este cliente. Avísame para revisarlo.';
  end;
  return r;
end $$;

revoke all on function public.es_admin_principal() from public, anon;
revoke all on function public.resumen_eliminacion_cliente(uuid) from public, anon;
revoke all on function public.eliminar_cliente(uuid) from public, anon;
grant execute on function public.es_admin_principal() to authenticated;
grant execute on function public.resumen_eliminacion_cliente(uuid) to authenticated;
grant execute on function public.eliminar_cliente(uuid) to authenticated;
