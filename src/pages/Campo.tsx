import { useState } from "react";
import { supabase, subirArchivo } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo as CampoF, Cargando, Estado, Modal, Tabs, Vacio, bs, hoy, useAlcance, useQuery } from "../lib/ui";

const dias = (a: string, b: string) => { const r: string[] = []; for (let d = new Date(a + "T00:00:00"), e = new Date(b + "T00:00:00"), i = 0; d <= e && i < 60; d.setDate(d.getDate() + 1), i++) r.push(d.toISOString().slice(0, 10)); return r; };
export default function CampoPage() { const [tab, setTab] = useState("mant"); return <><h1>Mantenimientos y viajes</h1><Tabs items={[["mant", "Mantenimientos"], ["viajes", "Viajes"]]} valor={tab} onChange={setTab} />{tab === "mant" ? <Mantenimientos /> : <Viajes />}</>; }

function Mantenimientos() {
  const { zonaId, proyectoId, zonas } = useApp(), al = useAlcance(), [fil, setFil] = useState("abiertos"), [f, setF] = useState({ objeto: "NAP", referencia: "", tipo: "Correctivo", problema: "", fecha_programada: hoy(), tecnico: "" }), [msg, setMsg] = useState(""), [seg, setSeg] = useState<any>(null), [nuevo, setNuevo] = useState(false);
  const q = useQuery(() => al(supabase.from("mantenimientos").select("*, zonas(nombre)").order("fecha_programada")), [proyectoId, zonaId]);
  const naps = useQuery(() => zonaId ? supabase.from("naps").select("codigo").eq("zona_id", zonaId) : Promise.resolve({ data: [], error: null }), [zonaId]);
  const lista: any[] = ((q.data as any[]) || []).filter(m => fil === "todos" || (fil === "abiertos" ? !["COMPLETADA", "CANCELADA"].includes(m.estado) : m.estado === fil));
  const crear = async () => {
    setMsg(""); const z = zonas.find(x => x.id === zonaId); if (!z) return setMsg("Elige una zona arriba."); if (!f.problema.trim()) return setMsg("Describe el problema o trabajo.");
    const { error } = await supabase.from("mantenimientos").insert({ ...f, proyecto_id: z.proyecto_id, zona_id: z.id }); if (error) setMsg(error.message); else { setNuevo(false); setF({ ...f, problema: "", referencia: "" }); q.recargar(); }
  };
  const cont = (e: string) => ((q.data as any[]) || []).filter(m => m.estado === e).length;
  return <>
    <div className="grid gk" style={{ marginBottom: 14 }}>{[["PENDIENTE", "Programados"], ["EN PROCESO", "En ejecución"], ["PAUSADO", "Pausados"], ["COMPLETADA", "Concluidos"]].map(([e, l]) => <button key={e} className="card kpi" style={{ textAlign: "left", cursor: "pointer", color: "var(--ink)" }} onClick={() => setFil(e)}><span>{l}</span><b>{cont(e)}</b></button>)}</div>
    <div className="fila" style={{ marginBottom: 10 }}><button className="btn mor" onClick={() => setNuevo(!nuevo)}>{nuevo ? "Ocultar" : "+ Programar mantenimiento"}</button><select value={fil} onChange={e => setFil(e.target.value)}><option value="abiertos">Abiertos</option><option value="todos">Todos</option>{["PENDIENTE", "EN PROCESO", "PAUSADO", "COMPLETADA", "CANCELADA"].map(e => <option key={e}>{e}</option>)}</select></div>
    {nuevo && <div className="card"><h2>Programar mantenimiento</h2>{msg && <Aviso tipo="mal">{msg}</Aviso>}<div className="form">
      <CampoF l="¿Qué se atiende?"><select value={f.objeto} onChange={e => setF({ ...f, objeto: e.target.value, referencia: "" })}>{["NAP", "Red troncal", "Equipo", "Cambio de antena", "Otro"].map(o => <option key={o}>{o}</option>)}</select></CampoF>
      <CampoF l="Cuál">{f.objeto === "NAP" ? <select value={f.referencia} onChange={e => setF({ ...f, referencia: e.target.value })}><option value="">Elige…</option>{((naps.data as any[]) || []).map(n => <option key={n.codigo}>{n.codigo}</option>)}</select> : <input value={f.referencia} onChange={e => setF({ ...f, referencia: e.target.value })} />}</CampoF>
      <CampoF l="Tipo"><select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>{["Correctivo", "Preventivo", "Reemplazo de equipo", "Reparación de fibra", "Cambio de NAP o puerto"].map(o => <option key={o}>{o}</option>)}</select></CampoF>
      <CampoF l="Problema o trabajo"><input value={f.problema} onChange={e => setF({ ...f, problema: e.target.value })} /></CampoF><CampoF l="Para cuándo"><input type="date" value={f.fecha_programada} onChange={e => setF({ ...f, fecha_programada: e.target.value })} /></CampoF><CampoF l="Técnico"><input value={f.tecnico} onChange={e => setF({ ...f, tecnico: e.target.value })} /></CampoF></div><button className="btn" onClick={crear}>Registrar para seguimiento</button></div>}
    <div className="card tw">{q.loading ? <Cargando /> : lista.length ? <table><thead><tr><th>Para cuándo</th><th>Zona</th><th>Qué se atiende</th><th>Trabajo</th><th>Técnico</th><th>Estado</th><th /></tr></thead><tbody>{lista.map(m => { const tarde = !["COMPLETADA", "CANCELADA"].includes(m.estado) && m.fecha_programada < hoy(); return <tr key={m.id} style={tarde ? { background: "var(--badb)" } : undefined}><td style={tarde ? { color: "var(--bad)", fontWeight: 600 } : undefined}>{m.fecha_programada}{tarde && " (atrasado)"}</td><td>{m.zonas?.nombre}</td><td><b>{m.objeto}</b> {m.referencia}</td><td>{m.tipo}: {m.problema}</td><td>{m.tecnico || "—"}</td><td><Estado e={m.estado} /></td><td><button className="btn suave chico" onClick={() => setSeg(m)}>Seguimiento</button></td></tr>; })}</tbody></table> : <Vacio>No hay mantenimientos en esta lista.</Vacio>}</div>
    {seg && <Seguimiento m={seg} onClose={() => { setSeg(null); q.recargar(); }} />}
  </>;
}

