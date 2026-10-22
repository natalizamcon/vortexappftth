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
## VERSIÓN 1.3 · Crear zona paso a paso, socios por zona, simulador y presupuesto
1. **Primero la base de datos:** en Supabase → SQL Editor → New query, pega `sql/4_simulador_presupuesto.sql` y pulsa Run. (Es seguro, no cambia nada existente.)
2. Sube los archivos nuevos con Git (pasos de arriba).
3. En la app: **Finanzas → Simulador / Presupuesto / Presupuesto vs real**.
4. Para comprobar: ejecuta `sql/3_verificar_instalacion.sql`; ahora deben salir 10 filas en OK.

### Novedades de la 1.3
1. En Supabase → SQL Editor ejecuta, en este orden y solo si no lo hiciste: `sql/4_simulador_presupuesto.sql` y luego `sql/5_zonas_y_socios.sql`.
2. Menú **Zonas → + Crear zona**: asistente de 8 pasos (datos, socios, inversores, planes, red, costos fijos, meta, resumen).
3. En una zona "con socios", el botón **Socios** permite dar o quitar acceso cuando quieras.
4. `sql/3_verificar_instalacion.sql` ahora tiene 11 filas; todas deben decir OK.
