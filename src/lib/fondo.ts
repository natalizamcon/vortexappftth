/** Dinero disponible: el fondo de los inversores (de una zona o general) y los ingresos del mes (de una zona o de todo el proyecto), y lo que se gasta de ellos. */
export const FUENTES_INVERSORES = ["Fondo de la zona", "Fondo general"] as const;
export const FUENTES_INGRESOS = ["Ingresos del mes de la zona", "Ingresos del mes (proyecto)"] as const;
export const FUENTES = [...FUENTES_INVERSORES, ...FUENTES_INGRESOS, "Otra fuente"] as const;
export type Fuente = (typeof FUENTES)[number];
/** ¿Esta fuente descuenta de un saldo (fondo de inversores o ingresos del mes)? "Otra fuente" no descuenta. */
export const esFondo = (f?: string | null) => (FUENTES_INVERSORES as readonly string[]).includes(f || "") || (FUENTES_INGRESOS as readonly string[]).includes(f || "");
export const esDeZona = (f?: string | null) => f === "Fondo de la zona" || f === "Ingresos del mes de la zona";
export const esIngresos = (f?: string | null) => (FUENTES_INGRESOS as readonly string[]).includes(f || "");

export type FilaFondo = { proyecto_id: string; zona_id: string | null; zona_nombre?: string | null; recibido: number; gastado: number; disponible: number };
export type FilaIngreso = { proyecto_id: string; zona_id: string | null; zona_nombre?: string | null; mes: string; ingreso: number; gastado: number; disponible: number };
const n = (x: any) => Number(x) || 0, r2 = (x: number) => Math.round(x * 100) / 100;
const bs = (x: number) => x.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Cuánto hay disponible en el fondo de inversores de una zona (o en el general si zonaId es null). */
export const saldoDe = (filas: FilaFondo[], proyectoId: string | null, zonaId: string | null) => r2(filas.filter(f => (f.zona_id || null) === (zonaId || null) && (!proyectoId || f.proyecto_id === proyectoId)).reduce((s, f) => s + n(f.disponible), 0));

/** Ingresos disponibles de un mes: de una zona, o de todo el proyecto (todo lo cobrado menos todo lo gastado de ingresos ese mes). `mes` es "aaaa-mm". */
export function ingresoDisponible(filas: FilaIngreso[], proyectoId: string | null, zonaId: string | null, mes: string) {
  const d = filas.filter(f => String(f.mes).slice(0, 7) === mes && (!proyectoId || f.proyecto_id === proyectoId));
  if (zonaId) return r2(d.filter(f => f.zona_id === zonaId).reduce((s, f) => s + n(f.disponible), 0));
  return r2(d.reduce((s, f) => s + n(f.ingreso) - n(f.gastado), 0));
}

/** Texto para el historial: con qué dinero se pagó. */
export function rotuloFuente(fuente?: string | null, detalle?: string | null) {
  if (!fuente) return "";
  const base: Record<string, string> = { "Fondo de la zona": "Fondo de inversores de la zona", "Fondo general": "Fondo general de inversores", "Ingresos del mes de la zona": "Ingresos del mes de la zona", "Ingresos del mes (proyecto)": "Ingresos del mes del proyecto", "Otra fuente": "Otra fuente" };
  return (base[fuente] || fuente) + (detalle ? " · " + detalle : "");
}

export type MovFondo = { id: string; fecha: string; tipo: "Entrada" | "Salida"; concepto: string; detalle?: string; monto: number; saldo: number; origen: any };
/** Entradas (inversores) y salidas (gastos) de un fondo de inversores, de lo más viejo a lo más nuevo, con el saldo después de cada movimiento. */
export function movimientosFondo(d: { inversores: any[]; gastos: any[]; proyectoId?: string | null; zonaId: string | null }): MovFondo[] {
  const z = d.zonaId || null, ent = d.inversores.filter(i => (i.zona_id || null) === z && (!z ? !d.proyectoId || i.proyecto_id === d.proyectoId : true)).map(i => ({ id: "i" + i.id, fecha: String(i.fecha_inicio || i.creado_en || "").slice(0, 10), tipo: "Entrada" as const, concepto: "Inversión de " + i.nombre, detalle: [i.moneda === "USD" ? `USD ${n(i.monto_original)} a T/C ${n(i.tipo_cambio)}` : "", i.proposito || ""].filter(Boolean).join(" · ") || undefined, monto: n(i.monto), saldo: 0, origen: i }));
  const sal = d.gastos.filter(g => (z ? g.fuente === "Fondo de la zona" && g.zona_id === z : g.fuente === "Fondo general" && (!d.proyectoId || g.proyecto_id === d.proyectoId))).map(g => ({ id: "g" + g.id, fecha: String(g.fecha || "").slice(0, 10), tipo: "Salida" as const, concepto: g.descripcion || g.concepto || g.categoria || "Gasto", detalle: [g.categoria, g.fuente_detalle].filter(Boolean).join(" · ") || undefined, monto: n(g.monto), saldo: 0, origen: g }));
  let acum = 0;
  return [...ent, ...sal].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.tipo === b.tipo ? 0 : a.tipo === "Entrada" ? -1 : 1)).map(m => { acum = r2(acum + (m.tipo === "Entrada" ? m.monto : -m.monto)); return { ...m, saldo: acum }; });
}

/** Qué fondos de inversores tienen movimientos: cada zona con inversores o gastos del fondo, y el general. */
export function ambitosFondo(inversores: any[], gastos: any[]) {
  const s = new Set<string>(); inversores.forEach(i => s.add(i.zona_id || "general")); gastos.filter(g => g.fuente === "Fondo general" || g.fuente === "Fondo de la zona").forEach(g => s.add(g.fuente === "Fondo general" ? "general" : g.zona_id || "general"));
  return Array.from(s);
}

/** Valida un gasto contra el saldo elegido antes de guardarlo (la base de datos lo vuelve a validar). Devuelve el mensaje de error o "". */
export function validarGasto(fuente: string, monto: number, fondo: FilaFondo[], proyectoId: string | null, zonaId: string | null, ingresos: FilaIngreso[] = [], fecha = new Date().toLocaleDateString("en-CA")) {
  if (!esFondo(fuente)) return "";
  if (esDeZona(fuente) && !zonaId) return "Para usar el dinero de una zona hay que elegir la zona.";
  if (esIngresos(fuente)) {
    const disp = ingresoDisponible(ingresos, proyectoId, fuente === "Ingresos del mes de la zona" ? zonaId : null, String(fecha).slice(0, 7));
    return monto > disp + 0.009 ? `Los ingresos de ese mes no alcanzan: hay Bs ${bs(disp)} disponibles y este gasto es de Bs ${bs(monto)}.` : "";
  }
  const disp = saldoDe(fondo, proyectoId, fuente === "Fondo de la zona" ? zonaId : null);
  return monto > disp + 0.009 ? `El ${fuente.toLowerCase()} no alcanza: tiene Bs ${bs(disp)} y este gasto es de Bs ${bs(monto)}.` : "";
}
