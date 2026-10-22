/** Cómo se reparte un pago entre los meses. Es la misma regla que usa la base de datos (registrar_pago): del mes más antiguo al más nuevo. */
export type CargoRef = { periodo: string; monto: number; pagado: number };
export type Tile = { periodo: string; montoCargo: number; asignado: number; estado: "cubierto" | "parcial" | "ya"; saldo: number };

const num = (x: any) => Number(x) || 0;
export const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
export const primeroDeMes = (d: string) => d.slice(0, 7) + "-01";
export const mesSig = (d: string) => { let a = +d.slice(0, 4), m = +d.slice(5, 7) + 1; if (m > 12) { m = 1; a++; } return `${a}-${String(m).padStart(2, "0")}-01`; };

export function repartoPago(a: { monto: number; precio: number; desde: string; cargos: CargoRef[] }) {
  const monto = num(a.monto), precio = num(a.precio), tiles: Tile[] = [];
  const min = a.cargos.length ? a.cargos.map(c => primeroDeMes(c.periodo)).sort()[0] : null;
  let v = primeroDeMes(a.desde); if (min && v < min) v = min;
  let resto = monto;
  for (let i = 0; resto > 0.004 && i < 60; i++) {
    const c = a.cargos.find(x => primeroDeMes(x.periodo) === v), cargo = c ? num(c.monto) : precio, ya = c ? num(c.pagado) : 0, libre = r2(cargo - ya);
    const aplica = Math.max(0, Math.min(resto, libre));
    resto = r2(resto - aplica);
    tiles.push({ periodo: v, montoCargo: cargo, asignado: r2(aplica), estado: libre <= 0.004 ? "ya" : aplica >= libre - 0.004 ? "cubierto" : "parcial", saldo: r2(Math.max(0, libre - aplica)) });
    v = mesSig(v);
  }
  const tocados = tiles.filter(t => t.asignado > 0);
  const tipo = monto < precio ? "Parcial" : monto >= 2 * precio ? "Anticipado" : "Completo";
  return { tiles, asignado: r2(tiles.reduce((s, t) => s + t.asignado, 0)), sobrante: r2(resto), cubreHasta: tocados.length ? tocados[tocados.length - 1].periodo : null, tipo };
}

/** Clasifica cómo paga un cliente según sus meses ya vencidos. */
export function comportamiento(c?: { cargos_vencidos: number; a_tiempo: number; tarde: number; impagos: number } | null, conflictivo = false) {
  if (conflictivo) return { texto: "Conflictivo", clase: "bad", orden: 0 };
  const t = num(c?.cargos_vencidos);
  if (!t) return { texto: "Sin historial", clase: "", orden: 3 };
  const ok = num(c?.a_tiempo) / t;
  if (num(c?.impagos) === 0 && num(c?.tarde) === 0) return { texto: "Puntual", clase: "ok", orden: 4 };
  if (ok >= 0.75 && num(c?.impagos) === 0) return { texto: "Generalmente puntual", clase: "ok", orden: 3 };
  if (ok >= 0.4) return { texto: "Irregular", clase: "warn", orden: 2 };
  return { texto: "Mal pagador", clase: "bad", orden: 1 };
}
