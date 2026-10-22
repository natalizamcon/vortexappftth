/**
 * Cálculos del reparto de utilidades. Son funciones puras (sin base de datos) para poder probarlas.
 *
 * Reglas:
 *  utilidad = cobrado + otros ingresos − gastos operativos − costos compartidos − pagos a inversores
 *  1) cada socio recibe su porcentaje del monto a repartir
 *  2) lo que queda es la parte del dueño y se divide en Caja chica, Ahorro, Inversión y Retiro del dueño
 */
export const FONDOS = ["Caja chica", "Ahorro", "Inversión", "Retiro del dueño"] as const;
export type Fondo = (typeof FONDOS)[number];
export type Metodo = "iguales" | "clientes" | "porcentaje";
export const METODOS: Record<Metodo, string> = { iguales: "Partes iguales", clientes: "Según los clientes activos de cada zona", porcentaje: "Porcentaje que defino por zona" };

export const r2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;
const num = (x: any) => Number(x) || 0;

/** Primer y último día de un mes "YYYY-MM". */
export function rangoMes(mes: string): [string, string] {
  const [a, m] = mes.split("-").map(Number), ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return [`${mes}-01`, `${mes}-${String(ultimo).padStart(2, "0")}`];
}
/** El mes anterior al de la fecha dada, como "YYYY-MM". */
export function mesAnterior(hoyISO: string): string {
  let a = +hoyISO.slice(0, 4), m = +hoyISO.slice(5, 7) - 1;
  if (m === 0) { m = 12; a--; }
  return `${a}-${String(m).padStart(2, "0")}`;
}

export type CostoComp = { id: string; nombre: string; metodo: Metodo; monto: number; zonas: { zona_id: string; porcentaje: number }[] };

/** Cuánto de un costo compartido le toca a una zona. */
export function cuotaCostoCompartido(c: CostoComp, zonaId: string, clientes: Record<string, number>): { cuota: number; fraccion: number; aviso?: string } {
  const Z = c.zonas;
  if (!Z.some(x => x.zona_id === zonaId)) return { cuota: 0, fraccion: 0 };
  let fraccion = 0, aviso: string | undefined;
  if (c.metodo === "iguales") fraccion = 1 / Z.length;
  else if (c.metodo === "clientes") {
    const total = Z.reduce((s, x) => s + num(clientes[x.zona_id]), 0);
    if (total > 0) fraccion = num(clientes[zonaId]) / total;
    else { fraccion = 1 / Z.length; aviso = "Ninguna de las zonas tiene clientes activos: se repartió en partes iguales."; }
  } else {
    const total = Z.reduce((s, x) => s + num(x.porcentaje), 0);
    fraccion = num(Z.find(x => x.zona_id === zonaId)!.porcentaje) / 100;
    if (Math.abs(total - 100) > 0.01) aviso = `Los porcentajes de las zonas suman ${r2(total)}% y no 100%.`;
  }
  return { cuota: r2(num(c.monto) * fraccion), fraccion, aviso };
}

export type Entrada = {
  cobrado: number; otros: number; gastos: number; compartidos: number; inversores: number;
  socios: { user_id: string; nombre: string; porcentaje: number }[];
  fondos: { fondo: string; porcentaje: number }[];
  montoManual?: number | null; // si el administrador quiere repartir otro monto
};

export function calcular(e: Entrada) {
  const utilidad = r2(num(e.cobrado) + num(e.otros) - num(e.gastos) - num(e.compartidos) - num(e.inversores));
  const maximo = Math.max(utilidad, 0);
  const monto = e.montoManual != null && !Number.isNaN(e.montoManual) ? Math.max(0, r2(e.montoManual)) : maximo;
  const socios = e.socios.map(s => ({ ...s, monto: r2(monto * (num(s.porcentaje) / 100)) }));
  const totalSocios = r2(socios.reduce((s, x) => s + x.monto, 0));
  const parteDueno = Math.max(0, r2(monto - totalSocios));
  const fondos = e.fondos.map(f => ({ ...f, monto: r2(parteDueno * (num(f.porcentaje) / 100)) }));
  const sinAsignar = Math.max(0, r2(parteDueno - fondos.reduce((s, x) => s + x.monto, 0)));
  const pctSocios = r2(e.socios.reduce((s, x) => s + num(x.porcentaje), 0)), pctFondos = r2(e.fondos.reduce((s, x) => s + num(x.porcentaje), 0));
  const avisos: string[] = [];
  if (pctSocios > 100.0001) avisos.push(`Los porcentajes de los socios suman ${pctSocios}%: no pueden pasar de 100%.`);
  if (pctFondos > 100.0001) avisos.push(`Los porcentajes de los fondos suman ${pctFondos}%: no pueden pasar de 100%.`);
  if (monto > maximo + 0.005) avisos.push("Estás repartiendo más que la utilidad del mes.");
  return { utilidad, maximo, monto, socios, totalSocios, parteDueno, fondos, sinAsignar, pctSocios, pctFondos, pctDueno: r2(Math.max(0, 100 - pctSocios)), avisos, valido: pctSocios <= 100.0001 && pctFondos <= 100.0001 };
}
