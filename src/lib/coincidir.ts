/** Ayudas para comparar lo que la IA leyó de una hoja escrita a mano con lo que hay en el sistema. */
export const norm = (s: any) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Busca la opción cuyo texto sea igual (o contenga) lo leído. Devuelve undefined si no hay una coincidencia clara. */
export function coincidir<T>(texto: any, opciones: T[], textoDe: (o: T) => string | string[]): T | undefined {
  const t = norm(texto); if (!t) return undefined;
  const claves = (o: T) => [textoDe(o)].flat().map(norm).filter(Boolean);
  return opciones.find(o => claves(o).includes(t)) || opciones.find(o => claves(o).some(k => k.length >= 4 && (k.includes(t) || t.includes(k))));
}
export const aNumero = (x: any) => { if (x === null || x === undefined || x === "") return null; const n = Number(String(x).replace(",", ".").replace(/[^0-9.\-]/g, "")); return isFinite(n) ? n : null; };
