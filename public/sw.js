// Permite instalar Vortex en el celular como una app. No guarda nada en caché a propósito:
// así siempre se abre la versión más nueva y nunca se queda con datos viejos.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
