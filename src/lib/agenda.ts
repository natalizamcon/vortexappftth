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
