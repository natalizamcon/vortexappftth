import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Cargando, Vacio, bs, useQuery } from "../lib/ui";
import { FormModal } from "../lib/formmodal";
import { todas } from "../lib/datos";

const n = (x: any) => Number(x) || 0;

/** Paquetes (planes) de la zona. Los cambios se preparan y solo se aplican al pulsar "Efectuar cambios". */
export function Paquetes() {
  const { zonas, zonaId, recargar } = useApp(), zona = zonas.find(z => z.id === zonaId);
  const planes = useQuery(() => zonaId ? supabase.from("planes").select("*").eq("zona_id", zonaId).order("precio") : Promise.resolve({ data: [], error: null }), [zonaId]);
  const cuentas = useQuery(() => zonaId ? todas(() => supabase.from("clientes").select("plan_id").eq("zona_id", zonaId).neq("estado", "BAJA").order("id")).then(data => ({ data, error: null })).catch(() => ({ data: [], error: null })) : Promise.resolve({ data: [], error: null }), [zonaId]);
  const [draft, setDraft] = useState<Record<string, any>>({}), [corte, setCorte] = useState<string | null>(null), [nuevo, setNuevo] = useState(false), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false);
  const P: any[] = (planes.data as any[]) || [], C: any[] = (cuentas.data as any[]) || [];
  if (!zona) return <Aviso>Elige una <b>zona</b> arriba para ver y cambiar sus paquetes.</Aviso>;

  const valor = (p: any, k: string) => (draft[p.id] && k in draft[p.id] ? draft[p.id][k] : p[k]);
  const cambia = (p: any, k: string, v: any) => setDraft(d => { const x = { ...(d[p.id] || {}), [k]: v }; if (String(x[k]) === String(p[k])) delete x[k]; const out = { ...d, [p.id]: x }; if (!Object.keys(x).length) delete out[p.id]; return out; });
  const cambiosPlan = P.filter(p => draft[p.id]), hayCorte = corte !== null && n(corte) !== n(zona.dia_corte), total = cambiosPlan.length + (hayCorte ? 1 : 0);
  const resumen = [...cambiosPlan.map(p => { const d = draft[p.id], partes: string[] = []; if ("mbps" in d) partes.push(`velocidad ${p.mbps} → ${d.mbps} Mbps`); if ("precio" in d) partes.push(`precio ${bs(p.precio)} → ${bs(d.precio)}`); if ("activo" in d) partes.push(d.activo ? "se activa" : "se desactiva"); return `${p.nombre}: ${partes.join(", ")}`; }), ...(hayCorte ? [`Día de vencimiento y corte: ${zona.dia_corte} → ${corte}`] : [])];

  const efectuar = async () => {
    setMsg(""); setOk("");
    for (const p of cambiosPlan) { const d = draft[p.id]; if (("mbps" in d && !(n(d.mbps) > 0)) || ("precio" in d && !(n(d.precio) >= 0 && String(d.precio) !== ""))) return setMsg(`Revisa el paquete ${p.nombre}: la velocidad debe ser mayor a 0 y el precio no puede quedar vacío.`); }
    if (hayCorte && (n(corte) < 1 || n(corte) > 28)) return setMsg("El día de corte debe estar entre 1 y 28.");
    if (!confirm(`Se aplicarán ${total} cambio${total === 1 ? "" : "s"}:\n\n• ${resumen.join("\n• ")}\n\nLos clientes actuales conservan el plan que contrataron; los nuevos precios valen para contratos nuevos. ¿Efectuar los cambios?`)) return;
    setOcup(true);
    try {
      for (const p of cambiosPlan) { const d = draft[p.id], c: any = {}; if ("mbps" in d) c.mbps = Math.round(n(d.mbps)); if ("precio" in d) c.precio = n(d.precio); if ("activo" in d) c.activo = !!d.activo; const { error } = await supabase.from("planes").update(c).eq("id", p.id); if (error) throw new Error(error.message); }
      if (hayCorte) { const { error } = await supabase.from("zonas").update({ dia_corte: Math.round(n(corte)) }).eq("id", zona.id); if (error) throw new Error("No se pudo cambiar el día de corte: " + error.message); await recargar(); }
      setDraft({}); setCorte(null); setOk(`Listo: se efectuaron ${total} cambio${total === 1 ? "" : "s"}.`); planes.recargar();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };

  return <>
    <div className="fila entre" style={{ marginBottom: 12 }}><b>Zona {zona.nombre}</b><button className="btn" onClick={() => setNuevo(true)}>+ Nuevo plan</button></div>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="card"><h2>Fecha de corte de la zona {zona.nombre}</h2><div className="fila">Día de vencimiento y corte <input type="number" min={1} max={28} style={{ width: 70 }} value={corte ?? zona.dia_corte} onChange={e => setCorte(e.target.value)} /><span className="mute">Cada zona tiene su fecha y se puede cambiar cuando haga falta. El primer mes se prorratea por los días reales del mes.</span></div></div>
    <Aviso>Cambiar velocidad o precio solo afecta a los contratos nuevos. Los clientes actuales conservan el plan que contrataron hasta que hagan upgrade, downgrade o baja.</Aviso>
    <div className="card tw">{planes.loading ? <Cargando /> : P.length ? <table><thead><tr><th>Plan</th><th>Velocidad (Mbps)</th><th>Precio mensual (Bs)</th><th>Activo</th><th>Clientes con este plan</th></tr></thead>
      <tbody>{P.map(p => { const cambiado = !!draft[p.id]; return <tr key={p.id} style={cambiado ? { background: "var(--warnb)" } : undefined}><td><b>{p.nombre}</b></td>
        <td><input type="number" min={1} style={{ width: 100 }} value={valor(p, "mbps")} onChange={e => cambia(p, "mbps", e.target.value)} /></td>
        <td><input type="number" min={0} step={0.01} style={{ width: 110 }} value={valor(p, "precio")} onChange={e => cambia(p, "precio", e.target.value)} /></td>
        <td><input type="checkbox" checked={!!valor(p, "activo")} onChange={e => cambia(p, "activo", e.target.checked)} /></td><td>{C.filter(x => x.plan_id === p.id).length}</td></tr>; })}</tbody></table> : <Vacio>Esta zona aún no tiene paquetes.</Vacio>}</div>
    <div className="card"><div className="fila"><button className="btn mor" disabled={!total || ocup} onClick={efectuar}>{ocup ? "Aplicando…" : "Efectuar cambios" + (total ? ` (${total})` : "")}</button><button className="btn suave" disabled={!total || ocup} onClick={() => { setDraft({}); setCorte(null); setMsg(""); }}>Descartar</button></div>
      {total > 0 ? <><p style={{ margin: "8px 0 2px" }}><b>Cambios pendientes</b> (todavía no se aplicaron):</p><ul style={{ margin: 0, paddingLeft: 18 }}>{resumen.map((t, i) => <li key={i}>{t}</li>)}</ul></> : <p className="mute" style={{ margin: "8px 0 0" }}>Cambia velocidades, precios, activos o el día de corte; los cambios solo se aplican cuando pulsas "Efectuar cambios".</p>}</div>
    {nuevo && <FormModal titulo={"Nuevo plan · zona " + zona.nombre} onClose={() => setNuevo(false)} valores={{}}
      campos={[{ k: "nombre", l: "Nombre del plan", req: true }, { k: "mbps", l: "Velocidad (Mbps)", t: "number", req: true }, { k: "precio", l: "Precio mensual (Bs)", t: "number", req: true, paso: 0.01 }]}
      onGuardar={async f => { const { error } = await supabase.from("planes").insert({ proyecto_id: zona.proyecto_id, zona_id: zona.id, nombre: String(f.nombre).trim(), mbps: Math.round(f.mbps), precio: f.precio, activo: true }); if (error) return error.message; planes.recargar(); }} />}
  </>;
}
