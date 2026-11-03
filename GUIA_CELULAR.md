# Vortex en el celular · Guía rápida

## 1. Instalar Vortex como app (una sola vez por celular)
Así se abre en pantalla completa, con su ícono, sin la barra del navegador.

**Android (Chrome):** abre la dirección del sistema → toca los **tres puntos ⋮** → **Instalar app** (o **Agregar a la pantalla principal**) → Instalar.
**iPhone (Safari):** abre la dirección del sistema → toca **Compartir** (el cuadrado con la flecha) → **Agregar a pantalla de inicio** → Agregar.

## 2. Permisos que hay que aceptar la primera vez
- **Cámara:** para escanear las hojas, los comprobantes y las etiquetas.
- **Ubicación (GPS):** para marcar solas las instalaciones, bajas y mantenimientos. Si el celular pregunta "precisa o aproximada", elige **precisa**.
Si alguna vez se negó un permiso: ajustes del celular → Chrome o Safari → Permisos del sitio.

## 3. Cómo usar el menú
La barra de arriba es delgada: tres rayitas (☰), el nombre de la sección y la campana de alertas. Al tocar **☰** se abre el menú desde la izquierda; ahí están todas las secciones, el **proyecto y la zona**, el **buscador** y tu usuario con el botón **Salir**.

## 4. Subir el mapa de maps.me
1. En maps.me abre tu lista de marcadores → toca **⋮** → **Exportar** → elige **KMZ** (o KML) y guárdalo en el celular.
2. En Vortex ve a **Red → Mapa** → **Subir mapa** y elige el archivo.
3. Queda guardado en el proyecto: lo ves en el mapa y puedes abrirlo cuando quieras. Acepta KMZ, KML y GPX (los archivos `.kmb` de maps.me muy antiguo no se pueden leer: expórtalo de nuevo).

## 5. Quitar el letrero "Powered by Netlify" (lo hace el administrador, una vez)
Ese letrero no es de Vortex: lo pone Netlify en la esquina inferior derecha de las páginas públicas.
1. Entra a **app.netlify.com** y abre tu sitio.
2. Ve a **Project configuration → General → Powered by Netlify badge**.
3. **Apágalo** y toca **Save**.
Surte efecto en la siguiente carga, sin volver a publicar, y deja de verse para todos (incluidos los instaladores). Si no encuentras la opción, avísame y lo bloqueamos desde el código.

## 6. Si el mapa de calles no se ve
Se usa OpenStreetMap, que es gratis pero pide un uso moderado. Si algún día bloqueara el mapa, el administrador puede usar otro proveedor de mapas: en Netlify agrega la variable `VITE_MAPA_CALLE_URL` con la dirección de los azulejos del proveedor, por ejemplo `https://ejemplo.com/{z}/{x}/{y}.png` (con la llave que te dé el proveedor), y vuelve a publicar. El modo **Satélite** funciona aparte.
