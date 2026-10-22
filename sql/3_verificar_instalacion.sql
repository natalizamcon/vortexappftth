-- =====================================================================
--  VORTEX · REVISAR QUE TODO QUEDÓ BIEN INSTALADO (solo lee, no cambia nada)
--  Pégalo en SQL Editor y pulsa Run. Debe salir "OK" en las 18 filas.
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
) r order by n;
