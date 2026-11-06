-- =====================================================================
--  VORTEX · REVISAR QUE TODO QUEDÓ BIEN INSTALADO (solo lee, no cambia nada)
--  Pégalo en SQL Editor y pulsa Run. Debe salir "OK" en las 36 filas.
-- =====================================================================
select n, comprobacion, resultado, estado from (
  select 1 as n, 'Tablas creadas (deben ser 31)' as comprobacion,
         (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')::text as resultado,
         case when (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE') >= 31 then 'OK' else 'FALTA' end as estado
  union all
  select 2, 'Tablas con seguridad por filas activada (31)',
         (select count(*) from pg_tables where schemaname = 'public' and rowsecurity)::text,
         case when (select count(*) from pg_tables where schemaname = 'public' and rowsecurity) >= 31 then 'OK' else 'FALTA' end
  union all
  select 3, 'Funciones del sistema (23)',
         (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in
           ('es_admin','mi_rol','puede_ver','puede_rol','puede_escribir','puede_finanzas','puede_ver_texto','puede_escribir_texto','heredar_proyecto','al_crear_usuario','al_crear_proyecto','al_crear_zona','al_crear_nap','auditar',
            'crear_cliente_instalacion','registrar_pago','anular_pago','generar_cargos','cambiar_estado_cliente','dar_baja','registrar_movimiento','admin_guardar_usuario','hacer_admin'))::text,
         case when (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in
           ('es_admin','mi_rol','puede_ver','puede_rol','puede_escribir','puede_finanzas','puede_ver_texto','puede_escribir_texto','heredar_proyecto','al_crear_usuario','al_crear_proyecto','al_crear_zona','al_crear_nap','auditar',
            'crear_cliente_instalacion','registrar_pago','anular_pago','generar_cargos','cambiar_estado_cliente','dar_baja','registrar_movimiento','admin_guardar_usuario','hacer_admin')) = 23 then 'OK' else 'FALTA' end
  union all
  select 4, 'Vistas de cobranza y resumen (5)',
         (select count(*) from information_schema.views where table_schema = 'public' and table_name in ('v_cargos','v_cobranza','v_resumen_mensual','v_cobranza_resumen','v_puertos_resumen'))::text,
         case when (select count(*) from information_schema.views where table_schema = 'public' and table_name in ('v_cargos','v_cobranza','v_resumen_mensual','v_cobranza_resumen','v_puertos_resumen')) = 5 then 'OK' else 'FALTA' end
  union all
  select 5, 'Carpetas privadas de archivos (comprobantes y fotos)',
         (select count(*) from storage.buckets where id in ('comprobantes','fotos') and not public)::text,
         case when (select count(*) from storage.buckets where id in ('comprobantes','fotos') and not public) = 2 then 'OK' else 'FALTA: créalas en Storage, privadas' end
  union all
  select 6, 'Reglas de acceso a archivos',
         (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'vortex_%')::text,
         case when (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'vortex_%') = 3 then 'OK' else 'FALTA' end
  union all
  select 7, 'Alta automática de perfil al crear usuarios',
         (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'auth' and c.relname = 'users' and t.tgname = 'on_auth_user_created')::text,
         case when (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'auth' and c.relname = 'users' and t.tgname = 'on_auth_user_created') = 1 then 'OK' else 'FALTA' end
  union all
  select 8, 'Administradores activos (debe haber al menos 1)',
         (select count(*) from public.profiles where rol = 'admin' and activo)::text,
         case when (select count(*) from public.profiles where rol = 'admin' and activo) >= 1 then 'OK' else 'FALTA: ejecuta 2_hacer_administrador.sql' end
  union all
  select 9, 'Acceso público sin sesión a las tablas (debe ser 0)',
         (select count(*) from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public')::text,
         case when (select count(*) from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public') = 0 then 'OK' else 'REVISAR' end
  union all
  select 10, 'Simulador y presupuesto (2 tablas, archivo 4)',
         (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('simulaciones','presupuesto_lineas'))::text,
         case when (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('simulaciones','presupuesto_lineas')) = 2 then 'OK' else 'FALTA: ejecuta 4_simulador_presupuesto.sql' end
  union all
  select 11, 'Crear zona paso a paso y socios por zona (archivo 5)',
         ((select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('crear_zona_completa','dar_acceso_zona'))
          + (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'zonas' and column_name = 'con_socios'))::text,
         case when ((select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('crear_zona_completa','dar_acceso_zona'))
          + (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'zonas' and column_name = 'con_socios')) = 3 then 'OK' else 'FALTA: ejecuta 5_zonas_y_socios.sql' end
  union all
  select 12, 'Papelera: nada se borra de verdad (archivo 6)',
         ((select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('enviar_a_papelera','restaurar_de_papelera','listar_papelera'))
          + (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'zonas' and column_name = 'eliminado_en'))::text,
         case when (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('enviar_a_papelera','restaurar_de_papelera','listar_papelera')) = 3
               and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'zonas' and column_name = 'eliminado_en')
               and not has_table_privilege('authenticated', 'public.clientes', 'DELETE')
              then 'OK' else 'FALTA: ejecuta 6_papelera.sql' end
  union all
  select 13, 'Centro de alertas (archivo 7)',
         (select count(*) from information_schema.views where table_schema = 'public' and table_name in ('v_naps_ocupacion','v_reservas_vencidas'))::text,
         case when (select count(*) from information_schema.views where table_schema = 'public' and table_name in ('v_naps_ocupacion','v_reservas_vencidas')) = 2 then 'OK' else 'FALTA: ejecuta 7_alertas.sql' end
  union all
  select 14, 'Reportes (archivo 8)',
         (select count(*) from information_schema.views where table_schema = 'public' and table_name in ('v_pagos','v_instalaciones'))::text,
         case when (select count(*) from information_schema.views where table_schema = 'public' and table_name in ('v_pagos','v_instalaciones')) = 2 then 'OK' else 'FALTA: ejecuta 8_reportes.sql' end
  union all
  select 15, 'Red completa: troncales, hilos, fusiones, postes, OLT y PON (archivo 9)',
         ((select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('olts','puertos_pon','troncales','hilos','fusiones','postes'))
          + (select count(*) from information_schema.views where table_schema = 'public' and table_name in ('v_troncales_resumen','v_olts_resumen','v_puertos_pon','v_fusiones')))::text,
         case when (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('olts','puertos_pon','troncales','hilos','fusiones','postes')) = 6
               and (select count(*) from information_schema.views where table_schema = 'public' and table_name in ('v_troncales_resumen','v_olts_resumen','v_puertos_pon','v_fusiones')) = 4
              then 'OK' else 'FALTA: ejecuta 9_red_completa.sql' end
  union all
  select 16, 'Finanzas: reparto, costos compartidos, gastos de la empresa (archivo 10)',
         ((select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('zona_socios','zona_fondos_pct','costos_compartidos','costos_compartidos_zonas','costos_compartidos_meses','gastos_empresa','fondos_empresa','liquidaciones','liquidacion_socios','liquidacion_fondos'))
          + (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('registrar_gasto_empresa','confirmar_liquidacion','anular_liquidacion','marcar_pago_socio')))::text,
         case when (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('zona_socios','zona_fondos_pct','costos_compartidos','costos_compartidos_zonas','costos_compartidos_meses','gastos_empresa','fondos_empresa','liquidaciones','liquidacion_socios','liquidacion_fondos')) = 10
               and (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('registrar_gasto_empresa','confirmar_liquidacion','anular_liquidacion','marcar_pago_socio')) = 4
              then 'OK' else 'FALTA: ejecuta 10_finanzas_reparto.sql' end
  union all
  select 17, 'Finanzas ordenada: gráficos y compras de la empresa (archivo 11)',
         ((select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'compras_empresa')
          + (select count(*) from information_schema.views where table_schema = 'public' and table_name = 'v_resumen_zona_mes'))::text,
         case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'compras_empresa')
               and exists (select 1 from information_schema.views where table_schema = 'public' and table_name = 'v_resumen_zona_mes')
              then 'OK' else 'FALTA: ejecuta 11_finanzas_orden.sql' end
  union all
  select 18, 'Red perfeccionada: papelera de NAP e historial de puertos (archivo 12)',
         ((select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'puertos_historial')
          + (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'naps' and column_name in ('eliminado_en','troncal_id','padre_id'))
          + (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'ampliar_nap'))::text,
         case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'puertos_historial')
               and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'naps' and column_name in ('eliminado_en','troncal_id','padre_id')) = 3
               and exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'ampliar_nap')
              then 'OK' else 'FALTA: ejecuta 12_red_perfeccionada.sql' end
  union all
  select 19, 'Red como en el prototipo: costos variables e historial (archivo 13)',
         ((select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'costos_variables')
          + (select count(*) from information_schema.views where table_schema = 'public' and table_name = 'v_historial_red')
          + (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'naps' and column_name = 'splitter'))::text,
         case when (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'costos_variables') = 1
               and (select count(*) from information_schema.views where table_schema = 'public' and table_name = 'v_historial_red') = 1
               and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'naps' and column_name = 'splitter') = 1
              then 'OK' else 'FALTA: ejecuta 13_red_como_prototipo.sql' end
  union all
  select 20, 'Clientes como en el prototipo (archivo 14)',
         (select count(*) from information_schema.views where table_schema = 'public' and table_name in ('v_comportamiento','v_aplicaciones','v_pagos_registro'))::text,
         case when (select count(*) from information_schema.views where table_schema = 'public' and table_name in ('v_comportamiento','v_aplicaciones','v_pagos_registro')) = 3 then 'OK' else 'FALTA: ejecuta 14_clientes_como_prototipo.sql' end
  union all
  select 21, 'Instalaciones y servicios, proyectos y socios (archivo 15)',
         ((select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('instaladores','ordenes_trabajo','diario_zona','viaje_personal'))
          + (select count(*) from information_schema.views where table_schema = 'public' and table_name in ('v_instalaciones_lista','v_actividades','v_bajas_lista'))
          + (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('crear_proyecto','gestionar_socio_zona','completar_baja')))::text,
         case when (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('instaladores','ordenes_trabajo','diario_zona','viaje_personal')) = 4
               and (select count(*) from information_schema.views where table_schema = 'public' and table_name in ('v_instalaciones_lista','v_actividades','v_bajas_lista')) = 3
               and (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('crear_proyecto','gestionar_socio_zona','completar_baja')) = 3
              then 'OK' else 'FALTA: ejecuta 15_servicios_y_proyectos.sql' end
  union all
  select 22, 'Inventario y socios (archivo 16)',
         ((select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'materiales' and column_name in ('codigo','marca','modelo'))
          + (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('registrar_compra','agregar_socio','quitar_socio')))::text,
         case when (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'materiales' and column_name in ('codigo','marca','modelo')) = 3
               and (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('registrar_compra','agregar_socio','quitar_socio')) = 3
              then 'OK' else 'FALTA: ejecuta 16_inventario_y_socios.sql' end
  union all
  select 23, 'Centro de alertas (archivo 17)',
         ((select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('alertas_reglas','alertas_estado'))
          + (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('marcar_alerta','reabrir_alerta')))::text,
         case when (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('alertas_reglas','alertas_estado')) = 2
               and (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('marcar_alerta','reabrir_alerta')) = 2
              then 'OK' else 'FALTA: ejecuta 17_alertas_centro.sql' end
  union all
  select 24, 'Configuración: roles, permisos y zonas por usuario (archivo 18)',
         ((select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('roles','roles_permisos','usuario_zonas'))
          + (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('admin_guardar_usuario2','registrar_socio','zona_permitida')))::text,
         case when (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('roles','roles_permisos','usuario_zonas')) = 3
               and (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('admin_guardar_usuario2','registrar_socio','zona_permitida')) = 3
              then 'OK' else 'FALTA: ejecuta 18_configuracion.sql' end
  union all
  select 25, 'Zonas en su proyecto y compras de la empresa en el inventario (archivo 19)',
         ((select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'compras_empresa' and column_name in ('proyecto_id','almacen_id','material_id'))
          + (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('registrar_compra_empresa','mover_compra_empresa','ingresar_compra_empresa')))::text,
         case when (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'compras_empresa' and column_name in ('proyecto_id','almacen_id','material_id')) = 3
               and (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('registrar_compra_empresa','mover_compra_empresa','ingresar_compra_empresa')) = 3
              then 'OK' else 'FALTA: ejecuta 19_zonas_y_compras.sql' end
  union all
  select 26, 'Mapa GPS: trazados (archivo 20)',
         (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'trazados_gps')::text,
         case when (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'trazados_gps') = 1 then 'OK' else 'FALTA: ejecuta 20_mapa_gps.sql' end
  union all
  select 27, 'Facturas, mapas guardados y formularios escaneados (archivo 21)',
         ((select count(*) from information_schema.columns where table_schema = 'public' and ((table_name = 'movimientos' and column_name = 'factura_path') or (table_name = 'bajas' and column_name in ('lat','formulario_path')) or (table_name = 'mantenimientos' and column_name in ('lat','formulario_path')) or (table_name = 'instalaciones' and column_name = 'formulario_path')))
          + (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'mapas_proyecto'))::text,
         case when (select count(*) from information_schema.columns where table_schema = 'public' and ((table_name = 'movimientos' and column_name = 'factura_path') or (table_name = 'bajas' and column_name in ('lat','formulario_path')) or (table_name = 'mantenimientos' and column_name in ('lat','formulario_path')) or (table_name = 'instalaciones' and column_name = 'formulario_path'))) = 6
               and (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'mapas_proyecto') = 1
              then 'OK' else 'FALTA: ejecuta 21_facturas_mapas_formularios.sql' end
  union all
  select 28, 'Banco: movimientos, reconocimiento de pagos y listas (archivo 22)',
         ((select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('banco_movimientos','banco_alias'))
          + (select count(*) from information_schema.views where table_schema = 'public' and table_name in ('v_habilitar','v_cortar'))
          + (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('registrar_movimiento_banco','conciliar_banco','aplicar_banco','ignorar_banco','registrar_pago_sistema')))::text,
         case when (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('banco_movimientos','banco_alias')) = 2
               and (select count(*) from information_schema.views where table_schema = 'public' and table_name in ('v_habilitar','v_cortar')) = 2
               and (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('registrar_movimiento_banco','conciliar_banco','aplicar_banco','ignorar_banco','registrar_pago_sistema')) = 5
              then 'OK' else 'FALTA: ejecuta 22_banco.sql' end
  union all
  select 29, 'Inversores en dólares o bolivianos y comprobante (archivo 23)',
         (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'inversores' and column_name in ('moneda','monto_original','tipo_cambio','interes_modo','interes_monto','interes_base','comprobante_path'))::text,
         case when (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'inversores' and column_name in ('moneda','monto_original','tipo_cambio','interes_modo','interes_monto','interes_base','comprobante_path')) = 7 then 'OK' else 'FALTA: ejecuta 23_inversores_moneda.sql' end
  union all
  select 30, 'Eliminar proyectos y zonas, y propósito de la inversión (archivo 24)',
         ((select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'inversores' and column_name = 'proposito')
          + (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('resumen_eliminacion','eliminar_definitivo')))::text,
         case when (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'inversores' and column_name = 'proposito') = 1
               and (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('resumen_eliminacion','eliminar_definitivo')) = 2
              then 'OK' else 'FALTA: ejecuta 24_eliminar_y_propositos.sql' end
  union all
  select 31, 'Eliminar clientes, solo el administrador principal (archivo 25)',
         (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('es_admin_principal','resumen_eliminacion_cliente','eliminar_cliente'))::text,
         case when (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('es_admin_principal','resumen_eliminacion_cliente','eliminar_cliente')) = 3 then 'OK' else 'FALTA: ejecuta 25_eliminar_cliente.sql' end
  union all
  select 32, 'Simulador privado por cuenta (archivo 26)',
         (select count(*) from pg_policies where schemaname = 'public' and tablename = 'simulaciones' and policyname = 'p_solo_propias')::text,
         case when (select count(*) from pg_policies where schemaname = 'public' and tablename = 'simulaciones' and policyname = 'p_solo_propias') = 1 then 'OK' else 'FALTA: ejecuta 26_simulador_privado.sql' end
  union all
  select 33, 'Agenda de dirigentes privada (archivo 27)',
         ((select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('agenda_contactos','agenda_llamadas','agenda_recordatorios','agenda_compartido'))
          + (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('agenda_personas','agenda_puede_ver','agenda_puede_editar','agenda_es_dueno')))::text,
         case when (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('agenda_contactos','agenda_llamadas','agenda_recordatorios','agenda_compartido')) = 4
               and (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('agenda_personas','agenda_puede_ver','agenda_puede_editar','agenda_es_dueno')) = 4
              then 'OK' else 'FALTA: ejecuta 27_agenda.sql' end
  union all
  select 34, 'Historial de la Agenda (archivo 28)',
         (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'agenda_eventos')::text,
         case when (select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'agenda_eventos') = 1 then 'OK' else 'FALTA: ejecuta 28_agenda_historial.sql' end
  union all
  select 35, 'Fondo de inversión: inversores generales y fuente de cada gasto (archivo 29)',
         ((select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'fin_movimientos' and column_name in ('fuente','fuente_detalle'))
          + (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'inversores' and column_name = 'zona_id' and is_nullable = 'YES')
          + (select count(*) from information_schema.views where table_schema = 'public' and table_name = 'v_fondo_inversion')
          + (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'fondo_saldo'))::text,
         case when (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'fin_movimientos' and column_name in ('fuente','fuente_detalle')) = 2
               and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'inversores' and column_name = 'zona_id' and is_nullable = 'YES') = 1
               and (select count(*) from information_schema.views where table_schema = 'public' and table_name = 'v_fondo_inversion') = 1
               and (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'fondo_saldo') = 1
              then 'OK' else 'FALTA: ejecuta 29_fondo_inversion.sql' end
  union all
  select 36, 'Dinero disponible, historial de compras y fotos de instalación (archivo 30)',
         ((select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'movimientos' and column_name in ('fuente','fuente_detalle','fin_movimiento_id'))
          + (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'gastos_empresa' and column_name in ('proyecto_id','zona_id','fuente','fuente_detalle'))
          + (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'instalaciones' and column_name = 'fotos')
          + (select count(*) from information_schema.views where table_schema = 'public' and table_name in ('v_gasto_fuente','v_ingreso_mes_zona','v_ingresos_disponibles'))
          + (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('ingreso_saldo','validar_fuente')))::text,
         case when (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'movimientos' and column_name in ('fuente','fuente_detalle','fin_movimiento_id')) = 3
               and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'gastos_empresa' and column_name in ('proyecto_id','zona_id','fuente','fuente_detalle')) = 4
               and (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'instalaciones' and column_name = 'fotos') = 1
               and (select count(*) from information_schema.views where table_schema = 'public' and table_name in ('v_gasto_fuente','v_ingreso_mes_zona','v_ingresos_disponibles')) = 3
               and (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname in ('ingreso_saldo','validar_fuente')) = 2
              then 'OK' else 'FALTA: ejecuta 30_dinero_disponible.sql' end
) r order by n;
