import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Estado, Kpi, Vacio, bs, hoy, useAlcance, useQuery } from "../lib/ui";
import { Drawer } from "../lib/drawer";
import { BarrasH } from "../lib/graficos";
import type { Accion } from "./Servicios";

const n = (x: any) => Number(x) || 0;
const OBJETOS = ["NAP", "Red troncal", "Equipo", "Cambio de antena", "Otro"], TIPOS = ["Correctivo", "Preventivo", "Reemplazo de equipo", "Reparación de fibra", "Cambio de NAP o puerto"];
const fcorta = (d?: string) => (d ? d.slice(8, 10) + "/" + d.slice(5, 7) : "—");

export function Mantenimientos({ accion }: { accion: Accion }) {
  const { zonaId, proyectoId, zonas } = useApp(), al = useAlcance(), zona = zonas.find(z => z.id === zonaId);
  const q = useQuery(() => al(supabase.from("mantenimientos").select("*, zonas(nombre)").order("fecha_programada", { ascending: false }).limit(1500)), [proyectoId, zonaId]);
  const [fil, setFil] = useState("abiertos"), [panel, setPanel] = useState<"" | "registrar" | "programar">(""), [seg, setSeg] = useState<any>(null), [orden, setOrden] = useState<any>(null);
  useEffect(() => { if (accion?.nueva || accion?.orden) { setOrden(accion.orden || null); setPanel("registrar"); } }, [accion?.ts]);
  const M: any[] = (q.data as any[]) || [], cont = (e: string) => M.filter(m => m.estado === e).length;
  const lista = M.filter(m => fil === "todos" || (fil === "abiertos" ? !["COMPLETADA", "CANCELADA"].includes(m.estado) : m.estado === fil));
  const hechos = M.filter(m => m.estado === "COMPLETADA"), costo = hechos.reduce((s, m) => s + n(m.costo), 0);
  const porNap: Record<string, number> = {}, porTipo: Record<string, number> = {};
  M.filter(m => m.objeto === "NAP" && m.referencia && /correctivo/i.test(m.tipo || "")).forEach(m => { porNap[m.referencia] = (porNap[m.referencia] || 0) + 1; });
  hechos.forEach(m => { const t = m.tipo || "Sin tipo"; porTipo[t] = (porTipo[t] || 0) + n(m.costo); });
  return <>
    <div className="fila" style={{ marginBottom: 10 }}><button className="btn" onClick={() => { setOrden(null); setPanel("registrar"); }}>+ Registrar mantenimiento</button><button className="btn mor" onClick={() => setPanel("programar")}>+ Programar mantenimiento</button></div>
    <div className="grid gk" style={{ marginBottom: 14 }}>{[["PENDIENTE", "Programados", "var(--lil)"], ["EN PROCESO", "En ejecución", "var(--acc)"], ["PAUSADO", "Pausados", "var(--warn)"], ["COMPLETADA", "Concluidos", "var(--ok)"]].map(([e, l, c]) => <button key={e} className="card kpi" style={{ textAlign: "left", cursor: "pointer", color: "var(--ink)", borderTopColor: c }} onClick={() => setFil(e)}><span>{l}</span><b>{cont(e)}</b></button>)}</div>
    <div className="card tw"><div className="fila entre"><h2>Mantenimientos y su estado</h2><select value={fil} onChange={e => setFil(e.target.value)}><option value="abiertos">Abiertos</option><option value="todos">Todos</option>{["PENDIENTE", "EN PROCESO", "PAUSADO", "COMPLETADA", "CANCELADA"].map(e => <option key={e}>{e}</option>)}</select></div>
      {q.loading ? <Cargando /> : lista.length ? <table><thead><tr><th>Para cuándo</th><th>Zona</th><th>Qué se atiende</th><th>Trabajo</th><th>Técnico</th><th>Estado</th><th /></tr></thead>
        <tbody>{lista.map(m => { const tarde = !["COMPLETADA", "CANCELADA"].includes(m.estado) && m.fecha_programada < hoy(); return <tr key={m.id} style={tarde ? { background: "var(--badb)" } : undefined}><td style={tarde ? { color: "var(--bad)", fontWeight: 600 } : undefined}>{m.fecha_programada}{tarde && " (atrasado)"}</td><td>{m.zonas?.nombre}</td><td><b>{m.objeto}</b> {m.referencia}</td><td>{m.tipo}: {m.problema}</td><td>{m.tecnico || "—"}</td><td><Estado e={m.estado} /></td><td><button className="btn suave chico" onClick={() => setSeg(m)}>Seguimiento</button></td></tr>; })}</tbody></table> : <Vacio>No hay mantenimientos en esta lista.</Vacio>}
      <p className="mute" style={{ margin: "8px 0 0" }}>Al concluir se abre el registro del mantenimiento con el resumen de los costos adicionales.</p></div>
    <div className="grid gk" style={{ marginBottom: 14 }}><Kpi t="Mantenimientos" v={hechos.length} s="Concluidos" /><Kpi t="Costo total" v={bs(costo)} /><Kpi t="Costo promedio" v={bs(hechos.length ? costo / hechos.length : 0)} /></div>
    <div className="grid g2"><div className="card"><h2>NAP con más fallas</h2>{Object.keys(porNap).length ? <BarrasH filas={Object.entries(porNap).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([nombre, valor]) => ({ nombre, valor, extra: String(valor) }))} /> : <p className="mute">Ninguna NAP tiene correctivos registrados.</p>}</div>
      <div className="card"><h2>Costo por tipo de mantenimiento</h2>{Object.keys(porTipo).length ? <BarrasH color="var(--acc)" filas={Object.entries(porTipo).sort((a, b) => b[1] - a[1]).map(([nombre, valor]) => ({ nombre, valor }))} /> : <p className="mute">Aún no hay mantenimientos concluidos.</p>}</div></div>
    <div className="card tw">{hechos.length ? <table><thead><tr><th>Fecha</th><th>NAP</th><th>Tipo</th><th>Problema</th><th>Costo</th></tr></thead><tbody>{hechos.map(m => <tr key={m.id}><td>{fcorta(m.fecha_cierre || m.fecha_programada)}</td><td>{m.referencia || m.objeto}</td><td>{m.tipo}</td><td>{m.problema}</td><td style={{ color: "var(--ok)" }}>{bs(m.costo)}</td></tr>)}</tbody></table> : <Vacio>Aún no hay mantenimientos concluidos.</Vacio>}</div>
    {panel && zona && <FormMantenimiento modo={panel} zona={zona} orden={orden} onClose={() => setPanel("")} onListo={() => { setPanel(""); q.recargar(); }} />}
    {panel && !zona && <Drawer titulo="Mantenimiento" onClose={() => setPanel("")}><Aviso>Elige una zona arriba para registrar o programar un mantenimiento.</Aviso></Drawer>}
    {seg && <Seguimiento m={seg} onClose={() => { setSeg(null); q.recargar(); }} />}
  </>;
}

