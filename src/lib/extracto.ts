/** Lectura del extracto del banco (CSV, o filas copiadas desde Excel) para cargar los abonos en Vortex. Sin librerías externas. */
export type Mov = { fecha: string; monto: number; referencia: string; remitente: string; glosa: string };
export type Mapeo = { fecha: number; monto: number; referencia: number; remitente: number; glosa: number };

/** Parte el texto en filas y columnas. Detecta solo si va separado por ; , o tabulación, y respeta las comillas. */
export function leerTabla(texto: string): string[][] {
  const t = texto.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n"), prueba = t.split("\n").slice(0, 5).join("\n");
  const sep = [";", "\t", ","].map(s => [s, prueba.split(s).length - 1] as const).sort((a, b) => b[1] - a[1])[0][1] > 0 ? [";", "\t", ","].map(s => [s, prueba.split(s).length - 1] as const).sort((a, b) => b[1] - a[1])[0][0] : ",";
  const filas: string[][] = []; let fila: string[] = [], celda = "", q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { celda += '"'; i++; } else q = false; } else celda += c; }
    else if (c === '"') q = true; else if (c === sep) { fila.push(celda.trim()); celda = ""; }
    else if (c === "\n") { fila.push(celda.trim()); celda = ""; if (fila.some(x => x !== "")) filas.push(fila); fila = []; } else celda += c;
  }
  fila.push(celda.trim()); if (fila.some(x => x !== "")) filas.push(fila);
  return filas;
}

/** "1.234,56", "1,234.56", "Bs 140,00" → número (o null) */
export function aNumero(v: string): number | null {
  let s = String(v ?? "").replace(/[^0-9.,-]/g, ""); if (!s || s === "-") return null;
  const c = s.lastIndexOf(","), p = s.lastIndexOf(".");
  if (c >= 0 && p >= 0) s = c > p ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (c >= 0) s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s); return isFinite(n) ? n : null;
}

/** Fecha en formato dd/mm/aaaa, dd-mm-aaaa o aaaa-mm-dd (con o sin hora) → texto ISO con la hora de Bolivia. */
export function aFechaISO(v: string): string | null {
  const s = String(v ?? "").trim(); let d: number, m: number, a: number, h = 12, mi = 0;
  let x = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:[ T]+(\d{1,2}):(\d{2}))?/);
  if (x) { d = +x[1]; m = +x[2]; a = +x[3]; if (a < 100) a += 2000; if (x[4]) { h = +x[4]; mi = +x[5]; } }
  else { x = s.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/); if (!x) return null; a = +x[1]; m = +x[2]; d = +x[3]; if (x[4]) { h = +x[4]; mi = +x[5]; } }
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const z = (n: number) => String(n).padStart(2, "0"); return `${a}-${z(m)}-${z(d)}T${z(h)}:${z(mi)}:00-04:00`;
}

const quitar = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const buscar = (enc: string[], ...claves: RegExp[]) => { for (const k of claves) { const i = enc.findIndex(e => k.test(quitar(e))); if (i >= 0) return i; } return -1; };

/** Adivina qué columna es cuál mirando los títulos. */
export function detectarMapeo(enc: string[]): Mapeo {
  return {
    fecha: buscar(enc, /fecha/),
    monto: buscar(enc, /\b(abono|credito|haber|ingreso)s?\b/, /monto|importe|valor/),
    referencia: buscar(enc, /operacion|referencia|\bnro\b|numero|documento|comprobante|transaccion|\bid\b/),
    remitente: buscar(enc, /remitente|ordenante|titular|nombre|origen|cliente|pagador/),
    glosa: buscar(enc, /glosa|descripcion|concepto|detalle|observacion|mensaje/),
  };
}

const huella = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };

/** Convierte las filas en movimientos. Solo entran los abonos (montos positivos). Si no hay número de operación se arma uno estable para no duplicar si se vuelve a cargar el mismo extracto. */
export function aMovimientos(tabla: string[][], m: Mapeo, conEncabezado: boolean): { movs: Mov[]; omitidas: { fila: number; motivo: string }[] } {
  const movs: Mov[] = [], omitidas: { fila: number; motivo: string }[] = [], vistas = new Map<string, number>(), cel = (f: string[], i: number) => (i >= 0 ? (f[i] ?? "").trim() : "");
  tabla.forEach((f, idx) => {
    if (conEncabezado && idx === 0) return; const n = idx + 1;
    const fecha = aFechaISO(cel(f, m.fecha)), monto = aNumero(cel(f, m.monto));
    if (!fecha) return omitidas.push({ fila: n, motivo: "fecha no válida" }) && undefined;
    if (monto === null) return omitidas.push({ fila: n, motivo: "monto no válido" }) && undefined;
    if (monto <= 0) return omitidas.push({ fila: n, motivo: "no es un abono (monto cero o negativo)" }) && undefined;
    const glosa = cel(f, m.glosa), remitente = cel(f, m.remitente); let ref = cel(f, m.referencia);
    if (!ref) { const base = [fecha, monto, glosa, remitente].join("|"), k = (vistas.get(base) || 0) + 1; vistas.set(base, k); ref = "H-" + huella(base) + (k > 1 ? "-" + k : ""); }
    movs.push({ fecha, monto, referencia: ref, remitente, glosa });
  });
  return { movs, omitidas };
}
