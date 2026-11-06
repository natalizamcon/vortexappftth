import { supabase } from "./supabase";
import { useApp } from "./auth";
import { Campo, bs, hoy, useQuery } from "./ui";
import { esFondo, saldoDe, validarGasto } from "./fondo";

export type FuenteElegida = { fuente: string; detalle: string };
export const SIN_FUENTE: FuenteElegida = { fuente: "", detalle: "" };

/** Pregunta de dónde sale el dinero de una compra: del fondo de inversión de la zona, del fondo general, de otra fuente o de ninguna (si ya se registró aparte).
 *  Solo se muestra a quien maneja las finanzas. */
export function FuenteDinero({ proyectoId, zonaId, valor, onChange, monto }: { proyectoId: string; zonaId: string | null; valor: FuenteElegida; onChange: (v: FuenteElegida) => void; monto?: number }) {
  const { zonas } = useApp(), q = useQuery(() => (proyectoId ? supabase.from("v_fondo_inversion").select("*").eq("proyecto_id", proyectoId) : Promise.resolve({ data: [], error: null })), [proyectoId]);
  const filas: any[] = (q.data as any[]) || [], dZona = zonaId ? saldoDe(filas, proyectoId, zonaId) : 0, dGen = saldoDe(filas, proyectoId, null), zn = zonas.find(z => z.id === zonaId)?.nombre || "la zona";
  const err = valor.fuente && monto ? validarGasto(valor.fuente, monto, filas, proyectoId, zonaId) : "";
  return <Campo l="¿De dónde sale el dinero?">
    <select value={valor.fuente} onChange={e => onChange({ fuente: e.target.value, detalle: e.target.value === "Otra fuente" ? valor.detalle : "" })}>
      <option value="">Elige de dónde sale el dinero…</option>
      {zonaId && <option value="Fondo de la zona">Fondo de inversión de {zn} · disponible {bs(dZona)}</option>}
      <option value="Fondo general">Fondo general de inversión · disponible {bs(dGen)}</option>
      <option value="Otra fuente">Otra fuente (caja chica, ahorro, dinero propio…)</option>
      <option value="NO">No registrar en finanzas (ya lo registré aparte)</option></select>
    {valor.fuente === "Otra fuente" && <input style={{ marginTop: 6 }} placeholder="¿Cuál? (por ejemplo: caja chica)" value={valor.detalle} onChange={e => onChange({ ...valor, detalle: e.target.value })} />}
    {esFondo(valor.fuente) && !err && <small className="mute">Se descuenta del fondo y aparece en Finanzas → Inversores y fondos → Fondo de inversión.</small>}
    {err && <small style={{ color: "var(--bad)" }}>{err}</small>}
  </Campo>;
}

/** Antes de comprar: ¿alcanza el fondo elegido? Devuelve el mensaje de error o "". */
export async function precomprobarFuente(v: FuenteElegida, monto: number, proyectoId: string, zonaId: string | null) {
  if (!esFondo(v.fuente) || !(monto > 0)) return "";
  const { data } = await supabase.from("v_fondo_inversion").select("*").eq("proyecto_id", proyectoId);
  return validarGasto(v.fuente, monto, ((data as any[]) || []), proyectoId, zonaId);
}

/** Registra la compra en Finanzas como inversión, con su fuente. Si sale del fondo, la base de datos lo descuenta y vuelve a validar. Devuelve el mensaje de error o "". */
export async function registrarGastoFuente(p: { proyecto_id: string; zona_id: string | null; categoria: string; descripcion: string; monto: number; fuente: FuenteElegida; comprobante_path?: string | null; fecha?: string }) {
  if (!p.fuente.fuente || p.fuente.fuente === "NO" || !(p.monto > 0)) return "";
  const { error } = await supabase.from("fin_movimientos").insert({ proyecto_id: p.proyecto_id, zona_id: p.zona_id, fecha: p.fecha || hoy(), tipo: "INVERSION", categoria: p.categoria, monto: Math.round(p.monto * 100) / 100, descripcion: p.descripcion, comprobante_path: p.comprobante_path || null, fuente: p.fuente.fuente, fuente_detalle: p.fuente.fuente === "Otra fuente" ? p.fuente.detalle.trim() || null : null });
  return error ? error.message : "";
}
