# VORTEX · Gestión integral para tu ISP de fibra óptica

Esta carpeta es el programa completo (se ve bien en computadora y en celular). Para ponerlo a funcionar solo necesitas:
**(1)** pegar dos archivos de texto en Supabase, **(2)** escribir 2 datos de conexión y **(3)** publicarlo en Netlify.
No hace falta la CLI de Supabase, ni Edge Functions, ni armar tablas a mano.

---
## PARTE 1 · En Supabase (la base de datos)

**Paso 1 – Crear el proyecto.** Entra a supabase.com → *New project*. Ponle nombre (Vortex), elige una contraseña y espera 1–2 minutos.

**Paso 2 – Permitir que el administrador cree usuarios desde el sistema.**
Menú izquierdo *Authentication* → *Sign In / Providers* (o *Providers*) → *Email* → **desactiva “Confirm email”** → Guardar.
(Así, cuando crees un socio o empleado dentro del programa, podrá entrar enseguida. Quien se registre por su cuenta no verá nada hasta que tú le des acceso.)

**Paso 3 – Crear toda la base de datos (un solo pegado).**
Menú *SQL Editor* → *New query* → abre el archivo **`sql/1_crear_base_de_datos.sql`**, copia TODO, pégalo y pulsa **Run**.
Si Supabase pregunta por “operaciones destructivas”, pulsa confirmar: solo reemplaza reglas internas que el propio script crea. Debe terminar con “Success”. Esto crea las tablas, la seguridad por proyecto (un socio solo ve lo suyo), los cálculos de pagos y inventario, y las carpetas de archivos.

**Paso 4 – Crear TU usuario administrador.**
*Authentication* → *Users* → *Add user* → *Create new user*. Pon tu correo y una contraseña y marca **Auto Confirm User**. Guarda.

**Paso 5 – Dejarte como administrador.**
Vuelve a *SQL Editor* → *New query* → abre **`sql/2_hacer_administrador.sql`**, cambia `CAMBIA-ESTO@tucorreo.com` por tu correo exacto y pulsa **Run**. Debe responder: “Listo: … ahora es administrador.”

**Paso 6 – Carpetas para fotos y comprobantes.** Ya se crearon solas en el Paso 3 (nombres exactos: **`comprobantes`** y **`fotos`**, ambas **privadas**). Para comprobarlo: menú *Storage*. Si por algún motivo no aparecen, créalas tú: *New bucket* → ese nombre → deja “Public bucket” **apagado** → Create.

