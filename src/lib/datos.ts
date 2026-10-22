/** Trae todas las filas de una consulta, de 1.000 en 1.000 (Supabase corta en 1.000 por defecto). */
export async function todas(fabrica: () => any, max = 20000): Promise<any[]> {
  const out: any[] = [];
  for (let desde = 0; desde < max; desde += 1000) {
    const r = await fabrica().range(desde, desde + 999);
    if (r.error) throw new Error(r.error.message);
    const d = r.data || []; out.push(...d);
    if (d.length < 1000) break;
  }
  return out;
}
export const num = (x: any) => Number(x) || 0;
export const sumaDe = (a: any[], k: string) => a.reduce((s, x) => s + num(x[k]), 0);
/** "YYYY-MM" desplazado k meses (k puede ser negativo). */
export const mesDesp = (mes: string, k: number) => { let a = +mes.slice(0, 4), m = +mes.slice(5, 7) - 1 + k; a += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return `${a}-${String(m + 1).padStart(2, "0")}`; };
export const mesesRango = (m0: string, m1: string) => { const out: string[] = []; for (let m = m0; m <= m1 && out.length < 240; m = mesDesp(m, 1)) out.push(m); return out; };
export const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
export const etiquetaMes = (m: string) => `${MES_CORTO[+m.slice(5, 7) - 1]} ${m.slice(2, 4)}`;
