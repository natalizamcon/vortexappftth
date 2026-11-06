/** Fondo de inversión: el dinero de los inversores de cada zona (o el general del proyecto) y lo que se gasta de él. */
export const FUENTES = ["Fondo de la zona", "Fondo general", "Otra fuente"] as const;
export type Fuente = (typeof FUENTES)[number];
export const esFondo = (f?: string | null) => f === "Fondo de la zona" || f === "Fondo general";
export type FilaFondo = { proyecto_id: string; zona_id: string | null; zona_nombre?: string | null; recibido: number; gastado: number; disponible: number };
const n = (x: any) => Number(x) || 0, r2 = (x: number) => Math.round(x * 100) / 100;

/** Cuánto hay disponible en el fondo de una zona (o en el general si zonaId es null). */
export const saldoDe = (filas: FilaFondo[], proyectoId: string | null, zonaId: string | null) => r2(filas.filter(f => (f.zona_id || null) === (zonaId || null) && (!proyectoId || f.proyecto_id === proyectoId)).reduce((s, f) => s + n(f.disponible), 0));

export type MovFondo = { id: string; fecha: string; tipo: "Entrada" | "Salida"; concepto: string; detalle?: string; monto: number; saldo: number; origen: any };
/** Entradas (inversores) y salidas (gastos) de un fondo, de lo más viejo a lo más nuevo, con el saldo después de cada movimiento. */
export function movimientosFondo(d: { inversores: any[]; gastos: any[]; proyectoId?: string | null; zonaId: string | null }): MovFondo[] {
  const z = d.zonaId || null, ent = d.inversores.filter(i => (i.zona_id || null) === z && (!z ? !d.proyectoId || i.proyecto_id === d.proyectoId : true)).map(i => ({ id: "i" + i.id, fecha: String(i.fecha_inicio || i.creado_en || "").slice(0, 10), tipo: "Entrada" as const, concepto: "Inversión de " + i.nombre, detalle: [i.moneda === "USD" ? `USD ${n(i.monto_original)} a T/C ${n(i.tipo_cambio)}` : "", i.proposito || ""].filter(Boolean).join(" · ") || undefined, monto: n(i.monto), saldo: 0, origen: i }));
  const sal = d.gastos.filter(g => (z ? g.fuente === "Fondo de la zona" && g.zona_id === z : g.fuente === "Fondo general" && (!d.proyectoId || g.proyecto_id === d.proyectoId))).map(g => ({ id: "g" + g.id, fecha: String(g.fecha || "").slice(0, 10), tipo: "Salida" as const, concepto: g.descripcion || g.categoria || "Gasto", detalle: [g.categoria, g.fuente_detalle].filter(Boolean).join(" · ") || undefined, monto: n(g.monto), saldo: 0, origen: g }));
  let acum = 0;
  return [...ent, ...sal].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.tipo === b.tipo ? 0 : a.tipo === "Entrada" ? -1 : 1)).map(m => { acum = r2(acum + (m.tipo === "Entrada" ? m.monto : -m.monto)); return { ...m, saldo: acum }; });
}

/** Qué fondos tienen movimientos: cada zona con inversores o gastos del fondo, y el general. */
export function ambitosFondo(inversores: any[], gastos: any[]) {
  const s = new Set<string>(); inversores.forEach(i => s.add(i.zona_id || "general")); gastos.forEach(g => s.add(g.fuente === "Fondo general" ? "general" : g.zona_id || "general"));
  return Array.from(s);
}

/** Valida un gasto contra el fondo antes de guardarlo (la base de datos lo vuelve a validar). Devuelve el mensaje de error o "". */
export function validarGasto(fuente: string, monto: number, filas: FilaFondo[], proyectoId: string | null, zonaId: string | null) {
  if (!esFondo(fuente)) return "";
  if (fuente === "Fondo de la zona" && !zonaId) return "Para gastar del fondo de una zona hay que elegir la zona.";
  const disp = saldoDe(filas, proyectoId, fuente === "Fondo de la zona" ? zonaId : null);
  return monto > disp + 0.009 ? `El ${fuente.toLowerCase()} no alcanza: tiene Bs ${disp.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} y este gasto es de Bs ${monto.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.` : "";
}