function Seguimiento({ m, onClose }: any) {
  const [n, setN] = useState({ fecha: hoy(), nota: "", concepto: "", gasto: "" }), [e, setE] = useState(m.estado), [cierre, setCierre] = useState({ solucion: m.solucion || "", costo: "" }), [msg, setMsg] = useState("");
  const log = useQuery(() => supabase.from("mantenimiento_seguimiento").select("*").eq("mantenimiento_id", m.id).order("fecha"), [m.id]);
  const cerrado = ["COMPLETADA", "CANCELADA"].includes(m.estado), extra = ((log.data as any[]) || []).reduce((s, x) => s + +x.gasto, 0);
  const anotar = async () => { if (!n.nota.trim() && !(+n.gasto > 0)) return; const { error } = await supabase.from("mantenimiento_seguimiento").insert({ mantenimiento_id: m.id, proyecto_id: m.proyecto_id, fecha: n.fecha, nota: n.nota, concepto: n.concepto || null, gasto: +n.gasto || 0 }); if (error) setMsg(error.message); else { setN({ ...n, nota: "", concepto: "", gasto: "" }); log.recargar(); } };
  const cambiar = async () => {
    setMsg(""); const cambios: any = { estado: e };
    if (e === "COMPLETADA") { if (!cierre.solucion.trim()) return setMsg("Escribe la solución aplicada para cerrar."); cambios.solucion = cierre.solucion; cambios.costo = cierre.costo === "" ? extra : +cierre.costo; cambios.fecha_cierre = hoy(); }
    const { error } = await supabase.from("mantenimientos").update(cambios).eq("id", m.id); if (error) return setMsg(error.message);
    if (e === "COMPLETADA" && cambios.costo > 0) await supabase.from("fin_movimientos").insert({ proyecto_id: m.proyecto_id, zona_id: m.zona_id, tipo: "GASTO_OPERATIVO", categoria: "Mantenimiento", monto: cambios.costo, descripcion: m.referencia + ": " + m.problema });
    onClose();
  };
  return <Modal titulo={m.objeto + " " + (m.referencia || "") + " · seguimiento"} onClose={onClose} ancho={680}>{msg && <Aviso tipo="mal">{msg}</Aviso>}<p>{m.tipo}: {m.problema}</p>
    <h3>Día por día</h3>{((log.data as any[]) || []).length ? ((log.data as any[]) || []).map(x => <div key={x.id}><small className="mute">{x.fecha}</small> · {x.nota}{x.gasto > 0 && <b> · gasto {bs(x.gasto)} {x.concepto}</b>}</div>) : <Vacio>Sin avances anotados.</Vacio>}<p>Gastos adicionales: <b>{bs(extra)}</b></p>
    {!cerrado && <><div className="form"><CampoF l="Fecha"><input type="date" value={n.fecha} onChange={x => setN({ ...n, fecha: x.target.value })} /></CampoF><CampoF l="Qué se hizo"><input value={n.nota} onChange={x => setN({ ...n, nota: x.target.value })} /></CampoF><CampoF l="Gasto adicional (Bs)"><input type="number" value={n.gasto} onChange={x => setN({ ...n, gasto: x.target.value })} /></CampoF><CampoF l="En qué"><input value={n.concepto} onChange={x => setN({ ...n, concepto: x.target.value })} /></CampoF></div><button className="btn suave" onClick={anotar}>Anotar avance del día</button>
      <h3 style={{ marginTop: 14 }}>Cambiar estado</h3><div className="form"><CampoF l="Nuevo estado"><select value={e} onChange={x => setE(x.target.value)}>{["PENDIENTE", "EN PROCESO", "PAUSADO", "COMPLETADA", "CANCELADA"].map(o => <option key={o}>{o}</option>)}</select></CampoF>
        {e === "COMPLETADA" && <><CampoF l="Solución aplicada"><input value={cierre.solucion} onChange={x => setCierre({ ...cierre, solucion: x.target.value })} /></CampoF><CampoF l={"Costo total (Bs) · adicionales " + bs(extra)}><input type="number" value={cierre.costo} onChange={x => setCierre({ ...cierre, costo: x.target.value })} placeholder={String(extra)} /></CampoF></>}</div><button className="btn" onClick={cambiar}>Guardar estado</button></>}
    {cerrado && <Aviso>Mantenimiento cerrado: solo lectura. Costo {bs(m.costo)}.</Aviso>}</Modal>;
}

