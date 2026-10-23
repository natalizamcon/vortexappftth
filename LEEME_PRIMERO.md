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
