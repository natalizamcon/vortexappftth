import { calcularInversion } from "./inversion";

/** Una fila de inversor para llenar rápido al crear una zona o un proyecto (interés en porcentaje; los detalles se pueden corregir después en Finanzas → Inversores). */
export type InvFila = { id: number; nombre: string; moneda: "BOB" | "USD"; cap: string; tc: string; interes: string; periodo: "mensual" | "anual"; plazo: string; proposito: string };
export const invFilaVacia = (id: number): InvFila => ({ id, nombre: "", moneda: "BOB", cap: "", tc: "", interes: "0", periodo: "mensual", plazo: "12", proposito: "" });
const n = (x: any) => Number(x) || 0;

/** Convierte una fila a lo que se guarda. Devuelve un texto si falta algo. */
export function aInversorDB(x: InvFila): { error: string } | { fila: any } {
  const c = calcularInversion({ moneda: x.moneda, cap: n(x.cap), tc: n(x.tc), plazo: n(x.plazo) || 12, modo: "porcentaje", valor: n(x.interes), base: x.periodo });
  if (!x.nombre.trim()) return { error: "Cada inversor necesita nombre." }; if (!c.ok) return { error: `${x.nombre.trim() || "Un inversor"}: ${c.error}` };
  return { fila: { nombre: x.nombre.trim(), monto: c.montoBs, interes: c.interes, periodo_interes: c.periodo, plazo_meses: Math.round(n(x.plazo) || 12), moneda: x.moneda, monto_original: n(x.cap), tipo_cambio: x.moneda === "USD" ? n(x.tc) : null, proposito: x.proposito.trim() || null } };
}
/** Capital total en Bs de las filas válidas. */
export const capitalTotal = (filas: InvFila[]) => filas.reduce((s, x) => s + (x.moneda === "USD" ? n(x.cap) * n(x.tc) : n(x.cap)), 0);

export function FilasInversores({ filas, onChange }: { filas: InvFila[]; onChange: (f: InvFila[]) => void }) {
  const up = (id: number, k: keyof InvFila, v: any) => onChange(filas.map(x => (x.id === id ? { ...x, [k]: v } : x)));
  return <>
    <div className="tw"><table><thead><tr><th>Nombre</th><th>Moneda</th><th>Monto</th><th>T/C (Bs por USD)</th><th>Interés %</th><th>El interés es</th><th>Plazo (meses)</th><th>¿Para qué?</th><th /></tr></thead>
      <tbody>{filas.map(i => <tr key={i.id}>
        <td><input value={i.nombre} style={{ width: 140 }} onChange={e => up(i.id, "nombre", e.target.value)} /></td>
        <td><select value={i.moneda} onChange={e => up(i.id, "moneda", e.target.value)}><option value="BOB">Bs</option><option value="USD">USD</option></select></td>
        <td><input type="number" min={0} value={i.cap} style={{ width: 90 }} onChange={e => up(i.id, "cap", e.target.value)} /></td>
        <td>{i.moneda === "USD" ? <input type="number" min={0} step="0.01" value={i.tc} style={{ width: 70 }} placeholder="6.96" onChange={e => up(i.id, "tc", e.target.value)} /> : <span className="mute">—</span>}</td>
        <td><input type="number" min={0} step="0.1" value={i.interes} style={{ width: 64 }} onChange={e => up(i.id, "interes", e.target.value)} /></td>
        <td><select value={i.periodo} onChange={e => up(i.id, "periodo", e.target.value)}><option value="mensual">por mes</option><option value="anual">por año</option></select></td>
        <td><input type="number" min={1} value={i.plazo} style={{ width: 60 }} onChange={e => up(i.id, "plazo", e.target.value)} /></td>
        <td><input value={i.proposito} style={{ width: 150 }} placeholder="opcional" onChange={e => up(i.id, "proposito", e.target.value)} /></td>
        <td><button className="btn suave chico" onClick={() => onChange(filas.filter(x => x.id !== i.id))}>Quitar</button></td></tr>)}</tbody></table></div>
    <div className="fila" style={{ marginTop: 8 }}><button className="btn suave" onClick={() => onChange([...filas, invFilaVacia(filas.reduce((m, x) => Math.max(m, x.id), 0) + 1)])}>+ Agregar inversor</button>{capitalTotal(filas) > 0 && <span className="mute">Capital total: <b>{capitalTotal(filas).toLocaleString("es-BO", { maximumFractionDigits: 2 })} Bs</b></span>}</div>
  </>;
}