function Viajes() {
  const { zonaId, proyectoId, zonas } = useApp(), al = useAlcance(), zona = zonas.find(z => z.id === zonaId), [pg, setPg] = useState(false), [det, setDet] = useState<any>(null), [msg, setMsg] = useState("");
  const [f, setF] = useState({ fecha_inicio: hoy(), fecha_fin: hoy(), tipo: "Instalaciones", detalle: "", personal: "", personas: "2", gasolina: "0", movilidad: "0", pago_dia: "150", viaticos_dia: "50" });
  const q = useQuery(() => al(supabase.from("viajes").select("*, zonas(nombre)").order("fecha_inicio", { ascending: false })), [proyectoId, zonaId]);
  const dd = useQuery(() => ((q.data as any[]) || []).length ? supabase.from("viaje_dias").select("viaje_id, gasto").in("viaje_id", ((q.data as any[]) || []).map(v => v.id)) : Promise.resolve({ data: [], error: null }), [q.data]);
  const costo = (v: any) => +v.gasolina + +v.movilidad + dias(v.fecha_inicio, v.fecha_fin).length * v.personas * (+v.pago_dia + +v.viaticos_dia) + ((dd.data as any[]) || []).filter(x => x.viaje_id === v.id).reduce((s, x) => s + +x.gasto, 0);
  const crear = async () => {
    setMsg(""); if (!zona) return setMsg("Elige una zona arriba."); if (f.fecha_fin < f.fecha_inicio) return setMsg("La fecha de regreso no puede ser antes de la salida."); if (f.fecha_inicio < zona.fecha_inicio) return setMsg("La zona inicia el " + zona.fecha_inicio + ": no se pueden programar viajes antes.");
    const { error } = await supabase.from("viajes").insert({ ...f, personas: +f.personas || 1, gasolina: +f.gasolina, movilidad: +f.movilidad, pago_dia: +f.pago_dia, viaticos_dia: +f.viaticos_dia, proyecto_id: zona.proyecto_id, zona_id: zona.id }); if (error) setMsg(error.message); else { setPg(false); q.recargar(); }
  };
  const I = (l: string, k: string, t = "text") => <CampoF l={l}><input type={t} value={(f as any)[k]} onChange={e => setF({ ...f, [k]: e.target.value })} /></CampoF>;
  return <>
    <div className="fila" style={{ marginBottom: 10 }}><button className="btn mor" onClick={() => setPg(!pg)}>{pg ? "Ocultar" : "+ Programar viaje"}</button></div>
    {pg && <div className="card"><h2>Programar viaje</h2>{msg && <Aviso tipo="mal">{msg}</Aviso>}<div className="form">{I("Sale el día", "fecha_inicio", "date")}{I("Regresa el día", "fecha_fin", "date")}<CampoF l="Trabajo del viaje"><select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>{["Instalaciones", "Mantenimiento", "Bajas", "Mixto", "Otro"].map(o => <option key={o}>{o}</option>)}</select></CampoF>
      {f.tipo === "Otro" && I("Detalle (ej. hablar con el dirigente para evaluar la zona)", "detalle")}{I("Personal (nombres)", "personal")}{I("Cantidad de personas", "personas", "number")}{I("Gasolina (Bs)", "gasolina", "number")}{I("Movilidad (Bs)", "movilidad", "number")}{I("Pago por persona y día (Bs)", "pago_dia", "number")}{I("Viáticos por persona y día (Bs)", "viaticos_dia", "number")}</div><button className="btn" onClick={crear}>Programar viaje</button></div>}
    <div className="card tw">{q.loading ? <Cargando /> : ((q.data as any[]) || []).length ? <table><thead><tr><th>Fechas</th><th>Zona</th><th>Trabajo</th><th>Personal</th><th>Costo</th><th>Estado</th><th /></tr></thead><tbody>{((q.data as any[]) || []).map(v => <tr key={v.id}><td>{v.fecha_inicio}{v.fecha_fin !== v.fecha_inicio && " → " + v.fecha_fin}</td><td>{v.zonas?.nombre}</td><td>{v.tipo}{v.detalle && <small className="mute"> · {v.detalle}</small>}</td><td>{v.personal || "—"} ({v.personas})</td><td><b>{bs(costo(v))}</b></td><td><Estado e={v.estado} /></td><td><button className="btn suave chico" onClick={() => setDet(v)}>Avance diario</button></td></tr>)}</tbody></table> : <Vacio>Aún no hay viajes.</Vacio>}</div>
    {det && <ViajeDetalle v={det} onClose={() => { setDet(null); q.recargar(); dd.recargar(); }} />}
  </>;
}

