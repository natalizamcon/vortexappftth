import { useState } from "react";
import { supabase } from "./supabase";
import { useApp } from "./auth";
import { Campo, bs, hoy, useQuery } from "./ui";
import { esDeZona, esFondo, esIngresos, ingresoDisponible, saldoDe, validarGasto } from "./fondo";
import { NuevoInversorDrawer } from "../pages/FinanzasInversores";

export type FuenteElegida = { fuente: string; detalle: string; zona?: string };
export const SIN_FUENTE: FuenteElegida = { fuente: "", detalle: "", zona: "" };
const mesDe = (f: string) => String(f).slice(0, 7);
const mesLargo = (m: string) => new Date(m + "-15T12:00:00").toLocaleDateString("es-BO", { month: "long", year: "numeric" });

/** Si la base de datos todavía no tiene los archivos 29 o 30, explica qué falta en lugar de mostrar un error técnico. */
export const traducirErrorFuente = (m: string) => (/fuente_chk|p_fuente|Could not find the function|schema cache|column .*fuente|fin_movimiento_id|does not exist/i.test(m) ? "Falta actualizar la base de datos: en Supabase → SQL Editor corre los archivos 29_fondo_inversion.sql y 30_dinero_disponible.sql, recarga la página y vuelve a intentar. (Detalle: " + m + ")" : m);

/** Lo que se manda a la base de datos: nada si se eligió "No registrar en finanzas". */
export const fuenteParaGuardar = (v: FuenteElegida) => (!v.fuente || v.fuente === "NO" ? { fuente: null, fuente_detalle: null } : { fuente: v.fuente, fuente_detalle: v.fuente === "Otra fuente" ? v.detalle.trim() || null : null });

/** Pregunta de dónde sale el dinero de una compra o gasto: del fondo de los inversores (de la zona o general), de los ingresos del mes (de la zona o de todo el proyecto),
 *  de otra fuente, o de ninguna (si ya se registró aparte). También deja registrar un inversor nuevo en el momento. Solo se muestra a quien maneja las finanzas. */
export function FuenteDinero({ proyectoId, zonaId = null, zonaLibre = false, valor, onChange, monto, fecha, permitirNo = true }: { proyectoId: string; zonaId?: string | null; zonaLibre?: boolean; valor: FuenteElegida; onChange: (v: FuenteElegida) => void; monto?: number; fecha?: string; permitirNo?: boolean }) {
  const { zonas } = useApp(), dia = fecha || hoy(), mes = mesDe(dia), zid = zonaLibre ? valor.zona || null : zonaId || null, [nuevo, setNuevo] = useState(false);
  const qf = useQuery(() => (proyectoId ? supabase.from("v_fondo_inversion").select("*").eq("proyecto_id", proyectoId) : Promise.resolve({ data: [], error: null })), [proyectoId]);
  const qi = useQuery(() => (proyectoId ? supabase.from("v_ingresos_disponibles").select("*").eq("proyecto_id", proyectoId).eq("mes", mes + "-01") : Promise.resolve({ data: [], error: null })), [proyectoId, mes]);
  const F: any[] = (qf.data as any[]) || [], I: any[] = (qi.data as any[]) || [], zn = zonas.find(z => z.id === zid)?.nombre || "la zona", ml = mesLargo(mes);
  const dFz = zid ? saldoDe(F, proyectoId, zid) : 0, dFg = saldoDe(F, proyectoId, null), dIz = zid ? ingresoDisponible(I, proyectoId, zid, mes) : 0, dIp = ingresoDisponible(I, proyectoId, null, mes);
  const err = valor.fuente && monto ? validarGasto(valor.fuente, monto, F, proyectoId, zid, I, dia) : "";
  const cambia = (fuente: string) => onChange({ ...valor, fuente, detalle: fuente === "Otra fuente" ? valor.detalle : "" });
  return <>
    {zonaLibre && <Campo l="¿De qué zona es el gasto? (si sale del dinero de una zona)"><select value={valor.zona || ""} onChange={e => onChange({ ...valor, zona: e.target.value, fuente: esDeZona(valor.fuente) ? "" : valor.fuente })}><option value="">Sin zona (gasto del proyecto)</option>{zonas.filter(z => z.proyecto_id === proyectoId).map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}</select></Campo>}
    <Campo l="¿De dónde sale el dinero?">
      <select value={valor.fuente} onChange={e => cambia(e.target.value)}>
        <option value="">Elige de dónde sale el dinero…</option>
        {zid && <option value="Fondo de la zona">Fondo de inversores de {zn} · disponible {bs(dFz)}</option>}
        <option value="Fondo general">Fondo general de inversores · disponible {bs(dFg)}</option>
        {zid && <option value="Ingresos del mes de la zona">Ingresos de {ml} de {zn} · disponible {bs(dIz)}</option>}
        <option value="Ingresos del mes (proyecto)">Ingresos de {ml} de todo el proyecto · disponible {bs(dIp)}</option>
        <option value="Otra fuente">Otra fuente (caja chica, ahorro, dinero propio…)</option>
        {permitirNo && <option value="NO">No registrar en finanzas (ya lo registré aparte)</option>}
      </select>
      {valor.fuente === "Otra fuente" && <input style={{ marginTop: 6 }} placeholder="¿Cuál? (por ejemplo: caja chica)" value={valor.detalle} onChange={e => onChange({ ...valor, detalle: e.target.value })} />}
      {esFondo(valor.fuente) && !err && <small className="mute">Se descuenta de {esIngresos(valor.fuente) ? "los ingresos de " + ml : "ese fondo"} y aparece en Finanzas → Inversores y fondos → Dinero disponible.</small>}
      {err && <small style={{ color: "var(--bad)" }}>{err}</small>}
      <div style={{ marginTop: 6 }}><button type="button" className="btn suave chico" onClick={() => setNuevo(true)}>➕ El dinero es de un inversor que todavía no está registrado</button></div>
    </Campo>
    {nuevo && <NuevoInversorDrawer zonaInicial={zid || (zonaLibre || zonaId === null ? "__general" : "")} onClose={() => setNuevo(false)} onCreado={fila => { setNuevo(false); qf.recargar(); onChange({ ...valor, fuente: fila.zona_id && fila.zona_id === zid ? "Fondo de la zona" : !fila.zona_id ? "Fondo general" : valor.fuente, detalle: "" }); }} />}
  </>;
}

/** Antes de comprar: ¿alcanza el saldo elegido? Devuelve el mensaje de error o "". */
export async function precomprobarFuente(v: FuenteElegida, monto: number, proyectoId: string, zonaId: string | null, fecha?: string) {
  if (!esFondo(v.fuente) || !(monto > 0)) return "";
  const dia = fecha || hoy(), zid = zonaId || v.zona || null;
  const [a, b] = await Promise.all([supabase.from("v_fondo_inversion").select("*").eq("proyecto_id", proyectoId), supabase.from("v_ingresos_disponibles").select("*").eq("proyecto_id", proyectoId).eq("mes", mesDe(dia) + "-01")]);
  return validarGasto(v.fuente, monto, ((a.data as any[]) || []), proyectoId, zid, ((b.data as any[]) || []), dia);
}
