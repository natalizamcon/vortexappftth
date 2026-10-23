import { ReactNode, useState } from "react";
import { supabase, subirArchivo, urlArchivo } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { aPapelera } from "../lib/papelera";
import { Aviso, Campo, Cargando, Estado, Kpi, Vacio, bs, hoy, useAlcance, useQuery } from "../lib/ui";
import { Drawer } from "../lib/drawer";
import { costoViaje, diasEntre, estimadoViaje } from "../lib/viajes";
import { PresupuestoBarras } from "./Presupuesto";

const n = (x: any) => Number(x) || 0;
const nada = Promise.resolve({ data: [], error: null });
const mesAprox = (meses: number) => { const d = new Date(); d.setMonth(d.getMonth() + Math.ceil(meses)); return d.toLocaleDateString("es-BO", { month: "long", year: "numeric" }); };
const ESTADOS_VIAJE = ["PROGRAMADO", "EN EJECUCION", "PAUSADO", "FINALIZADO", "CANCELADO"], CERRADOS = ["FINALIZADO", "CANCELADO"];

export function AvanceViajes() {
  const [sub, setSub] = useState("plan");
  return <>
    <div className="subtabs">{[["plan", "Avance del plan"], ["viajes", "Viajes y gastos"], ["diario", "Diario de la zona"], ["gastos", "Gastos adicionales"]].map(([k, l]) => <button key={k} className={sub === k ? "on" : ""} onClick={() => setSub(k)}>{l}</button>)}</div>
    {sub === "plan" && <AvancePlan />}{sub === "viajes" && <ViajesGastos />}{sub === "diario" && <DiarioZona />}{sub === "gastos" && <GastosAdicionales />}
  </>;
}

/* ======================================== AVANCE DEL PLAN ======================================== */
function Barra({ nombre, valor, marca, derecha, color = "var(--lil)" }: { nombre: string; valor: number; marca?: number; derecha: ReactNode; color?: string }) {
  return <div style={{ marginBottom: 12 }}><div className="fila entre"><span>{nombre}</span><b>{derecha}</b></div>
    <div className="bar" style={{ height: 10, position: "relative" }}><i style={{ width: Math.min(100, Math.max(0, valor * 100)) + "%", background: color }} />{marca !== undefined && <span style={{ position: "absolute", left: Math.min(99.5, marca * 100) + "%", top: -3, height: 16, borderLeft: "2px solid var(--ink)" }} />}</div></div>;
}

function useAvance(zona: any) {
  const cli = useQuery(() => supabase.from("clientes").select("id", { count: "exact", head: true }).eq("zona_id", zona.id).neq("estado", "BAJA").then((r: any) => ({ data: r.count ?? 0, error: r.error })), [zona.id]);
  const dia = useQuery(() => supabase.from("diario_zona").select("clientes_instalados").eq("zona_id", zona.id), [zona.id]);
  const vj = useQuery(() => supabase.from("viajes").select("*").eq("zona_id", zona.id).neq("estado", "CANCELADO"), [zona.id]);
  const ids = ((vj.data as any[]) || []).map(v => v.id);
  const per = useQuery(() => ids.length ? supabase.from("viaje_personal").select("*").in("viaje_id", ids) : nada, [vj.data]);
  const gas = useQuery(() => ids.length ? supabase.from("viaje_dias").select("viaje_id, gasto").in("viaje_id", ids) : nada, [vj.data]);
  const pre = useQuery(() => supabase.from("presupuesto_lineas").select("categoria, cantidad, monto_unitario").eq("zona_id", zona.id).eq("tipo", "INVERSION"), [zona.id]);
  return { cli, dia, vj, per, gas, pre, cargando: [cli, dia, vj, per, gas, pre].some(q => q.loading) };
}