function ViajeDetalle({ v, onClose }: any) {
  const [est, setEst] = useState(v.estado), [n, setN] = useState({ fecha: v.fecha_inicio, actividad: "", concepto: "", gasto: "" }), [arch, setArch] = useState<File | null>(null), [msg, setMsg] = useState("");
  const L = useQuery(() => supabase.from("viaje_dias").select("*").eq("viaje_id", v.id).order("fecha"), [v.id]);
  const cl = useQuery(() => supabase.from("clientes").select("nombre, fecha_instalacion, fecha_baja").eq("zona_id", v.zona_id).or(`and(fecha_instalacion.gte.${v.fecha_inicio},fecha_instalacion.lte.${v.fecha_fin}),and(fecha_baja.gte.${v.fecha_inicio},fecha_baja.lte.${v.fecha_fin})`), [v.id]);
  const mm = useQuery(() => supabase.from("mantenimientos").select("referencia, problema, fecha_cierre").eq("zona_id", v.zona_id).gte("fecha_cierre", v.fecha_inicio).lte("fecha_cierre", v.fecha_fin), [v.id]);
  const ro = ["FINALIZADO", "CANCELADO"].includes(v.estado), ds = dias(v.fecha_inicio, v.fecha_fin), I: any[] = (L.data as any[]) || [], imprevistos = I.reduce((s, x) => s + +x.gasto, 0);
  const fijo = +v.gasolina + +v.movilidad + ds.length * v.personas * (+v.pago_dia + +v.viaticos_dia);
  const anotar = async () => {
    setMsg(""); if (!n.actividad.trim() && !(+n.gasto > 0)) return;
    try { const ruta = arch ? await subirArchivo("comprobantes", v.proyecto_id, arch) : null; const { error } = await supabase.from("viaje_dias").insert({ viaje_id: v.id, proyecto_id: v.proyecto_id, fecha: n.fecha, actividad: n.actividad || null, concepto_gasto: n.concepto || null, gasto: +n.gasto || 0, comprobante_path: ruta }); if (error) throw new Error(error.message); setN({ ...n, actividad: "", concepto: "", gasto: "" }); setArch(null); L.recargar(); } catch (e: any) { setMsg(e.message); }
  };
  const cambiar = async () => { const { error } = await supabase.from("viajes").update({ estado: est }).eq("id", v.id); if (error) setMsg(error.message); else onClose(); };
  return <Modal titulo={"Viaje " + v.fecha_inicio + " → " + v.fecha_fin} onClose={onClose} ancho={760}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    <div className="fila"><Estado e={v.estado} /><span className="mute">Costos fijos {bs(fijo)} + imprevistos {bs(imprevistos)} = </span><b>{bs(fijo + imprevistos)}</b></div>
    <div className="fila" style={{ margin: "10px 0" }}><select value={est} onChange={e => setEst(e.target.value)}>{["PROGRAMADO", "EN EJECUCION", "PAUSADO", "FINALIZADO", "CANCELADO"].map(o => <option key={o}>{o}</option>)}</select><button className="btn suave" onClick={cambiar}>Cambiar estado</button></div>
    {ro && <Aviso>Viaje cerrado: solo lectura. Cambia el estado para volver a editarlo.</Aviso>}
    <h3>Día por día</h3>{ds.map(d => { const a = I.filter(x => x.fecha === d), inst = ((cl.data as any[]) || []).filter(c => c.fecha_instalacion === d), baj = ((cl.data as any[]) || []).filter(c => c.fecha_baja === d), man = ((mm.data as any[]) || []).filter(x => x.fecha_cierre === d);
      return <div key={d} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}><b>{d}</b>{!a.length && !inst.length && !baj.length && !man.length && <small className="mute"> · sin actividad</small>}
        {inst.map(c => <div key={c.nombre}><span className="tag">Instalación</span> {c.nombre} <small className="mute">automático</small></div>)}{baj.map(c => <div key={c.nombre}><span className="tag">Baja</span> {c.nombre} <small className="mute">automático</small></div>)}{man.map((x, i) => <div key={i}><span className="tag">Mantenimiento</span> {x.referencia}: {x.problema} <small className="mute">automático</small></div>)}
        {a.map(x => <div key={x.id}>{x.actividad && <>{x.actividad} <small className="mute">manual</small></>}{x.gasto > 0 && <> · <b>gasto imprevisto {bs(x.gasto)}</b> {x.concepto_gasto}{x.comprobante_path && " 📎"}</>}</div>)}</div>; })}
    {!ro && <><h3 style={{ marginTop: 12 }}>Anotar avance o gasto imprevisto</h3><div className="form"><CampoF l="Día"><select value={n.fecha} onChange={e => setN({ ...n, fecha: e.target.value })}>{ds.map(d => <option key={d}>{d}</option>)}</select></CampoF><CampoF l="Qué se hizo"><input value={n.actividad} onChange={e => setN({ ...n, actividad: e.target.value })} /></CampoF><CampoF l="Gasto imprevisto (Bs)"><input type="number" value={n.gasto} onChange={e => setN({ ...n, gasto: e.target.value })} /></CampoF><CampoF l="En qué"><input value={n.concepto} onChange={e => setN({ ...n, concepto: e.target.value })} /></CampoF><CampoF l="Comprobante (si hay)"><input type="file" key={String(L.data)} onChange={e => setArch(e.target.files?.[0] || null)} /></CampoF></div><button className="btn" onClick={anotar}>Anotar</button></>}</Modal>;
}
