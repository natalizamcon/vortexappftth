/** Cuentas de un inversor: moneda, tipo de cambio e interés por porcentaje o por monto. Interés simple, igual que el resto del sistema. */
export type Moneda = "BOB" | "USD";
export type ModoInteres = "porcentaje" | "monto";
export type BaseInteres = "mensual" | "anual" | "total";
export type EntradaInversion = { moneda: Moneda; cap: number; tc: number; plazo: number; modo: ModoInteres; valor: number; base: BaseInteres };
export type ResultadoInversion = {
  ok: boolean; error?: string;
  montoBs: number;               // lo invertido, en Bs (con el tipo de cambio usado)
  interes: number; periodo: "mensual" | "anual"; // lo que se guarda: porcentaje y a qué período corresponde
  pctMes: number; pctAnio: number;
  porMes: number; porAnio: number; interesTotal: number; totalDevolver: number; // en la moneda del inversor
  factor: number;                // Bs por unidad de la moneda del inversor
};
const r2 = (x: number) => Math.round(x * 100) / 100, r6 = (x: number) => Math.round(x * 1e6) / 1e6;

export function calcularInversion(e: EntradaInversion): ResultadoInversion {
  const vacio = { montoBs: 0, interes: 0, periodo: "mensual" as const, pctMes: 0, pctAnio: 0, porMes: 0, porAnio: 0, interesTotal: 0, totalDevolver: 0, factor: 1 };
  if (!(e.cap > 0)) return { ok: false, error: "Escribe el monto invertido.", ...vacio };
  if (e.moneda === "USD" && !(e.tc > 0)) return { ok: false, error: "Escribe el tipo de cambio que se usó (Bs por 1 dólar).", ...vacio };
  if (!(e.plazo >= 1)) return { ok: false, error: "El plazo debe ser de 1 mes o más.", ...vacio };
  const factor = e.moneda === "USD" ? e.tc : 1, montoBs = r2(e.cap * factor), v = isFinite(e.valor) && e.valor > 0 ? e.valor : 0;
  let pctMes: number, interes: number, periodo: "mensual" | "anual";
  if (e.modo === "porcentaje") {
    if (e.base === "total") return { ok: false, error: "El porcentaje solo puede ser por mes o por año.", ...vacio };
    pctMes = e.base === "anual" ? v / 12 : v; interes = v; periodo = e.base === "anual" ? "anual" : "mensual";
  } else if (e.base === "anual") { pctMes = (v / e.cap) * 100 / 12; interes = (v / e.cap) * 100; periodo = "anual"; }
  else if (e.base === "mensual") { pctMes = (v / e.cap) * 100; interes = pctMes; periodo = "mensual"; }
  else { pctMes = (v / e.cap / e.plazo) * 100; interes = pctMes; periodo = "mensual"; }
  const interesTotal = r2(e.cap * (pctMes / 100) * e.plazo), porMes = r2(e.cap * (pctMes / 100));
  return { ok: true, montoBs, interes: r6(interes), periodo, pctMes: r6(pctMes), pctAnio: r6(pctMes * 12), porMes, porAnio: r2(porMes * 12), interesTotal, totalDevolver: r2(e.cap + interesTotal), factor };
}

/** Lo que un inversor ya guardado le cuesta a la empresa, en su moneda y en Bs. */
export function resumenGuardado(x: any) {
  const cap = Number(x.monto_original ?? x.monto) || 0, factor = x.moneda === "USD" ? Number(x.tipo_cambio) || 1 : 1, pct = Number(x.interes) || 0;
  const meses = x.periodo_interes === "anual" ? (Number(x.plazo_meses) || 0) / 12 : Number(x.plazo_meses) || 0, interes = cap * (pct / 100) * meses;
  return { cap, factor, interes, total: cap + interes, pctMes: x.periodo_interes === "anual" ? pct / 12 : pct, pctAnio: x.periodo_interes === "anual" ? pct : pct * 12 };
}
