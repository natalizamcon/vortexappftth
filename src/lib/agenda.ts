/** Ayudas de la Agenda: enlaces para llamar, escribir por WhatsApp, llegar y poner en el calendario; fechas fáciles de leer. */
export const soloDigitos = (t: any) => String(t ?? "").replace(/\D/g, "");

/** Enlace para llamar con un toque. */
export const linkLlamar = (t: any) => { const s = String(t ?? "").trim(), d = soloDigitos(s); return d ? "tel:" + (s.startsWith("+") ? "+" : "") + d : ""; };

/** WhatsApp: un número boliviano de 8 cifras se completa con el 591. */
export const linkWhatsApp = (t: any) => { let d = soloDigitos(t); if (d.startsWith("00")) d = d.slice(2); if (d.length === 8) d = "591" + d; return d.length >= 9 ? "https://wa.me/" + d : ""; };

/** Cómo llegar: con coordenadas si las hay; si no, con la zona y la referencia escritas. */
export const linkMapa = (c: { lat?: any; lng?: any; ubicacion?: any; zona?: any; lugar?: any }) => {
  if (c.lat != null && c.lng != null && c.lat !== "" && c.lng !== "") return `https://www.google.com/maps?q=${c.lat},${c.lng}`;
  const q = [c.lugar, c.ubicacion, c.zona].filter(Boolean).join(", ").trim(); return q ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q) : "";
};

const z2 = (n: number) => String(n).padStart(2, "0");
const utc = (d: Date) => `${d.getUTCFullYear()}${z2(d.getUTCMonth() + 1)}${z2(d.getUTCDate())}T${z2(d.getUTCHours())}${z2(d.getUTCMinutes())}00Z`;
/** Agrega el recordatorio al calendario del celular (Google Calendar), con alarma. */
export const linkCalendario = (r: { titulo: string; fecha_hora: string; lugar?: string | null; nota?: string | null }) => {
  const ini = new Date(r.fecha_hora), fin = new Date(ini.getTime() + 3600000);
  return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(r.titulo) + "&dates=" + utc(ini) + "/" + utc(fin) + "&location=" + encodeURIComponent(r.lugar || "") + "&details=" + encodeURIComponent((r.nota || "") + "\n(Agenda Vortex)");
};

