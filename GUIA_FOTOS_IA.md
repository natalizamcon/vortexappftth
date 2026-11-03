# Lectura de fotos con IA · Guía de activación

Con esto la app puede **leer fotos** y proponerte los datos para que no los escribas a mano:

| Dónde | Qué lee |
|---|---|
| Instalaciones → Nueva instalación | La etiqueta del equipo (serie, MAC, modelo), la potencia del medidor y el carnet del cliente |
| Clientes → Pagos | El comprobante de pago (monto, fecha, referencia, banco) |
| Inventario → Materiales y equipos → Equipos con serie | La etiqueta de un equipo nuevo |
| Instalaciones y servicios → Instalaciones, Bajas y Mantenimientos | **La hoja completa llena a mano** (botón "Escanear la orden… llena a mano"): llena todos los campos y marca la ubicación del celular |

La IA **solo propone**: siempre ves los datos y tú decides si los usas. Nada se guarda solo.
Si no haces esta guía, la app funciona igual; los botones de lectura solo mostrarán un aviso.

## Paso 1 · Conseguir la clave de la IA (una sola vez)
1. Entra a **console.anthropic.com** y crea tu cuenta o inicia sesión.
2. Ve a **API keys → Create key**, ponle de nombre "Vortex" y **copia la clave** (empieza con `sk-ant-`). Solo se muestra una vez.
3. En **Billing**, agrega saldo y fija un **límite mensual de gasto** (por ejemplo, el que tú decidas). Cada foto cuesta una fracción muy pequeña, pero el límite te da tranquilidad.

## Paso 2 · Poner 3 datos en Netlify
En Netlify abre tu sitio → **Site configuration → Environment variables → Add a variable** y agrega estas tres (el nombre exactamente así, en mayúsculas):

| Nombre | Qué pones |
|---|---|
| `ANTHROPIC_API_KEY` | La clave que copiaste en el paso 1 |
| `SUPABASE_URL` | El mismo **Project URL** de tu Supabase (Supabase → Project settings → API) |
| `SUPABASE_ANON_KEY` | La misma clave pública **anon public** de esa pantalla |

Opcional: `ANTHROPIC_MODEL` si quieres usar otro modelo de IA (si no la pones, se usa el de por defecto).

## Paso 3 · Volver a publicar
En Netlify ve a **Deploys → Trigger deploy → Deploy site**. Cuando diga **Published**, ya funciona.

## Paso 4 · Probarlo
Entra a la app, abre **Instalaciones → Nueva instalación**, toca **Elegir o tomar foto** en "Leer la etiqueta del equipo" y luego **Leer con IA**. En el celular se abre la cámara.

## Consejos para que lea bien
- Foto de cerca, de frente, con buena luz y sin reflejos.
- Una sola etiqueta o comprobante por foto.
- Revisa siempre el número de serie y la MAC antes de usar los datos.

## Seguridad y privacidad
- La clave de la IA vive solo en Netlify; nunca llega al navegador.
- Solo pueden usarla los usuarios que entraron a la app y tienen la cuenta activa. Hay un límite de 60 lecturas por hora por usuario.
- La foto se manda a Anthropic únicamente para leerla. Vortex no la guarda, salvo la que tú adjuntes como respaldo (comprobante o foto del equipo).
- El carnet es un dato personal: úsalo solo si el cliente está de acuerdo.

## Escanear las hojas llenas a mano (instalación, baja y mantenimiento)
La idea: el instalador llena la hoja a mano en la casa del cliente (una copia se deja con el cliente), le toma **una foto** y la app hace el resto.

1. En **Formularios** imprime la hoja: *Orden de instalación*, *Orden de baja de servicio* u *Orden de mantenimiento*.
2. **Instalación:** en la app toca **📷 Escanear hoja de instalación** (está en Instalaciones y servicios, tanto en el Panel operativo como en la pestaña Instalaciones). En el celular se abre la cámara. Toma la foto.
3. **Todo pasa solo:** la app guarda la foto, marca la ubicación del celular (el navegador pide permiso la primera vez: acéptalo), lee la hoja con IA y llena el formulario de la instalación.
4. Revisa los campos (te avisa lo que no pudo leer), corrige lo que haga falta y toca **Registrar instalación**. Si la IA llenó algo mal, **Deshacer lo que se llenó** lo deja como estaba.
5. La foto de la hoja queda guardada con la instalación: se ve en la lista de instalaciones y en la ficha del cliente ("Ver la hoja firmada").

**Baja y mantenimiento** funcionan igual desde sus pestañas: **Tomar foto de la hoja** dentro del formulario.

**Si la IA todavía no está activada** (o no puede leer la hoja), la foto y la ubicación se guardan igual y el formulario se llena a mano: no se pierde nada.

Consejos: letra clara y en mayúsculas ayuda mucho; marca las casillas con una X bien visible; fotografía la hoja entera, de frente, sin sombras ni reflejos. Si la IA no encuentra un plan, una NAP o un cliente que sí existe, te avisa y lo eliges a mano.