**Paso 7 – Copiar los dos datos de conexión.**
*Project Settings* (engranaje) → *API*. Copia:
- **Project URL** (empieza con https://…supabase.co)
- **Publishable key** o **anon public key** (una clave larga).
Nunca uses la clave `service_role`: esa es secreta.

---
## PARTE 2 · Conectar el programa (2 líneas)

Abre el archivo **`src/config.ts`** y reemplaza los dos textos:

```ts
export const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
export const SUPABASE_ANON_KEY = "tu-clave-publica-larga";
```
(Si prefieres no tocar el archivo, en Netlify puedes crear las variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con esos mismos dos valores.)

---
## PARTE 3 · Publicarlo en Netlify

**Camino fácil (recomendado):**
1. Crea una cuenta en github.com → *New repository* (nombre: vortex) → en la página del repositorio pulsa *uploading an existing file* y arrastra **todo el contenido** de esta carpeta (los archivos, no el .zip). Pulsa *Commit changes*.
2. En netlify.com → *Add new site* → *Import an existing project* → GitHub → elige `vortex`.
3. Netlify ya lee la configuración sola (`npm run build`, carpeta `dist`). Pulsa **Deploy**. En 1–2 minutos te da tu dirección web.

**Camino alternativo (si tienes Node instalado):** en esta carpeta ejecuta `npm install` y luego `npm run build`; arrastra la carpeta **`dist`** a netlify.com/drop.

---
## PARTE 4 · Primer uso
1. Entra con el correo y la contraseña del Paso 4.
2. **Proyectos y zonas** → crea tu primer proyecto y su primera zona (se crean solos su almacén y 3 planes base; cámbialos si quieres).
3. **Red FTTH** → crea las NAP de la zona (sus puertos se crean solos).
4. **Clientes** → *Nueva instalación*. El primer mes se prorratea por días reales.
5. **Usuarios** (solo administrador) → *Crear usuario*: elige su rol y **a qué proyectos tiene acceso**. Un socio solo verá esos proyectos: la base de datos se lo impide con cualquier otro, aunque intente entrar por una dirección o consulta directa.

---
## Qué incluye esta versión
Dashboard · Proyectos y zonas (planes, costos fijos, fecha de corte) · Clientes (base de datos completa, instalación con puerto libre, baja) · Cobranzas (estados, pagos completos/parciales/anticipados con comprobante obligatorio, no cortar, suspender, reconectar, historial, pagos mes a mes) · Red FTTH (NAP, puertos, reservas, historial de la red) · Mantenimientos con seguimiento día por día · Viajes con avance y gastos diarios · Inventario con almacén central y uno por zona, movimientos que validan el stock, equipos con serie · Finanzas (resumen OPEX/CAPEX, ingresos y gastos, inversores y sus pagos, pagos al personal, caja y fondos) · Usuarios, roles y socios por proyecto.

## Qué NO está todavía (estaba en la vista previa)
Simulador de proyecto y guía de presupuesto · Centro de alertas · Paneles operativo, de red y de clientes con gráficos · Formularios imprimibles y lectura de fotos con IA · Mapa GPS (KML/KMZ) · Lector de QR · Compras de la empresa · Órdenes de trabajo · Reparto de ganancias por porcentaje. Se pueden agregar por etapas sobre esta misma base.

## Notas
- La pantalla muestra hasta 1.000 filas por lista (límite normal de Supabase). Para más, se agrega paginación.
- Esta carpeta fue revisada (sintaxis y estructura del SQL), pero no pude instalarla ni ejecutarla aquí. Si Netlify muestra un error al publicar, mándame el texto del error y lo corrijo.

---
## ACTUALIZACIONES (con Git)
Cada vez que recibas una versión nueva:
1. Descomprime `vortex-actualizacion-….zip` y copia su contenido **encima** de tu carpeta del proyecto (no incluye `src/config.ts`, así tus claves no se pisan).
2. En la terminal, dentro de la carpeta del proyecto:
```
git status
git add .
git commit -m "Actualización: descripción corta"
git push origin main
```
3. Netlify publica solo en 1–2 minutos. Si trae un archivo SQL nuevo, pégalo antes en el SQL Editor de Supabase.
4. Para revisar que la base esté bien: ejecuta `sql/3_verificar_instalacion.sql` (todo debe decir OK).

---
## VERSIÓN 2.0 · Finanzas ordenada en carpetas, red perfeccionada, red completa, reportes, formularios imprimibles y contrato, centro de alertas, papelera (nada se elimina), crear zona paso a paso, socios por zona, simulador y presupuesto
1. **Primero la base de datos:** en Supabase → SQL Editor → New query, pega `sql/4_simulador_presupuesto.sql` y pulsa Run. (Es seguro, no cambia nada existente.)
2. Sube los archivos nuevos con Git (pasos de arriba).
3. En la app: **Finanzas → Simulador / Presupuesto / Presupuesto vs real**.
4. Para comprobar: ejecuta `sql/3_verificar_instalacion.sql`; ahora deben salir 10 filas en OK.

### Novedades de la 1.3
1. En Supabase → SQL Editor ejecuta, en este orden y solo si no lo hiciste: `sql/4_simulador_presupuesto.sql` y luego `sql/5_zonas_y_socios.sql`.
2. Menú **Zonas → + Crear zona**: asistente de 8 pasos (datos, socios, inversores, planes, red, costos fijos, meta, resumen).
3. En una zona "con socios", el botón **Socios** permite dar o quitar acceso cuando quieras.
4. `sql/3_verificar_instalacion.sql` ahora tiene 11 filas; todas deben decir OK.

### Novedades de la 1.4 · Papelera
1. En Supabase → SQL Editor ejecuta `sql/6_papelera.sql` (es seguro, no borra datos).
2. Zonas, espacios, gastos, inversores, materiales, equipos, simulaciones y líneas de presupuesto ahora van **"A la papelera"** en vez de borrarse.
3. Menú **Papelera** (solo administrador): ver y **Restaurar**.
4. Mandar una zona o un espacio a la papelera oculta también todo lo que contiene; al restaurarla vuelve todo.
5. La app ya no puede borrar de verdad. `sql/3_verificar_instalacion.sql` ahora tiene 12 filas en OK.

### Novedades de la 1.5 · Centro de alertas
1. En Supabase → SQL Editor ejecuta `sql/7_alertas.sql` (solo crea 2 vistas de lectura).
2. Menú **Alertas** (con numerito rojo) y un bloque "Lo que necesita tu atención" en el Dashboard.
3. Alertas de cobranza, red, mantenimientos y viajes, inventario e inversores/metas/presupuesto. Cada persona ve solo lo que su rol permite.
4. `sql/3_verificar_instalacion.sql` ahora tiene 13 filas en OK.

### Novedades de la 1.6 · Formularios
1. No necesita SQL nuevo: solo sube los archivos.
2. Menú **Formularios**: contrato, orden de instalación, ficha de NAP, troncal, fusiones, lista de compras de ferretería y gastos del viaje.
3. Se pueden llenar solos con datos de un cliente, una NAP o un viaje, o imprimir en blanco. Botón **Imprimir / Guardar PDF**.
4. El texto del contrato es un modelo: define las partes en amarillo y pide a un abogado que lo revise.

### Novedades de la 1.7 · Reportes
1. En Supabase → SQL Editor ejecuta `sql/8_reportes.sql` (solo crea 2 vistas de lectura).
2. Menú **Reportes**: 11 informes (morosidad, clientes con deuda, cobranza, planes, altas y bajas, NAP, instalaciones, mantenimientos, materiales, ingresos y gastos, equipos). Se pueden exportar a Excel o imprimir/guardar en PDF.
3. `sql/3_verificar_instalacion.sql` ahora tiene 14 filas en OK.

### Novedades de la 1.8 · Red completa
1. En Supabase → SQL Editor ejecuta `sql/9_red_completa.sql` (es seguro, no borra datos).
2. Menú **Red FTTH**: Panel de red, NAP y puertos, Troncales, Hilos y fusiones, Postes, OLT y PON, Historial.
3. Troncales, fusiones, postes y OLT van **"A la papelera"** (se restauran desde el menú Papelera).
4. Nuevas alertas (troncales sin hilos libres, fusiones con pérdida alta) y un reporte de utilización de troncales (ahora 12 reportes).
5. `sql/3_verificar_instalacion.sql` ahora tiene 15 filas en OK.

### Novedades de la 1.9 · Finanzas
1. En Supabase → SQL Editor ejecuta `sql/10_finanzas_reparto.sql` (es seguro, no borra datos; pasa tus movimientos de fondos al nuevo sistema).
2. Finanzas (administrador): **Reparto de utilidades**, **Socios y porcentajes**, **Costos compartidos**, **Gastos de la empresa** y **Caja y fondos** (ahora de la empresa).
3. Finanzas (socio): pestaña **Mi reparto**.
4. Utilidad = cobrado − gastos operativos − costos compartidos − pagos a inversores. Primero los socios, y lo que queda para el dueño se divide en los 4 fondos.
5. `sql/3_verificar_instalacion.sql` ahora tiene 16 filas en OK.

### Novedades de la 2.0 · Finanzas ordenada en carpetas y Red perfeccionada
1. En Supabase → SQL Editor ejecuta, **en este orden**: `sql/11_finanzas_orden.sql` y luego `sql/12_red_perfeccionada.sql` (es seguro, no borra datos).
2. **Finanzas en 4 carpetas**, cada una con sus pestañas:
   - **Panel:** Rentabilidad · Ingresos y gastos (con gráficos de a dos).
   - **Inversores y reparto:** Inversores · Reparto de utilidades · Socios y porcentajes · Caja y fondos (el socio ve "Mi reparto").
   - **Simulador y presupuesto:** Simulador de proyecto (resultados en vivo a un costado) · Presupuesto de la zona · Presupuesto vs real.
   - **Costos y compras:** Costos compartidos · Gastos de la empresa · Compras de la empresa · Pagos al personal.
3. **Red:** NAP con editar / ampliar puertos / papelera, historial de cada puerto, editar troncales, fusiones, OLT y postes, destino y notas en los hilos, ver fotos.
4. En todas las listas con botón "Editar" y "Ver archivo" donde corresponde.
5. `sql/3_verificar_instalacion.sql` ahora tiene 18 filas en OK.

### Novedades de la 2.1 · Red como en el prototipo y Finanzas afinada
1. En Supabase → SQL Editor ejecuta `sql/13_red_como_prototipo.sql` (va después del 12; es seguro, no borra datos).
2. **Menú:** "Red" quedó junto a Dashboard. Zonas, Usuarios y Papelera ahora están juntos en **Configuración** (solo administrador).
3. **Red tiene 7 pestañas:** Panel de red · Costos fijos · Costos variables · Red y NAP · Troncales y postes · Mapa · Historial de la red. Se quitó OLT y PON de la pantalla.
4. **Finanzas:** Pagos al personal como en el prototipo; Caja y fondos incluye el reparto del mes con porcentajes de socios para ese mes (ya no existen "Reparto de utilidades" ni "Socios y porcentajes" como pestañas); Presupuesto de la zona con barras de avance; Ingresos y gastos con rango de fechas.
5. `sql/3_verificar_instalacion.sql` ahora tiene 19 filas en OK.

### Novedades de la 2.2 · Clientes como en el prototipo
1. En Supabase → SQL Editor ejecuta `sql/14_clientes_como_prototipo.sql` (solo crea 3 vistas de lectura; va después del 13).
2. **Clientes** quedó después de Red y reúne 6 pestañas: Panel de clientes · Clientes · Paquetes · Cobranzas · Pagos · Registro de pagos. Cobranzas ya no es un menú aparte.
3. Al tocar un cliente se abre su **ficha** al costado, con la marca de **usuario conflictivo**. Las acciones de cobranza (Pago, No cortar, Suspender, Cortar por falta de pago, Reconectar) también se abren al costado.
4. **Paquetes:** los cambios de velocidad, precio, activo y día de corte solo se aplican con el botón **Efectuar cambios**.
5. **Pagos:** al escribir el monto se ve en vivo a qué meses se aplica.
6. `sql/3_verificar_instalacion.sql` ahora tiene 20 filas en OK.

### Novedades de la 3.0 · Instalaciones y servicios, proyectos y socios
1. En Supabase → SQL Editor ejecuta `sql/15_servicios_y_proyectos.sql` (después del 14; no borra datos).
2. **Menú:** Dashboard · Red · Clientes · Instalaciones y servicios · Inventario · Finanzas · Formularios · Centro de alertas · Reportes · Configuración. "Mantenimientos y viajes" ahora es **Instalaciones y servicios**.
3. **+ Nueva zona** (asistente paso a paso, pregunta si tiene socios) y **+ Nuevo proyecto** vuelven a estar arriba de Red, Clientes e Instalaciones y servicios.
4. **Red → Historial de la red → Socios del proyecto:** agregar, quitar o cambiar de proyecto a un socio. Cada cambio queda en el historial.
5. **Clientes:** el Panel y el Registro de pagos usan el buscador por fechas de Finanzas.
6. **Instalaciones y servicios:** Panel operativo con órdenes de trabajo · Instalaciones · Bajas · Mantenimientos · Instaladores · Avance y viajes (Avance del plan, Viajes y gastos con seguimiento, Diario de la zona y Gastos adicionales).
7. Al **finalizar un viaje**, su costo pasa solo a gastos operativos (Transporte). No se crea retroactivamente para viajes ya finalizados.
8. `sql/3_verificar_instalacion.sql` ahora tiene 21 filas en OK.

### Novedades de la 3.1 · Inventario como en el prototipo + socios en Finanzas
1. En Supabase → SQL Editor ejecuta `sql/16_inventario_y_socios.sql` (después del 15; no borra datos).
2. **Inventario** tiene 3 pestañas: Almacenes · Panel de inventario · Materiales y equipos (con Materiales y Equipos con serie). Cada proyecto tiene su almacén central, un almacén por zona y uno de vehículo / técnico.
3. **Precio editable:** al ingresar material (o comprar desde Materiales) escribes el precio realmente pagado; el costo del artículo pasa a ser el promedio entre lo que había y lo comprado. El costo también se puede cambiar directo en la tabla de Materiales.
4. **Finanzas → Inversores y fondos → Socios:** agregar un socio nuevo o existente a una zona (con su %) o a un proyecto, y quitarlo.
5. `sql/3_verificar_instalacion.sql` ahora tiene 22 filas en OK.

### Novedades de la 3.2 · Centro de alertas
1. En Supabase → SQL Editor ejecuta `sql/17_alertas_centro.sql` (después del 16; no borra datos).
2. **Centro de alertas** tiene 3 pestañas: Activas · Historial · Destinatarios y reglas. Las alertas tienen 4 prioridades (Crítica, Alta, Media, Baja) y se separan por proyecto y zona.
3. **Revisada** y **Resolver** (con nota opcional) mueven la alerta al Historial; allí se puede **Reabrir**. Si el problema cambia (por ejemplo, de 2 a 3 clientes con deuda), la alerta vuelve a aparecer sola.
4. **Destinatarios y reglas:** el administrador marca qué rol recibe cada alerta; cada usuario ve solo las alertas que le corresponden según su rol y sus proyectos.
5. El numerito del menú cuenta todas las alertas activas.
6. `sql/3_verificar_instalacion.sql` ahora tiene 23 filas en OK.

### Novedades de la 3.3 · Configuración y Dashboard
1. En Supabase → SQL Editor ejecuta `sql/18_configuracion.sql` (después del 17; no borra datos y los usuarios que ya tienes siguen igual).
2. **Configuración** (al final del menú): Usuarios · Roles y permisos · Socios y proyectos · Zonas · Papelera.
   - Usuarios: al tocar uno se abre su ficha con rol, estado, proyectos y **zonas** (si no marcas zonas, ve todas las del proyecto; la base de datos le oculta las demás).
   - Roles y permisos: matriz Ver / Crear / Editar / Eliminar por módulo, activar o desactivar roles y crear roles propios.
   - Socios y proyectos: registrar socio, crear proyecto, asignar proyectos, activar o desactivar.
3. **Dashboard** nuevo (Dashboard primero en el menú): período con fechas, CAPEX y recuperación, 8 indicadores, evolución del negocio (a la mitad del ancho), Cobranzas, Finanzas, Red FTTH, Operaciones, próximas tareas y actividad reciente.
4. Barra superior con **buscador** (clientes, NAP, equipos), campana de alertas y menú de usuario.
5. `sql/3_verificar_instalacion.sql` ahora tiene 24 filas en OK.

### Novedades de la 3.4 · Zonas dentro de su proyecto, compras en el inventario y vista por almacén
1. En Supabase → SQL Editor ejecuta `sql/19_zonas_y_compras.sql` (después del 18; no borra datos).
2. **Nueva zona** ya no crea un proyecto: la zona queda dentro del proyecto que elijas en el asistente. Si quieres un proyecto nuevo, créalo antes con "+ Nuevo proyecto".
3. **Compras de la empresa** entran solas al inventario (proyecto y almacén que elijas, con el precio pagado). Las compras que ya tenías pasan una vez al inventario del proyecto principal. Si cambias el almacén de una compra, el material se mueve.
4. **Inventario → Almacenes:** selector "Ver almacén" (Todos o uno), con la lista de materiales, herramientas y demás de ese almacén, filtro por categoría, búsqueda y los equipos con serie.
5. `sql/3_verificar_instalacion.sql` ahora tiene 25 filas en OK.

### Novedades de la 3.5 · Mapa GPS y lectura de fotos con IA
1. En Supabase → SQL Editor ejecuta `sql/20_mapa_gps.sql` (después del 19; solo crea la tabla de trazados).
2. **Red → Mapa:** mapa con NAP, postes, clientes y trazados de fibra (calle o satélite), capas que se prenden y apagan, importar archivos **KML, KMZ y GPX**, exportar a KML, "Ubicarme" y crear un poste tocando el mapa.
3. **Lectura de fotos con IA** (etiqueta del equipo, potencia, carnet y comprobante de pago). Para activarla sigue `GUIA_FOTOS_IA.md` (3 variables en Netlify).
4. En Nueva instalación también hay un botón **📍 Usar mi ubicación** para llenar el GPS del cliente.
5. `sql/3_verificar_instalacion.sql` ahora tiene 26 filas en OK.

### Novedades de la 3.6 · Facturas, mapas de maps.me y formularios escaneados
1. En Supabase → SQL Editor ejecuta `sql/21_facturas_mapas_formularios.sql` (después del 20; no borra datos).
2. **Inventario:** al ingresar material puedes adjuntar la factura; se ve en "Movimientos recientes" y en el botón **Facturas** de cada material (donde también puedes adjuntar una que falte). Las compras de la empresa pasan su factura al inventario.
3. **Red → Mapa → Mapas del proyecto:** sube el archivo de maps.me (KMZ o KML) tal cual; queda guardado con sus colores y lo abres cuando quieras (Abrir, Descargar, Convertir en postes y trazados, Quitar).
4. **Escanear formularios:** en Nueva instalación, Bajas y Registrar mantenimiento hay un botón para fotografiar la hoja llena a mano; la app llena todo y marca la ubicación. En Formularios hay dos hojas nuevas (Orden de baja y Orden de mantenimiento) y la de instalación trae referencia y precio de instalación. Requiere activar la IA (`GUIA_FOTOS_IA.md`).
5. `sql/3_verificar_instalacion.sql` ahora tiene 27 filas en OK.

### También en la 3.6 · Mejoras para usar el sistema en el celular
- Menú superior que se desliza de lado en una sola fila, y pestañas que también se deslizan (antes ocupaban hasta 3 filas).
- Mapa, Historial de la red y Roles y permisos ahora apilan sus paneles en pantallas angostas (antes se veían apretados).
- Botones y casillas más grandes para tocarlos con el dedo; se corrigió el desborde en Gastos adicionales.

### Novedades de la 3.7 · Menú lateral y escaneo de hojas en un solo toque
1. **Menú lateral desplegable (☰):** la barra de arriba ahora es delgada (menú de tres rayitas a la izquierda, sección actual, filtros, búsqueda, campana y usuario). El menú se abre desde la izquierda y se cierra al elegir una opción, al tocar fuera o con Esc.
2. **Escanear hoja de instalación:** botón **📷 Escanear hoja de instalación** (Panel operativo e Instalaciones). Un solo toque: se abre la cámara y, al tomar la foto, se guarda la foto, se marca la ubicación, se lee la hoja y se llena el formulario. Con **Deshacer**. Si la IA no está activada, la foto y la ubicación se guardan igual.
3. La baja y el mantenimiento escanean igual, y la ficha del cliente tiene el botón **Ver la hoja firmada**.
4. Requiere haber corrido `sql/21_facturas_mapas_formularios.sql` (si aún no lo hiciste, córrelo antes de publicar).

### Novedades de la 3.8 · Versión para celular
1. **Barra de arriba mínima en el celular:** solo ☰, la sección y la campana. Proyecto, zona, búsqueda y usuario están dentro del menú lateral. En computadora la barra sigue con todo, pero delgada.
2. **App instalable:** Vortex se puede instalar en la pantalla de inicio del celular (ver `GUIA_CELULAR.md`).
3. **Mapa:** el botón **Subir mapa** está arriba del mapa (visible en el celular). El selector de archivos ya no filtra por tipo, para que Android deje elegir los archivos KMZ y GPX de maps.me. Los mapas guardados se ven apenas se abre el mapa.
4. **Letrero "Powered by Netlify":** se apaga desde Netlify (Project configuration → General → Powered by Netlify badge); pasos en `GUIA_CELULAR.md`.

### Novedades de la 3.9 · Banco: pagos automáticos y listas de habilitar / cortar
1. En Supabase → SQL Editor ejecuta **`sql/21_facturas_mapas_formularios.sql`** (si aún no) y luego **`sql/22_banco.sql`**. No borran datos.
2. **Clientes → Banco y listas:**
   - **Lista del día:** quiénes pagaron y hay que **habilitar**, quiénes no han pagado y hay que **cortar**, y quiénes pagaron hoy. Botón **🔄 Actualizar lista ahora** (y se actualiza sola cada minuto). Copiar, CSV e imprimir.
   - **Movimientos del banco:** lo que llegó del banco, con reconocimiento automático por código (C-0001), carnet o nombres ya confirmados. Lo dudoso queda por revisar con botones de un toque.
   - **Importar extracto:** sube el CSV del banco o pega las filas desde Excel. Funciona hoy con cualquier banco.
   - **Conexión automática:** la dirección para que el banco o la pasarela avisen cada pago al instante. Ver `GUIA_BANCO.md`.
3. Se agregó `netlify/functions/banco-webhook.mjs` (hay que subir la carpeta `netlify`).
4. El menú lateral muestra "Vortex · versión 3.9" al pie (y la pantalla de ingreso también): sirve para comprobar que se publicó esta versión.
5. `sql/3_verificar_instalacion.sql` ahora tiene 28 filas en OK.

### Novedades de la 3.10 · Inversores en dólares, interés por % o por monto, comprobante y arreglo del mapa
1. En Supabase → SQL Editor ejecuta **`sql/23_inversores_moneda.sql`** (después del 22; no borra datos).
2. **Finanzas → Inversores y fondos → Inversores → Nuevo inversor:**
   - Eliges **Bolivianos o Dólares**. En dólares pones el **tipo de cambio que se usó** y te muestra el equivalente en Bs.
   - El interés se puede poner **por porcentaje** (por mes o por año) o **por monto** (por mes, por año o en total del plazo). Te muestra al instante el equivalente en % mensual y anual, cuánto pagarás por mes, el interés total y el total a devolver.
   - Puedes **subir el comprobante** (foto o PDF) de lo que invirtió; en la lista aparece "Ver comprobante".
3. **Mapa:** se corrigió el bloqueo de OpenStreetMap ("Access blocked"): los mapas de calle vuelven a verse. Si algún día OpenStreetMap limita el uso, se puede cambiar de proveedor con la variable de Netlify `VITE_MAPA_CALLE_URL` (ver la guía del celular).
4. `sql/3_verificar_instalacion.sql` ahora tiene 29 filas en OK.

### Novedades de la 3.11 · Eliminar proyectos y zonas, propósito de la inversión y contraseña
1. En Supabase → SQL Editor ejecuta **`sql/24_eliminar_y_propositos.sql`** (después del 23). No borra nada por sí solo.
2. **Eliminar proyectos y zonas** (solo el administrador): Configuración → **Proyectos y zonas** → botón **Eliminar…** en cada zona y cada proyecto. Si está vacío se elimina con un toque. Si tiene datos, muestra qué se perdería (clientes, pagos, NAP…) y hay que **escribir su nombre** para confirmar. También hay **Eliminar para siempre…** dentro de la Papelera. "A la papelera" sigue existiendo para poder recuperarlo. Queda un registro de lo eliminado.
3. **Inversores:** campo **"¿Para qué es esta inversión?"** al crearlo, visible en la lista y editable (botón "Editar nota").
4. **Contraseña:** en el ingreso hay un ojito 👁 para ver lo que escribes y **"¿Olvidaste tu contraseña?"** (te llega un correo con un enlace para crear una nueva). Dentro de la app, el menú ☰ tiene **🔑 Cambiar contraseña**. El administrador puede enviar ese enlace a cualquier usuario desde Configuración → Usuarios.
   **Para que el enlace del correo funcione:** en Supabase → Authentication → URL Configuration, pon como **Site URL** la dirección de tu sitio de Netlify y agrégala también en **Redirect URLs**.
5. `sql/3_verificar_instalacion.sql` ahora tiene 30 filas en OK.
6. **Ubicación precisa en las hojas y en "📍 Usar mi ubicación":** el celular ya no se queda con la primera lectura; sigue midiendo hasta unos 25 segundos y se queda con la más exacta (se detiene sola cuando llega a unos 12 m). Se ve "±8 m · precisa" y, si la precisión es baja (más de 50 m), avisa que salgas a la calle y toques "Volver a medir". Lo que escribas a mano en el GPS nunca se pisa.
7. **Pagos de varios meses:** en Clientes → Pagos hay **"¿Cuántos meses paga?"** (1, 2, 3, 6, **Año entero (12)** u otra cantidad) y **"Pagan desde el mes"**. Calcula solo el monto (salta los meses ya pagados), muestra de qué mes a qué mes cubre y deja una nota en observaciones. Se puede cambiar el monto a mano.

### Novedades de la 3.12 · Instalaciones nuevas en el mapa y eliminar clientes (solo administrador principal)
1. En Supabase → SQL Editor ejecuta **`sql/25_eliminar_cliente.sql`** (después del 24; no borra nada por sí solo).
2. **Mapa (Red → Mapa):**
   - Las instalaciones nuevas aparecen **solas**: el mapa se actualiza cada minuto y cada vez que vuelves a la pantalla (también hay botón **🔄 Actualizar**). No pierde el zoom ni tu posición.
   - Las instaladas en los **últimos 30 días** se ven con un **anillo naranja** y más grandes. Al tocarlas muestran dirección, teléfono, plan, NAP/puerto y fecha de instalación.
   - Si un cliente se instaló **sin coordenadas**, aparece en **"Clientes sin ubicación"**: tocas **Ubicar en el mapa** y marcas su casa con un toque, o **Estoy aquí (usar mi GPS)** si estás frente a ella.
3. **Eliminar clientes:** en la ficha de cada cliente, abajo, el botón **🗑 Eliminar este cliente…**. **Solo lo ve y lo puede usar el administrador principal** (la base de datos también lo exige; un rol personalizado, aunque tenga permisos de administrador, no puede). Muestra qué se perdería y pide escribir el código del cliente. Al eliminar: el puerto de la NAP queda libre, los equipos con serie vuelven al almacén y los movimientos del banco ligados vuelven a "por revisar". Queda un registro de lo eliminado. Para clientes que se fueron de verdad, usa **Dar de baja**, que conserva el historial.
4. `sql/3_verificar_instalacion.sql` ahora tiene 31 filas en OK.

### Novedades de la 3.13 · Simulador privado por cuenta y inversores que siempre se ven
1. En Supabase → SQL Editor ejecuta **`sql/26_simulador_privado.sql`** (después del 25). Si todavía no corriste el 23 y el 24, córrelos también (los inversores nuevos los necesitan).
2. **Simulador:** los **escenarios guardados son privados de cada cuenta**: cada persona ve solo los que guardó con su usuario (la base de datos lo exige; ni el administrador ve los de otras cuentas). Se llama ahora "Mis escenarios guardados". El presupuesto de cada zona sigue siendo compartido.
3. **Inversores:**
   - El mensaje de "guardado" o de error ahora aparece **junto al botón Agregar inversor** (antes salía arriba de la pantalla y no se veía).
   - El formulario trae **"Zona del inversor"**; al guardar, la pantalla pasa a esa zona para que lo veas en la lista.
   - Si falta correr el SQL 23 o 24, aparece un **aviso rojo arriba** diciendo cuál correr. Un inversor sencillo en bolivianos se guarda igual; con dólares, propósito o comprobante pide actualizar la base de datos primero.
   - Si la lista falla o está vacía por la zona elegida, ahora lo explica.
4. `sql/3_verificar_instalacion.sql` ahora tiene 32 filas en OK.

### Novedades de la 3.14 · Agenda de dirigentes (privada y compartible)
1. En Supabase → SQL Editor ejecuta **`sql/27_agenda.sql`** (después del 26; no borra nada).
2. Nuevo apartado **📒 Agenda** en el menú principal (segundo lugar, después del Dashboard), con un numerito rojo cuando tienes recordatorios de hoy o atrasados.
3. **Dirigentes:** anota nombre, teléfono, zona o comunidad, cargo, organización, ubicación (con GPS si quieres), cómo va (Nuevo, Contactado, Reunión agendada, Interesado, Negociando, Cerrado, Descartado) y notas. Solo el nombre es obligatorio. Hay botón "Guardar y agregar otro" para anotar varios seguidos. Búsqueda, filtros por zona, estado y quién lo anotó, y descarga de la lista.
4. **Llamar con un toque:** botones 📞 Llamar, 💬 WhatsApp y 📍 Cómo llegar (con GPS o con la referencia escrita).
5. **Llamadas:** se anota el resultado (contestó, no contestó, ocupado, número equivocado, reunión acordada, pidió que llame después) y una nota; de inmediato se ofrece "¿Cuándo vuelves a llamar?" (mañana, en 3 días, en 1 semana, el lunes) en un toque.
6. **Recordatorios** para volver a llamar, viajar a una reunión u otra cosa. La pestaña **Hoy y lo que viene** los ordena en atrasados, hoy, próximos 7 días y más adelante, con Hecho ✓, Posponer y 📅 para agregarlos al calendario del celular con alarma.
7. **Privacidad:** cada dirigente es privado de quien lo anotó. Solo lo ven las personas con las que él lo comparta, "solo para ver" o "para ver y anotar". Lo exige la base de datos: ni el administrador ve lo que otra cuenta no le compartió. Quien recibe uno compartido puede dejar de verlo cuando quiera.
8. `sql/3_verificar_instalacion.sql` ahora tiene 33 filas en OK.

### Novedades de la 3.15 · Calendario e historial completo en la Agenda
1. En Supabase → SQL Editor ejecuta **`sql/28_agenda_historial.sql`** (después del 27; no borra nada). Si no lo corres, la Agenda funciona igual: el historial solo mostrará llamadas y recordatorios.
2. **Calendario** (pestaña nueva de la Agenda): vista del mes con los días que tienen actividades programadas marcados con puntos de color (azul = llamar, morado = viaje o reunión, gris = otro, gris claro = hecha). Al elegir un día, **al lado** se ve lo programado para esa fecha, con Hecho ✓, Posponer, llamar, cómo llegar y 📅; si no hay nada, lo dice y ofrece **➕ Agregar actividad** (tipo, dirigente, hora y lugar). También se ven las llamadas anotadas ese día. En el celular el calendario va arriba y las actividades debajo.
3. **Historial completo de cada dirigente** (en su ficha): una línea de tiempo con cuándo se anotó, todas las llamadas, los recordatorios (creados y hechos) y los cambios (de estado, de datos, a quién se compartió), con filtros Todo / Llamadas / Recordatorios / Cambios.
4. **Pestaña Historial** de la Agenda: todo lo anterior de todos tus dirigentes juntos, con buscador, filtro por dirigente, por tipo y por fechas.
5. `sql/3_verificar_instalacion.sql` ahora tiene 34 filas en OK.