function AvanceZona({ zona }: { zona: any }) {
  const a = useAvance(zona);
  if (a.cargando) return <Cargando />;
  const V: any[] = (a.vj.data as any[]) || [], P: any[] = (a.per.data as any[]) || [], G: any[] = (a.gas.data as any[]) || [], L: any[] = (a.pre.data as any[]) || [];
  const meta = n(zona.meta_clientes), plazo = n(zona.meta_meses);
  const clientes = n(a.cli.data) + ((a.dia.data as any[]) || []).reduce((s, x) => s + n(x.clientes_instalados), 0);
  const meses = zona.fecha_inicio ? Math.max(0, (+new Date(hoy() + "T12:00:00") - +new Date(String(zona.fecha_inicio) + "T12:00:00")) / 86400000 / 30.44) : 0;
  const esperado = meta && plazo ? meta * Math.min(1, meses / plazo) : 0, ratio = esperado > 0 ? clientes / esperado : 1;
  const estado = ratio >= 1.05 ? ["Adelantado", "ok"] : ratio >= 0.95 ? ["En ritmo", "ok"] : ratio >= 0.8 ? ["Leve atraso", "warn"] : ["Atrasado", "bad"];
  const lineaV = L.filter(x => x.categoria === "Viajes de instalación"), planif = lineaV.reduce((s, x) => s + n(x.cantidad), 0) || V.length, presViajes = lineaV.reduce((s, x) => s + n(x.cantidad) * n(x.monto_unitario), 0);
  const fin = V.filter(v => v.estado === "FINALIZADO"), costoReal = fin.reduce((s, v) => s + costoViaje(v, P.filter(p => p.viaje_id === v.id), G.filter(g => g.viaje_id === v.id)).total, 0);
  const ritmo = meses > 0 ? clientes / meses : 0, falta = Math.max(0, meta - clientes), mesesFalta = ritmo > 0 ? Math.ceil(falta / ritmo) : null;
  if (!meta && !plazo) return <Aviso>Esta zona no tiene meta de clientes ni plazo. Se definen al crear la zona.</Aviso>;
  return <div className="card"><div className="fila entre"><h2>Zona {zona.nombre}</h2><span className={"pill " + estado[1]}>{estado[0]}</span></div>
    <Barra nombre="Clientes (marca = esperado hoy)" valor={meta ? clientes / meta : 0} marca={meta ? esperado / meta : undefined} derecha={`${clientes} de ${meta}${esperado ? ` · esperado ${Math.round(esperado)}` : ""}`} />
    <Barra nombre="Tiempo transcurrido" valor={plazo ? meses / plazo : 0} color="#5c6078" derecha={`${meses.toFixed(1)} de ${plazo} meses`} />
    <Barra nombre="Viajes realizados" valor={planif ? fin.length / planif : 0} color="var(--acc)" derecha={`${fin.length} de ${planif} planificados`} />
    <Barra nombre="Costo de viajes" valor={presViajes ? costoReal / presViajes : 0} color="var(--ok)" derecha={`${bs(costoReal)} de ${bs(presViajes)}`} />
    <p className="mute" style={{ margin: "6px 0 0" }}>{falta <= 0 ? "¡Meta de clientes alcanzada!" : mesesFalta && mesesFalta > 60 ? `A este ritmo (${ritmo.toFixed(1)} clientes por mes) la meta tardaría más de 5 años: conviene reforzar las instalaciones.` : mesesFalta ? `A este ritmo (${ritmo.toFixed(1)} clientes por mes) llegas a la meta en ${mesesFalta} mes(es), aprox. ${mesAprox(mesesFalta)}.` : "Todavía no hay ritmo para calcular cuándo llegarás a la meta."}</p></div>;
}

function AvancePlan() {
  const { zonas, zonaId } = useApp(), zona = zonas.find(z => z.id === zonaId);
  if (!zona) return <Aviso>Elige una <b>zona</b> arriba para ver su avance.</Aviso>;
  return <><PresupuestoBarras zona={zona} /><AvanceZona zona={zona} /></>;
}