export const inicioDia = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const finDia = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"], MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const hm = (d: Date) => `${z2(d.getHours())}:${z2(d.getMinutes())}`;
/** "hoy 14:30", "mañana 09:00", "vie 7 nov 09:00" */
export function etiquetaFecha(iso: string, ahora = new Date()) {
  const d = new Date(iso); if (isNaN(+d)) return "";
  const dif = Math.round((+inicioDia(d) - +inicioDia(ahora)) / 86400000);
  if (dif === 0) return "hoy " + hm(d); if (dif === 1) return "mañana " + hm(d); if (dif === -1) return "ayer " + hm(d);
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}${d.getFullYear() !== ahora.getFullYear() ? " " + d.getFullYear() : ""} ${hm(d)}`;
}
export const aLocalInput = (d: Date) => `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}T${z2(d.getHours())}:${z2(d.getMinutes())}`;
export const deLocalInput = (s: string) => { const d = new Date(s); return isNaN(+d) ? "" : d.toISOString(); };

/** Atajos para "volver a llamar" o "recordarme": siempre a las 9:00 salvo que se diga otra hora. */
export type Atajo = "manana" | "3dias" | "semana" | "lunes";
export function fechaAtajo(a: Atajo, ahora = new Date()) {
  const d = new Date(ahora); d.setHours(9, 0, 0, 0);
  if (a === "manana") d.setDate(d.getDate() + 1); else if (a === "3dias") d.setDate(d.getDate() + 3); else if (a === "semana") d.setDate(d.getDate() + 7);
  else { do { d.setDate(d.getDate() + 1); } while (d.getDay() !== 1); }
  return d;
}
export const ATAJOS: [Atajo, string][] = [["manana", "Mañana"], ["3dias", "En 3 días"], ["semana", "En 1 semana"], ["lunes", "El lunes"]];

/** Separa los recordatorios pendientes en atrasados, de hoy, de los próximos 7 días y de más adelante. */
export function agrupar<T extends { fecha_hora: string }>(lista: T[], ahora = new Date()) {
  const hoy0 = +inicioDia(ahora), manana0 = hoy0 + 86400000, sem = hoy0 + 8 * 86400000, g = { atrasados: [] as T[], hoy: [] as T[], proximos: [] as T[], despues: [] as T[] };
  [...lista].sort((a, b) => +new Date(a.fecha_hora) - +new Date(b.fecha_hora)).forEach(r => { const t = +new Date(r.fecha_hora); if (t < hoy0) g.atrasados.push(r); else if (t < manana0) g.hoy.push(r); else if (t < sem) g.proximos.push(r); else g.despues.push(r); });
  return g;
}

export const ESTADOS = ["Nuevo", "Contactado", "Reunión agendada", "Interesado", "Negociando", "Cerrado", "Descartado"] as const;
export const COLOR_ESTADO: Record<string, string> = { "Nuevo": "#7a8190", "Contactado": "#2b6cb0", "Reunión agendada": "#7c2bc9", "Interesado": "#c9a017", "Negociando": "#e07b1a", "Cerrado": "#1d9a5d", "Descartado": "#b0b6c2" };
export const RESULTADOS = ["Contestó", "No contestó", "Ocupado", "Número equivocado", "Reunión acordada", "Pidió que llame después"] as const;
export const TIPOS_REC = ["Llamar", "Viaje o reunión", "Otro"] as const;
export const ICONO_REC: Record<string, string> = { "Llamar": "📞", "Viaje o reunión": "🚗", "Otro": "🔔" };

/* ---------------- Calendario ---------------- */
export const NOMBRES_MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export const claveDia = (d: Date) => `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}`;
/** Primera letra en mayúscula ("jueves 5 de noviembre" → "Jueves 5 de noviembre"). */
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const fechaLarga = (d: Date) => `${DIAS_LARGOS[d.getDay()]} ${d.getDate()} de ${NOMBRES_MES[d.getMonth()]} de ${d.getFullYear()}`;
/** Las semanas de un mes (lunes a domingo), con los días de relleno del mes anterior y siguiente. */
export function semanasDelMes(año: number, mes: number) {
  const offset = (new Date(año, mes, 1).getDay() + 6) % 7, semanas: Date[][] = [];
  for (let s = 0; s < 6; s++) semanas.push(Array.from({ length: 7 }, (_, d) => new Date(año, mes, 1 - offset + s * 7 + d)));
  return semanas.filter((w, i) => i < 5 || w.some(x => x.getMonth() === mes));
}
/** Agrupa por día las actividades (recordatorios), para marcar el calendario. */
export function porDia<T extends { fecha_hora: string }>(lista: T[]) {
  const m = new Map<string, T[]>();
  [...lista].sort((a, b) => +new Date(a.fecha_hora) - +new Date(b.fecha_hora)).forEach(r => { const k = claveDia(new Date(r.fecha_hora)); (m.get(k) || m.set(k, []).get(k)!).push(r); });
  return m;
}
/** Une un día (aaaa-mm-dd) y una hora (hh:mm) en una fecha. */
export const diaYHora = (dia: string, hora: string) => { const d = new Date(`${dia}T${hora || "09:00"}`); return isNaN(+d) ? "" : d.toISOString(); };

/* ---------------- Historial ---------------- */
export type Hito = { id: string; fecha: string; categoria: "llamadas" | "recordatorios" | "cambios"; icono: string; titulo: string; detalle?: string; por?: string; contacto_id: string };
/** Junta en una sola línea de tiempo todo lo guardado: cuándo se anotó, las llamadas, los recordatorios (creados y hechos) y los cambios (estado, datos, a quién se compartió). */
export function armarHistorial(d: { contactos: any[]; llamadas: any[]; recordatorios: any[]; eventos: any[] }, ahora = new Date()): Hito[] {
  const h: Hito[] = [];
  d.contactos.forEach(c => h.push({ id: "c" + c.id, fecha: c.creado_en, categoria: "cambios", icono: "🆕", titulo: "Dirigente anotado", detalle: [c.zona, [c.cargo, c.organizacion].filter(Boolean).join(" · ")].filter(Boolean).join(" — ") || undefined, por: c.creado_por, contacto_id: c.id }));
  d.llamadas.forEach(l => h.push({ id: "l" + l.id, fecha: l.fecha, categoria: "llamadas", icono: l.resultado === "Contestó" || l.resultado === "Reunión acordada" ? "📞" : l.resultado === "No contestó" || l.resultado === "Ocupado" ? "📵" : "📞", titulo: "Llamada: " + l.resultado, detalle: l.nota || undefined, por: l.creado_por, contacto_id: l.contacto_id }));
  d.recordatorios.filter(r => r.contacto_id).forEach(r => {
    h.push({ id: "r" + r.id, fecha: r.creado_en, categoria: "recordatorios", icono: ICONO_REC[r.tipo] || "🔔", titulo: "Recordatorio: " + r.titulo, detalle: `para ${etiquetaFecha(r.fecha_hora, ahora)}${r.lugar ? " · " + r.lugar : ""}`, por: r.creado_por, contacto_id: r.contacto_id });
    if (r.hecho && r.hecho_en) h.push({ id: "h" + r.id, fecha: r.hecho_en, categoria: "recordatorios", icono: "✅", titulo: "Hecho: " + r.titulo, por: r.creado_por, contacto_id: r.contacto_id });
  });
  d.eventos.forEach(e => h.push({ id: "e" + e.id, fecha: e.creado_en, categoria: e.tipo === "Recordatorio" ? "recordatorios" : "cambios", icono: e.tipo === "Estado" ? "🔄" : e.tipo === "Compartido" ? "👥" : e.tipo === "Recordatorio" ? "⏩" : "✏️", titulo: e.tipo === "Estado" ? "Cambió el estado" : e.tipo === "Compartido" ? "Compartir" : e.tipo === "Recordatorio" ? "Recordatorio movido" : "Datos corregidos", detalle: e.detalle || undefined, por: e.creado_por, contacto_id: e.contacto_id }));
  return h.sort((a, b) => +new Date(b.fecha) - +new Date(a.fecha));
}
