/** Avisos de la Agenda: cuándo avisar, sonido, vibración y notificación del sistema. Funcionan mientras la app está abierta (aunque esté en segundo plano). */
const g = (k: string, d: string) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const s = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

export const ajustes = {
  sonido: () => g("vx_aviso_sonido", "1") === "1", setSonido: (v: boolean) => s("vx_aviso_sonido", v ? "1" : "0"),
  /** minutos de anticipación: 0 = a la hora exacta */
  antelacion: () => { const n = Number(g("vx_aviso_min", "0")); return [0, 10, 30, 60].includes(n) ? n : 0; }, setAntelacion: (n: number) => s("vx_aviso_min", String(n)),
};
export const ANTELACIONES: [number, string][] = [[0, "A la hora exacta"], [10, "10 minutos antes"], [30, "30 minutos antes"], [60, "1 hora antes"]];

export const claveAviso = (r: { id: string; fecha_hora: string }) => `${r.id}|${r.fecha_hora}`;
export const leerAvisados = (): string[] => { try { return JSON.parse(g("vx_agenda_avisados", "[]")); } catch { return []; } };
export const guardarAvisados = (l: string[]) => s("vx_agenda_avisados", JSON.stringify(l.slice(-300)));

/** ¿Hay que avisar de este recordatorio ahora? Desde "antelación" minutos antes y hasta 12 horas después (lo más viejo ya sale en "Atrasados"). */
export function debeAvisar(r: { id: string; fecha_hora: string; hecho?: boolean }, ahora: number, antelacionMin: number, avisados: Set<string>) {
  if (r.hecho) return false; const t = +new Date(r.fecha_hora); if (isNaN(t)) return false;
  return ahora >= t - antelacionMin * 60000 && ahora <= t + 12 * 3600000 && !avisados.has(claveAviso(r));
}

/** Texto corto de cuánto falta: "¡ahora!", "en 10 min", "hace 25 min". */
export function cuandoEs(fechaIso: string, ahora = Date.now()) {
  const m = Math.round((+new Date(fechaIso) - ahora) / 60000);
  if (Math.abs(m) < 1) return "¡ahora!"; if (m > 0) return m < 60 ? `en ${m} min` : `en ${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + " min" : ""}`.trim();
  const a = -m; return a < 60 ? `hace ${a} min` : `hace ${Math.floor(a / 60)} h`;
}

/* ---------- sonido (el navegador solo deja sonar después de que la persona tocó la pantalla alguna vez) ---------- */
let ctx: AudioContext | null = null;
export function prepararSonido() { try { const C = (window as any).AudioContext || (window as any).webkitAudioContext; if (!C) return; ctx = ctx || new C(); if (ctx && ctx.state === "suspended") ctx.resume(); } catch { /* sin audio */ } }
/** Suena tres pitidos. Devuelve false si el navegador no dejó sonar todavía. */
export function sonar(): boolean {
  try {
    prepararSonido(); if (!ctx) return false; const t0 = ctx.currentTime + 0.02;
    [0, 0.38, 0.76].forEach(d => { const o = ctx!.createOscillator(), v = ctx!.createGain(); o.type = "sine"; o.frequency.value = 880; v.gain.setValueAtTime(0.0001, t0 + d); v.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.03); v.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.3); o.connect(v); v.connect(ctx!.destination); o.start(t0 + d); o.stop(t0 + d + 0.32); });
    return ctx.state === "running";
  } catch { return false; }
}
export const vibrar = () => { try { navigator.vibrate?.([250, 120, 250, 120, 400]); } catch { /* no todos los teléfonos vibran */ } };
if (typeof window !== "undefined") ["click", "keydown", "touchstart"].forEach(e => window.addEventListener(e, prepararSonido, { once: true, passive: true } as any));

/* ---------- notificación del sistema ---------- */
export const permisoNotificaciones = (): "granted" | "denied" | "default" | "no" => (typeof Notification === "undefined" ? "no" : (Notification.permission as any));
export async function pedirPermiso() { if (typeof Notification === "undefined") return "no"; try { return await Notification.requestPermission(); } catch { return "denied"; } }
/** Muestra la notificación del sistema (en Android hay que pasar por el service worker; en computadora basta el constructor). */
export async function notificar(titulo: string, cuerpo: string, tag: string) {
  if (permisoNotificaciones() !== "granted") return false;
  const op: any = { body: cuerpo, tag, icon: "/icon-192.png", badge: "/icon-192.png", requireInteraction: true, vibrate: [250, 120, 250], data: { url: "/#/agenda" } };
  try { const reg = await (navigator as any).serviceWorker?.ready; if (reg?.showNotification) { await reg.showNotification(titulo, op); return true; } } catch { /* se intenta el otro camino */ }
  try { new Notification(titulo, op); return true; } catch { return false; }
}