/* ======================================== VIAJES Y GASTOS ======================================== */
function ViajesGastos() {
  const { zonas, zonaId, proyectoId } = useApp(), al = useAlcance(), zona = zonas.find(z => z.id === zonaId);
  const q = useQuery(() => al(supabase.from("viajes").select("*, zonas(nombre)").order("fecha_inicio", { ascending: false }).limit(500)), [proyectoId, zonaId]);
  const ids = ((q.data as any[]) || []).map(v => v.id);
  const per = useQuery(() => ids.length ? supabase.from("viaje_personal").select("*").in("viaje_id", ids) : nada, [q.data]);
  const gas = useQuery(() => ids.length ? supabase.from("viaje_dias").select("viaje_id, gasto").in("viaje_id", ids) : nada, [q.data]);
  const [pg, setPg] = useState(false), [det, setDet] = useState<any>(null);
  const V: any[] = (q.data as any[]) || [], P: any[] = (per.data as any[]) || [], G: any[] = (gas.data as any[]) || [];
  const costo = (v: any) => costoViaje(v, P.filter(p => p.viaje_id === v.id), G.filter(g => g.viaje_id === v.id)).total;
  const recargar = () => { q.recargar(); per.recargar(); gas.recargar(); };
  if (det) return <ViajeSeguimiento v={V.find(x => x.id === det.id) || det} onVolver={() => { setDet(null); recargar(); }} />;
  return <>
    <div className="card tw"><div className="fila entre"><h2>Viajes y su estado</h2><button className="btn" disabled={!zona} title={zona ? "" : "Elige una zona arriba"} onClick={() => setPg(true)}>+ Programar viaje</button></div>
      {q.loading ? <Cargando /> : V.length ? <table><thead><tr><th>Fechas</th>{!zona && <th>Zona</th>}<th>Trabajo</th><th>Personal</th><th>Costo</th><th>Estado</th><th /></tr></thead>
        <tbody>{V.map(v => <tr key={v.id}><td>{v.fecha_inicio} → {v.fecha_fin}</td>{!zona && <td>{v.zonas?.nombre}</td>}<td>{v.detalle ? v.tipo + " · " + v.detalle : v.tipo || "—"}</td><td>{v.personal || "—"}</td><td><b>{bs(costo(v))}</b></td><td><Estado e={v.estado === "FINALIZADO" ? "FINALIZADO" : v.estado} /></td><td><button className="btn suave" onClick={() => setDet(v)}>Seguimiento</button></td></tr>)}</tbody></table> : <Vacio>Aún no hay viajes.</Vacio>}</div>
    {pg && zona && <FormViaje zona={zona} onClose={() => setPg(false)} onListo={() => { setPg(false); recargar(); }} />}
  </>;
}

