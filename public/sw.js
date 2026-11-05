// Permite instalar Vortex en el celular como una app y mostrar las notificaciones de la Agenda.
// No guarda nada en caché a propósito: así siempre se abre la versión más nueva y nunca se queda con datos viejos.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
// Al tocar una notificación, abre (o trae al frente) la Agenda.
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/#/agenda";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(lista => {
    for (const c of lista) { if ("focus" in c) { if ("navigate" in c) c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
