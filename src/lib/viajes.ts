/** Cálculos de viajes: los mismos que usa la base de datos (costo_viaje). */
export const diasEntre = (a: string, b: string): string[] => { const r: string[] = []; for (let d = new Date(a + "T12:00:00"), e = new Date(b + "T12:00:00"), i = 0; d <= e && i < 60; d.setDate(d.getDate() + 1), i++) r.push(d.toISOString().slice(0, 10)); return r; };
const num = (x: any) => Number(x) || 0;

/** Desglose del costo de un viaje. "personal" = lista de viaje_personal (puede estar vacía en viajes antiguos). */
export function costoViaje(v: any, personal: any[], gastos: any[]) {
  const ds = diasEntre(v.fecha_inicio, v.fecha_fin).length;
  const pers = personal.length ? personal.reduce((s, p) => s + (num(p.pago_dia) + num(v.viaticos_dia)) * num(p.dias_trabajados), 0) : ds * num(v.personas) * (num(v.pago_dia) + num(v.viaticos_dia));
  const imprevistos = gastos.reduce((s, x) => s + num(x.gasto), 0), gasolina = num(v.gasolina), movilidad = num(v.movilidad);
  return { gasolina, movilidad, personal: pers, imprevistos, total: gasolina + movilidad + pers + imprevistos, dias: ds };
}
/** Lo estimado al programar el viaje (sin imprevistos ni salidas anticipadas). */
export const estimadoViaje = (v: any) => (v.estimado != null ? num(v.estimado) : num(v.gasolina) + num(v.movilidad) + diasEntre(v.fecha_inicio, v.fecha_fin).length * num(v.personas) * (num(v.pago_dia) + num(v.viaticos_dia)));