function FormViaje({ zona, onClose, onListo }: { zona: any; onClose: () => void; onListo: () => void }) {
  const inst = useQuery(() => supabase.from("instaladores").select("nombre, pago_dia").eq("zona_id", zona.id).eq("activo", true).order("nombre"), [zona.id]);
  const [f, setF] = useState({ fecha_inicio: hoy(), fecha_fin: hoy(), tipo: "Instalaciones", detalle: "", gasolina: "0", movilidad: "0", viaticos_dia: "50", otro: "", otro_pago: "150" }), [sel, setSel] = useState<Record<string, string>>({}), [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false);
  const I: any[] = (inst.data as any[]) || [], dias = f.fecha_fin >= f.fecha_inicio ? diasEntre(f.fecha_inicio, f.fecha_fin).length : 0;
  const personal = [...I.filter(x => x.nombre in sel).map(x => ({ nombre: x.nombre, pago: n(sel[x.nombre]) })), ...(f.otro.trim() ? [{ nombre: f.otro.trim(), pago: n(f.otro_pago) }] : [])];
  const estimado = n(f.gasolina) + n(f.movilidad) + dias * personal.reduce((s, p) => s + p.pago + n(f.viaticos_dia), 0);
  const guardar = async () => {
    setMsg(""); if (f.fecha_fin < f.fecha_inicio) return setMsg("La fecha de regreso no puede ser antes de la salida."); if (f.fecha_inicio < zona.fecha_inicio) return setMsg("La zona inicia el " + zona.fecha_inicio + ": no se pueden programar viajes antes."); if (!personal.length) return setMsg("Elige al menos una persona del personal.");
    setOcup(true);
    try {
      const pagoProm = personal.reduce((s, p) => s + p.pago, 0) / personal.length;
      const { data, error } = await supabase.from("viajes").insert({ proyecto_id: zona.proyecto_id, zona_id: zona.id, fecha_inicio: f.fecha_inicio, fecha_fin: f.fecha_fin, tipo: f.tipo, detalle: f.detalle || null, personal: personal.map(p => p.nombre).join(", "), personas: personal.length, gasolina: n(f.gasolina), movilidad: n(f.movilidad), pago_dia: pagoProm, viaticos_dia: n(f.viaticos_dia), estimado }).select("id").single();
      if (error) throw new Error(error.message);
      const r = await supabase.from("viaje_personal").insert(personal.map(p => ({ proyecto_id: zona.proyecto_id, viaje_id: (data as any).id, nombre: p.nombre, pago_dia: p.pago, dias_trabajados: dias }))); if (r.error) throw new Error(r.error.message);
      onListo();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  return <Drawer titulo={"Programar viaje · zona " + zona.nombre} ancho={520} onClose={onClose}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    <div className="form" style={{ gridTemplateColumns: "1fr" }}>
      <Campo l="Sale el día"><input type="date" value={f.fecha_inicio} onChange={e => setF({ ...f, fecha_inicio: e.target.value })} /></Campo><Campo l="Regresa el día"><input type="date" value={f.fecha_fin} onChange={e => setF({ ...f, fecha_fin: e.target.value })} /></Campo>
      <Campo l="Trabajo del viaje"><select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>{["Instalaciones", "Mantenimiento", "Bajas", "Mixto", "Otro"].map(o => <option key={o}>{o}</option>)}</select></Campo>
      {f.tipo === "Otro" && <Campo l="Detalle (ej. hablar con el dirigente para evaluar la zona)"><input value={f.detalle} onChange={e => setF({ ...f, detalle: e.target.value })} /></Campo>}</div>
    <h3>Personal y pago por día</h3>{I.length ? I.map(x => <div key={x.nombre} className="fila" style={{ padding: "3px 0" }}><label className="fila" style={{ flex: 1 }}><input type="checkbox" checked={x.nombre in sel} onChange={e => setSel(e.target.checked ? { ...sel, [x.nombre]: String(x.pago_dia || 0) } : Object.fromEntries(Object.entries(sel).filter(([k]) => k !== x.nombre)))} /> {x.nombre}</label>
      {x.nombre in sel && <span className="fila" style={{ gap: 4 }}><input type="number" min={0} style={{ width: 90 }} value={sel[x.nombre]} onChange={e => setSel({ ...sel, [x.nombre]: e.target.value })} /> Bs/día</span>}</div>) : <p className="mute">Aún no hay instaladores en esta zona. Agrégalos en la pestaña Instaladores, o escribe un nombre abajo.</p>}
    <div className="fila" style={{ marginTop: 6 }}><input placeholder="Otra persona (nombre)" value={f.otro} onChange={e => setF({ ...f, otro: e.target.value })} style={{ flex: 1 }} /><input type="number" min={0} style={{ width: 90 }} value={f.otro_pago} onChange={e => setF({ ...f, otro_pago: e.target.value })} /> Bs/día</div>
    <div className="form" style={{ gridTemplateColumns: "1fr", marginTop: 8 }}><Campo l="Viáticos por persona y día (Bs)"><input type="number" min={0} value={f.viaticos_dia} onChange={e => setF({ ...f, viaticos_dia: e.target.value })} /></Campo><Campo l="Gasolina (Bs)"><input type="number" min={0} value={f.gasolina} onChange={e => setF({ ...f, gasolina: e.target.value })} /></Campo><Campo l="Movilidad (Bs)"><input type="number" min={0} value={f.movilidad} onChange={e => setF({ ...f, movilidad: e.target.value })} /></Campo></div>
    <p>Estimado del viaje ({dias} día{dias === 1 ? "" : "s"}, {personal.length} persona{personal.length === 1 ? "" : "s"}): <b>{bs(estimado)}</b></p>
    <button className="btn" style={{ width: "100%" }} disabled={ocup} onClick={guardar}>{ocup ? "Programando…" : "Programar viaje"}</button></Drawer>;
}

function ViajeSeguimiento({ v, onVolver }: { v: any; onVolver: () => void }) {
  const ds = diasEntre(v.fecha_inicio, v.fecha_fin), cerrado = CERRADOS.includes(v.estado);
  const per = useQuery(() => supabase.from("viaje_personal").select("*").eq("viaje_id", v.id).order("nombre"), [v.id]);
  const vd = useQuery(() => supabase.from("viaje_dias").select("*").eq("viaje_id", v.id).order("fecha"), [v.id]);
  const ins = useQuery(() => supabase.from("v_instalaciones_lista").select("fecha, cliente_nombre").eq("zona_id", v.zona_id).gte("fecha", v.fecha_inicio).lte("fecha", v.fecha_fin), [v.id]);
  const baj = useQuery(() => supabase.from("v_bajas_lista").select("fecha, cliente_nombre").eq("zona_id", v.zona_id).gte("fecha", v.fecha_inicio).lte("fecha", v.fecha_fin), [v.id]);
  const man = useQuery(() => supabase.from("mantenimientos").select("referencia, objeto, problema, fecha_cierre").eq("zona_id", v.zona_id).eq("estado", "COMPLETADA").gte("fecha_cierre", v.fecha_inicio).lte("fecha_cierre", v.fecha_fin), [v.id]);
  const dia = useQuery(() => supabase.from("diario_zona").select("fecha, avance, clientes_instalados, metros_fibra").eq("zona_id", v.zona_id).gte("fecha", v.fecha_inicio).lte("fecha", v.fecha_fin), [v.id]);
  const [est, setEst] = useState(v.estado), [nota, setNota] = useState(""), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [nuevo, setNuevo] = useState({ fecha: v.fecha_inicio, actividad: "" }), [estado, setEstado] = useState(v.estado);
  const P: any[] = (per.data as any[]) || [], D: any[] = (vd.data as any[]) || [], I: any[] = (ins.data as any[]) || [], B: any[] = (baj.data as any[]) || [], M: any[] = (man.data as any[]) || [], DZ: any[] = (dia.data as any[]) || [];
  const c = costoViaje(v, P, D), est0 = estimadoViaje(v), dif = c.total - est0, imprevistos = D.filter(x => n(x.gasto) > 0);
  const nombres = (v.personal || "").split(",").map((x: string) => x.trim()).filter(Boolean);
  const cambiarEstado = async () => {
    setMsg(""); setOk(""); const { error } = await supabase.from("viajes").update({ estado: est, nota_estado: nota || null }).eq("id", v.id);
    if (error) return setMsg(error.message); setEstado(est); setNota(""); setOk(est === "FINALIZADO" ? "Viaje finalizado: su costo pasó a gastos operativos (Transporte)." : "Estado cambiado.");
  };
  const diasPersona = async (p: any, valor: number) => { const { error } = await supabase.from("viaje_personal").update({ dias_trabajados: Math.max(0, Math.min(ds.length, Math.round(valor))) }).eq("id", p.id); if (error) setMsg(error.message); else per.recargar(); };
  const habilitar = async () => { const { error } = await supabase.from("viaje_personal").insert(nombres.map((nm: string) => ({ proyecto_id: v.proyecto_id, viaje_id: v.id, nombre: nm, pago_dia: n(v.pago_dia), dias_trabajados: ds.length }))); if (error) setMsg(error.message); else per.recargar(); };
  const anotar = async () => { if (!nuevo.actividad.trim()) return; const { error } = await supabase.from("viaje_dias").insert({ viaje_id: v.id, proyecto_id: v.proyecto_id, fecha: nuevo.fecha, actividad: nuevo.actividad.trim(), gasto: 0 }); if (error) setMsg(error.message); else { setNuevo({ ...nuevo, actividad: "" }); vd.recargar(); } };
  const personasDia = (i: number) => (P.length ? P.filter(p => n(p.dias_trabajados) > i).length : n(v.personas));

  return <div className="card"><div className="fila entre"><h2 style={{ margin: 0 }}>Viaje {v.fecha_inicio} → {v.fecha_fin} · <Estado e={estado} /></h2><span className="mute">Instalaciones {I.length} · Mantenimientos {M.length} · Bajas {B.length}</span></div>
    <div className="grid gk" style={{ margin: "12px 0" }}><Kpi t="Estimado al programar" v={bs(est0)} /><Kpi t="Costo total del viaje" v={bs(c.total)} /><Kpi t="Diferencia" v={bs(dif)} c={dif <= 0 ? "var(--ok)" : "var(--bad)"} /></div>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="fila" style={{ marginBottom: 10 }}><select value={est} onChange={e => setEst(e.target.value)}>{ESTADOS_VIAJE.map(o => <option key={o}>{o}</option>)}</select><input placeholder="Nota del cambio de estado" value={nota} onChange={e => setNota(e.target.value)} style={{ flex: 1, minWidth: 180 }} /><button className="btn" disabled={est === estado && !nota} onClick={cambiarEstado}>Cambiar estado</button></div>
    {v.nota_estado && <p className="mute" style={{ margin: "0 0 8px" }}>Última nota: {v.nota_estado}</p>}
    {cerrado && <Aviso>Viaje cerrado: solo lectura, con su resumen. Cambia el estado para volver a editarlo.</Aviso>}
    <h3>Personal y salida anticipada</h3>
    {P.length ? P.map(p => <div key={p.id} className="fila" style={{ padding: "2px 0" }}><b>{p.nombre}</b> <span className="mute">trabajó</span> {cerrado ? <b>{p.dias_trabajados}</b> : <input type="number" min={0} max={ds.length} style={{ width: 64 }} defaultValue={p.dias_trabajados} key={p.id + p.dias_trabajados} onBlur={e => n(e.target.value) !== n(p.dias_trabajados) && diasPersona(p, n(e.target.value))} />} <span className="mute">de {ds.length} días</span></div>)
      : nombres.length ? <>{nombres.map((nm: string) => <div key={nm} style={{ padding: "2px 0" }}><b>{nm}</b> <span className="mute">trabajó {ds.length} de {ds.length} días</span></div>)}{!cerrado && <button className="btn suave chico" style={{ marginTop: 6 }} onClick={habilitar}>Registrar salidas anticipadas</button>}</> : <p className="mute">Sin personal anotado.</p>}
    {!cerrado && P.length > 0 && <p className="mute" style={{ margin: "4px 0 0" }}>Si alguien se fue antes, baja sus días y el costo se recalcula solo.</p>}
    <h3>Avance día por día</h3><p className="mute" style={{ margin: "0 0 6px" }}>Instalaciones, mantenimientos, bajas y avances de la zona en estas fechas se anotan solos. También puedes agregar a mano.</p>
    {ds.map((d, i) => { const manual = D.filter(x => x.fecha === d && x.actividad), auto = [...I.filter(x => x.fecha === d).map(x => ["Instalación", x.cliente_nombre]), ...B.filter(x => x.fecha === d).map(x => ["Baja", x.cliente_nombre]), ...M.filter(x => x.fecha_cierre === d).map(x => ["Mantenimiento", `${x.referencia || x.objeto}: ${x.problema}`]), ...DZ.filter(x => x.fecha === d).map(x => ["Avance", `${x.avance || "Avance del día"}${n(x.clientes_instalados) ? ` · ${x.clientes_instalados} clientes` : ""}${n(x.metros_fibra) ? ` · ${x.metros_fibra} m de fibra` : ""}`])];
      return <div key={d} style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}><div className="fila entre"><b>{d}</b><small className="mute">{personasDia(i)} persona(s)</small></div>
        {!auto.length && !manual.length && <small className="mute">Sin actividad anotada</small>}{auto.map((a, k) => <div key={k}><span className="tag">{a[0]}</span> {a[1]} <small className="mute">automático</small></div>)}{manual.map(x => <div key={x.id}>{x.actividad} <small className="mute">manual</small></div>)}</div>; })}
    {!cerrado && <div className="fila" style={{ marginTop: 8 }}><select value={nuevo.fecha} onChange={e => setNuevo({ ...nuevo, fecha: e.target.value })}>{ds.map(d => <option key={d}>{d}</option>)}</select><input placeholder="Qué se hizo" value={nuevo.actividad} onChange={e => setNuevo({ ...nuevo, actividad: e.target.value })} style={{ flex: 1, minWidth: 180 }} /><button className="btn suave" onClick={anotar}>Anotar</button></div>}
    <h3>Gastos imprevistos día por día</h3><p className="mute" style={{ margin: "0 0 6px" }}>Aparte de la gasolina, movilidad, pago y viáticos fijos que se registran al programar el viaje. Se agregan en la pestaña Gastos adicionales.</p>
    {imprevistos.length ? imprevistos.map(x => <div key={x.id} style={{ padding: "2px 0" }}><small className="mute">{x.fecha}</small> · {x.concepto_gasto || "Gasto"} · <b>{bs(x.gasto)}</b>{x.comprobante_path && " 📎"}</div>) : <p className="mute">Sin gastos imprevistos anotados.</p>}
    <p style={{ marginTop: 12 }}>Costo del viaje: <b>{bs(c.total)}</b> = gasolina {bs(c.gasolina)} + movilidad {bs(c.movilidad)} + personal {bs(c.personal)} + gastos imprevistos {bs(c.imprevistos)}. Al finalizar pasa a gastos operativos (Transporte).</p>
    <button className="btn suave" onClick={onVolver}>← Volver a los viajes</button></div>;
}

/* ======================================== DIARIO DE LA ZONA ======================================== */
function DiarioZona() {
  const { zonas, zonaId } = useApp(), zona = zonas.find(z => z.id === zonaId);
  const q = useQuery(() => zonaId ? supabase.from("diario_zona").select("*").eq("zona_id", zonaId).order("fecha", { ascending: false }).order("creado_en", { ascending: false }).limit(300) : nada, [zonaId]);
  const cli = useQuery(() => zonaId ? supabase.from("clientes").select("id", { count: "exact", head: true }).eq("zona_id", zonaId).neq("estado", "BAJA").then((r: any) => ({ data: r.count ?? 0, error: r.error })) : nada, [zonaId]);
  const vacio = { fecha: hoy(), clientes: "0", metros: "0", personal: "", avance: "" }, [f, setF] = useState(vacio), [msg, setMsg] = useState(""), [ok, setOk] = useState("");
  const L: any[] = (q.data as any[]) || [];
  if (!zona) return <Aviso>Elige una <b>zona</b> arriba para llevar su diario de avance.</Aviso>;
  const meta = n(zona.meta_clientes), llevas = n(cli.data) + L.reduce((s, x) => s + n(x.clientes_instalados), 0);
  const guardar = async () => {
    setMsg(""); setOk(""); if (!f.avance.trim() && !(n(f.clientes) > 0) && !(n(f.metros) > 0)) return setMsg("Anota al menos qué se avanzó, los clientes instalados o los metros de fibra.");
    const { error } = await supabase.from("diario_zona").insert({ proyecto_id: zona.proyecto_id, zona_id: zona.id, fecha: f.fecha, clientes_instalados: Math.round(n(f.clientes)), metros_fibra: n(f.metros), personal: f.personal || null, avance: f.avance || null });
    if (error) setMsg(error.message); else { setF(vacio); setOk("Avance anotado."); q.recargar(); }
  };
  const quitar = async (x: any) => { if (!confirm("¿Mandar este avance a la papelera? Podrás recuperarlo desde Configuración → Papelera.")) return; try { await aPapelera("diario_zona", [x.id]); q.recargar(); } catch (e: any) { setMsg(e.message); } };
  return <div className="grid g2" style={{ alignItems: "start" }}>
    <div className="card"><h2>Diario de avance · zona {zona.nombre}</h2>{meta > 0 && <p className="mute" style={{ marginTop: 0 }}>Meta: {meta} clientes · llevas {llevas} ({Math.round((llevas / meta) * 100)}%)</p>}{msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
      <div className="form" style={{ gridTemplateColumns: "1fr" }}>
        <Campo l="Fecha"><input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></Campo>
        <Campo l="Clientes instalados ese día"><input type="number" min={0} value={f.clientes} onChange={e => setF({ ...f, clientes: e.target.value })} /></Campo>
        <Campo l="Metros de fibra tendidos"><input type="number" min={0} value={f.metros} onChange={e => setF({ ...f, metros: e.target.value })} /></Campo>
        <Campo l="Personal que trabajó"><input value={f.personal} onChange={e => setF({ ...f, personal: e.target.value })} /></Campo>
        <Campo l="Qué se avanzó hoy"><input value={f.avance} onChange={e => setF({ ...f, avance: e.target.value })} /></Campo></div>
      <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={guardar}>Anotar avance del día</button>
      <p className="mute" style={{ margin: "8px 0 0" }}>Los clientes instalados suman al avance de la meta. Anota aquí solo los que no registraste en Instalaciones, para no contarlos dos veces.</p></div>
    <div className="card"><h2>Avance día a día</h2>{q.loading ? <Cargando /> : L.length ? L.map(x => <div key={x.id} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}><div className="fila entre"><b>{x.fecha}</b><button className="btn suave chico" onClick={() => quitar(x)}>Quitar</button></div>
      <div>{x.avance || "Avance del día"}</div><small className="mute">{n(x.clientes_instalados) ? `${x.clientes_instalados} cliente(s) instalado(s)` : ""}{n(x.clientes_instalados) && n(x.metros_fibra) ? " · " : ""}{n(x.metros_fibra) ? `${x.metros_fibra} m de fibra` : ""}{x.personal ? ` · ${x.personal}` : ""}</small></div>) : <Vacio>Aún no hay avances anotados en esta zona.</Vacio>}</div>
  </div>;
}

/* ======================================== GASTOS ADICIONALES ======================================== */
const CONCEPTOS = ["Combustible", "Peajes", "Alimentación", "Alojamiento", "Repuestos o materiales", "Transporte extra", "Otro"];
function GastosAdicionales() {
  const { zonas, zonaId, proyectoId } = useApp(), al = useAlcance(), zona = zonas.find(z => z.id === zonaId);
  const viajes = useQuery(() => al(supabase.from("viajes").select("id, fecha_inicio, fecha_fin, tipo, estado, proyecto_id, zona_id").order("fecha_inicio", { ascending: false }).limit(300)), [proyectoId, zonaId]);
  const ids = ((viajes.data as any[]) || []).map(v => v.id);
  const gastos = useQuery(() => ids.length ? supabase.from("viaje_dias").select("*").in("viaje_id", ids).gt("gasto", 0).order("fecha", { ascending: false }) : nada, [viajes.data]);
  const vacio = { viaje: "", fecha: "", concepto: CONCEPTOS[0], otro: "", monto: "", nota: "" }, [f, setF] = useState(vacio), [arch, setArch] = useState<File | null>(null), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false);
  const V: any[] = (viajes.data as any[]) || [], abiertos = V.filter(v => !CERRADOS.includes(v.estado)), G: any[] = (gastos.data as any[]) || [], v = V.find(x => x.id === f.viaje);
  const dias = v ? diasEntre(v.fecha_inicio, v.fecha_fin) : [], total = G.reduce((s, x) => s + n(x.gasto), 0);
  const ver = async (ruta: string) => { const u = await urlArchivo("comprobantes", ruta); if (u) window.open(u, "_blank"); else setMsg("No se pudo abrir el comprobante."); };
  const guardar = async () => {
    setMsg(""); setOk(""); if (!v) return setMsg("Elige el viaje."); if (!(n(f.monto) > 0)) return setMsg("Escribe el monto."); if (f.concepto === "Otro" && !f.otro.trim()) return setMsg("Escribe en qué fue el gasto.");
    const fecha = f.fecha && dias.includes(f.fecha) ? f.fecha : dias[0]; setOcup(true);
    try {
      const ruta = arch ? await subirArchivo("comprobantes", v.proyecto_id, arch) : null;
      const { error } = await supabase.from("viaje_dias").insert({ viaje_id: v.id, proyecto_id: v.proyecto_id, fecha, actividad: null, concepto_gasto: (f.concepto === "Otro" ? f.otro.trim() : f.concepto) + (f.nota ? " · " + f.nota : ""), gasto: n(f.monto), comprobante_path: ruta });
      if (error) throw new Error(error.message);
      setOk("Gasto adicional registrado: se suma al costo del viaje."); setF({ ...vacio, viaje: f.viaje }); setArch(null); gastos.recargar();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  const viajeDe = (id: string) => V.find(x => x.id === id);
  return <div className="grid g2" style={{ alignItems: "start" }}>
    <div className="card"><h2>Registrar gasto adicional del viaje</h2>{msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
      <p className="mute" style={{ marginTop: 0 }}>Para los gastos que no estaban previstos al programar el viaje: combustible extra, peajes, comida, repuestos… Se suman al costo del viaje.</p>
      <div className="form" style={{ gridTemplateColumns: "1fr" }}>
        <Campo l="Viaje"><select value={f.viaje} onChange={e => setF({ ...f, viaje: e.target.value, fecha: "" })}><option value="">Elige un viaje abierto…</option>{abiertos.map(x => <option key={x.id} value={x.id}>{x.fecha_inicio} → {x.fecha_fin} · {x.tipo} · {x.estado.toLowerCase()}</option>)}</select></Campo>
        {v && <Campo l="Día del gasto"><select value={f.fecha || dias[0]} onChange={e => setF({ ...f, fecha: e.target.value })}>{dias.map(d => <option key={d}>{d}</option>)}</select></Campo>}
        <Campo l="Concepto"><select value={f.concepto} onChange={e => setF({ ...f, concepto: e.target.value })}>{CONCEPTOS.map(c => <option key={c}>{c}</option>)}</select></Campo>
        {f.concepto === "Otro" && <Campo l="¿En qué fue?"><input value={f.otro} onChange={e => setF({ ...f, otro: e.target.value })} /></Campo>}
        <Campo l="Monto (Bs)"><input type="number" min={0} step={0.01} value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} /></Campo>
        <Campo l="Nota (opcional)"><input value={f.nota} onChange={e => setF({ ...f, nota: e.target.value })} /></Campo>
        <Campo l="Comprobante (si hay)"><input type="file" key={String(ok)} onChange={e => setArch(e.target.files?.[0] || null)} /></Campo></div>
      <button className="btn" style={{ width: "100%", marginTop: 8 }} disabled={ocup || !zona && !V.length} onClick={guardar}>{ocup ? "Guardando…" : "Registrar gasto adicional"}</button>
      {!abiertos.length && !viajes.loading && <p className="mute">No hay viajes abiertos. Los gastos se agregan a viajes programados, en ejecución o pausados.</p>}</div>
    <div className="card tw"><div className="fila entre"><h2>Gastos adicionales</h2><b>{bs(total)}</b></div>{gastos.loading ? <Cargando /> : G.length ? <table style={{ minWidth: 0 }}><thead><tr><th>Fecha</th><th>Viaje</th><th>Concepto</th><th>Monto</th><th /></tr></thead>
      <tbody>{G.map(x => { const vj = viajeDe(x.viaje_id); return <tr key={x.id}><td style={{ whiteSpace: "nowrap" }}>{x.fecha}</td><td>{vj ? `${vj.fecha_inicio} → ${vj.fecha_fin}` : "—"}<br /><small className="mute">{vj?.tipo}</small></td><td>{x.concepto_gasto || "—"}</td><td><b>{bs(x.gasto)}</b></td><td>{x.comprobante_path && <button className="btn suave chico" onClick={() => ver(x.comprobante_path)}>Ver</button>}</td></tr>; })}</tbody></table> : <Vacio>Aún no hay gastos adicionales registrados.</Vacio>}</div>
  </div>;
}