function FormMantenimiento({ modo, zona, orden, onClose, onListo }: { modo: "registrar" | "programar"; zona: any; orden: any; onClose: () => void; onListo: () => void }) {
  const naps = useQuery(() => supabase.from("naps").select("codigo").eq("zona_id", zona.id).order("codigo"), [zona.id]);
  const tecnicos = useQuery(() => supabase.from("instaladores").select("nombre").eq("zona_id", zona.id).eq("activo", true).order("nombre"), [zona.id]);
  const [f, setF] = useState({ objeto: "NAP", referencia: orden?.referencia || "", tipo: "Correctivo", problema: "", solucion: "", fecha: hoy(), tecnico: orden?.tecnico || "", costo: "" }), [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false);
  const reg = modo === "registrar";
  const guardar = async () => {
    setMsg(""); if (!f.problema.trim()) return setMsg("Describe el problema o el trabajo."); if (reg && !f.solucion.trim()) return setMsg("Escribe la solución aplicada.");
    setOcup(true);
    try {
      const fila: any = { proyecto_id: zona.proyecto_id, zona_id: zona.id, objeto: f.objeto, referencia: f.referencia || null, tipo: f.tipo, problema: f.problema.trim(), fecha_programada: f.fecha, tecnico: f.tecnico || null };
      if (reg) Object.assign(fila, { estado: "COMPLETADA", solucion: f.solucion.trim(), costo: n(f.costo), fecha_cierre: f.fecha });
      const { data, error } = await supabase.from("mantenimientos").insert(fila).select("id").single(); if (error) throw new Error(error.message);
      if (reg && n(f.costo) > 0) await supabase.from("fin_movimientos").insert({ proyecto_id: zona.proyecto_id, zona_id: zona.id, tipo: "GASTO_OPERATIVO", categoria: "Mantenimiento", monto: n(f.costo), descripcion: (f.referencia || f.objeto) + ": " + f.problema, fecha: f.fecha });
      if (orden) await supabase.from("ordenes_trabajo").update({ estado: reg ? "COMPLETADA" : "EN PROCESO", cerrado_en: reg ? new Date().toISOString() : null, resultado_id: (data as any)?.id }).eq("id", orden.id);
      onListo();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  return <Drawer titulo={(reg ? "Registrar mantenimiento" : "Programar mantenimiento") + " · zona " + zona.nombre} ancho={500} onClose={onClose}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    <p className="mute" style={{ marginTop: 0 }}>{reg ? "Para un trabajo que ya se hizo: queda concluido y su costo pasa a gastos operativos." : "Queda programado para darle seguimiento día por día."}</p>
    <div className="form" style={{ gridTemplateColumns: "1fr" }}>
      <Campo l="¿Qué se atiende?"><select value={f.objeto} onChange={e => setF({ ...f, objeto: e.target.value, referencia: "" })}>{OBJETOS.map(o => <option key={o}>{o}</option>)}</select></Campo>
      <Campo l="Cuál">{f.objeto === "NAP" ? <select value={f.referencia} onChange={e => setF({ ...f, referencia: e.target.value })}><option value="">Elige…</option>{((naps.data as any[]) || []).map(x => <option key={x.codigo}>{x.codigo}</option>)}</select> : <input value={f.referencia} onChange={e => setF({ ...f, referencia: e.target.value })} />}</Campo>
      <Campo l="Tipo"><select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>{TIPOS.map(o => <option key={o}>{o}</option>)}</select></Campo>
      <Campo l="Problema o trabajo"><input value={f.problema} onChange={e => setF({ ...f, problema: e.target.value })} /></Campo>
      {reg && <Campo l="Solución aplicada"><input value={f.solucion} onChange={e => setF({ ...f, solucion: e.target.value })} /></Campo>}
      <Campo l={reg ? "Fecha en que se hizo" : "Para cuándo"}><input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></Campo>
      <Campo l="Técnico">{((tecnicos.data as any[]) || []).length ? <select value={f.tecnico} onChange={e => setF({ ...f, tecnico: e.target.value })}><option value="">Sin asignar</option>{((tecnicos.data as any[]) || []).map(x => <option key={x.nombre}>{x.nombre}</option>)}</select> : <input value={f.tecnico} onChange={e => setF({ ...f, tecnico: e.target.value })} />}</Campo>
      {reg && <Campo l="Costo total (Bs)"><input type="number" min={0} step={0.01} value={f.costo} onChange={e => setF({ ...f, costo: e.target.value })} /></Campo>}</div>
    <button className="btn" style={{ width: "100%", marginTop: 8 }} disabled={ocup} onClick={guardar}>{ocup ? "Guardando…" : reg ? "Registrar mantenimiento" : "Registrar para seguimiento"}</button></Drawer>;
}

function Seguimiento({ m, onClose }: { m: any; onClose: () => void }) {
  const [n2, setN] = useState({ fecha: hoy(), nota: "", concepto: "", gasto: "" }), [e, setE] = useState(m.estado), [cierre, setCierre] = useState({ solucion: m.solucion || "", costo: "" }), [msg, setMsg] = useState("");
  const log = useQuery(() => supabase.from("mantenimiento_seguimiento").select("*").eq("mantenimiento_id", m.id).order("fecha"), [m.id]);
  const cerrado = ["COMPLETADA", "CANCELADA"].includes(m.estado), extra = ((log.data as any[]) || []).reduce((s, x) => s + n(x.gasto), 0);
  const anotar = async () => { if (!n2.nota.trim() && !(n(n2.gasto) > 0)) return; const { error } = await supabase.from("mantenimiento_seguimiento").insert({ mantenimiento_id: m.id, proyecto_id: m.proyecto_id, fecha: n2.fecha, nota: n2.nota, concepto: n2.concepto || null, gasto: n(n2.gasto) }); if (error) setMsg(error.message); else { setN({ ...n2, nota: "", concepto: "", gasto: "" }); log.recargar(); } };
  const cambiar = async () => {
    setMsg(""); const cambios: any = { estado: e };
    if (e === "COMPLETADA") { if (!cierre.solucion.trim()) return setMsg("Escribe la solución aplicada para cerrar."); cambios.solucion = cierre.solucion; cambios.costo = cierre.costo === "" ? extra : n(cierre.costo); cambios.fecha_cierre = hoy(); }
    const { error } = await supabase.from("mantenimientos").update(cambios).eq("id", m.id); if (error) return setMsg(error.message);
    if (e === "COMPLETADA" && cambios.costo > 0) await supabase.from("fin_movimientos").insert({ proyecto_id: m.proyecto_id, zona_id: m.zona_id, tipo: "GASTO_OPERATIVO", categoria: "Mantenimiento", monto: cambios.costo, descripcion: (m.referencia || m.objeto) + ": " + m.problema });
    onClose();
  };
  return <Drawer titulo={m.objeto + " " + (m.referencia || "") + " · seguimiento"} ancho={560} onClose={onClose}>{msg && <Aviso tipo="mal">{msg}</Aviso>}<p style={{ marginTop: 0 }}>{m.tipo}: {m.problema}</p>
    <h3>Día por día</h3>{((log.data as any[]) || []).length ? ((log.data as any[]) || []).map(x => <div key={x.id} style={{ padding: "3px 0" }}><small className="mute">{x.fecha}</small> · {x.nota}{n(x.gasto) > 0 && <b> · gasto {bs(x.gasto)} {x.concepto}</b>}</div>) : <Vacio>Sin avances anotados.</Vacio>}<p>Gastos adicionales: <b>{bs(extra)}</b></p>
    {!cerrado ? <><div className="form" style={{ gridTemplateColumns: "1fr" }}><Campo l="Fecha"><input type="date" value={n2.fecha} onChange={x => setN({ ...n2, fecha: x.target.value })} /></Campo><Campo l="Qué se hizo"><input value={n2.nota} onChange={x => setN({ ...n2, nota: x.target.value })} /></Campo><Campo l="Gasto adicional (Bs)"><input type="number" value={n2.gasto} onChange={x => setN({ ...n2, gasto: x.target.value })} /></Campo><Campo l="En qué"><input value={n2.concepto} onChange={x => setN({ ...n2, concepto: x.target.value })} /></Campo></div>
      <button className="btn suave" onClick={anotar}>Anotar avance del día</button>
      <h3 style={{ marginTop: 14 }}>Cambiar estado</h3><div className="form" style={{ gridTemplateColumns: "1fr" }}><Campo l="Nuevo estado"><select value={e} onChange={x => setE(x.target.value)}>{["PENDIENTE", "EN PROCESO", "PAUSADO", "COMPLETADA", "CANCELADA"].map(o => <option key={o}>{o}</option>)}</select></Campo>
        {e === "COMPLETADA" && <><Campo l="Solución aplicada"><input value={cierre.solucion} onChange={x => setCierre({ ...cierre, solucion: x.target.value })} /></Campo><Campo l={"Costo total (Bs) · adicionales " + bs(extra)}><input type="number" value={cierre.costo} onChange={x => setCierre({ ...cierre, costo: x.target.value })} placeholder={String(extra)} /></Campo></>}</div><button className="btn" onClick={cambiar}>Guardar estado</button></>
      : <Aviso>Mantenimiento cerrado: solo lectura. Costo {bs(m.costo)}.</Aviso>}</Drawer>;
}
