import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Estado, Modal, Vacio, bs, hoy, useAlcance, useQuery } from "../lib/ui";
import { Drawer } from "../lib/drawer";
import { todas } from "../lib/datos";
import { comportamiento } from "../lib/pagos";
import { FormPago } from "./ClientesPagos";
import { PanelHistorial } from "./ClientesCobranzas";

const cr = (x: any) => (Array.isArray(x) ? x[0] : x) || {};
const F0 = { nombre: "", ci: "", telefono: "", ref_nombre: "", ref_tel: "", direccion: "", lat: "", lng: "", plan_id: "", nap_id: "", puerto: "", fecha: hoy(), precio_instalacion: "0", equipo: "", serie: "", mac: "", ip: "", potencia: "", usuario_tecnico: "", clave_tecnica: "", tecnico: "", observaciones: "" };
const aDatos = (p: Promise<any[]>) => p.then(data => ({ data, error: null })).catch(e => ({ data: [] as any[], error: { message: e.message } }));
const Pill = ({ c }: { c: { texto: string; clase: string } }) => <span className={"pill " + c.clase}>{c.texto}</span>;

export function ListaClientes({ filtroInicial }: { filtroInicial?: string }) {
  const { zonaId, proyectoId, puede } = useApp(), al = useAlcance(), dep = [proyectoId, zonaId], verCobranza = puede("cobranzas", "ver");
  const [q, setQ] = useState(() => { const v = sessionStorage.getItem("vx_q") || ""; sessionStorage.removeItem("vx_q"); return v; }), [fe, setFe] = useState(filtroInicial || ""), [nuevo, setNuevo] = useState(false), [baja, setBaja] = useState<any>(null), [ficha, setFicha] = useState<any>(null), [pago, setPago] = useState<any>(null), [hist, setHist] = useState<any>(null);
  const lista = useQuery(() => al(supabase.from("clientes").select("*, zonas(nombre), naps(codigo), puertos!clientes_puerto_id_fkey(numero), clientes_credenciales(*)").order("estado").order("nombre").limit(1000)), dep);
  const cob = useQuery(() => aDatos(todas(() => al(supabase.from("v_cobranza").select("*").order("cliente_id")))), dep);
  const comp = useQuery(() => aDatos(todas(() => al(supabase.from("v_comportamiento").select("*").order("cliente_id")))), dep);
  const inst = useQuery(() => aDatos(todas(() => al(supabase.from("instalaciones").select("cliente_id, tecnico, fecha").order("fecha", { ascending: false })))), dep);
  const K: any[] = (cob.data as any[]) || [], B: any[] = (comp.data as any[]) || [], I: any[] = (inst.data as any[]) || [];
  const cuenta = (id: string) => K.find(x => x.cliente_id === id), compDe = (c: any) => comportamiento(B.find(x => x.cliente_id === c.id), c.problematico), tecnico = (id: string) => I.find(x => x.cliente_id === id)?.tecnico;
  const todos: any[] = ((lista.data as any[]) || []);
  const filas = todos.filter(c => (!fe || c.estado === fe) && (c.nombre + " " + c.codigo + " " + (c.ci || "")).toLowerCase().includes(q.toLowerCase()));
  const puntuales = todos.filter(c => c.estado !== "BAJA" && compDe(c).texto === "Puntual").slice(0, 6);
  const problem = todos.filter(c => c.estado !== "BAJA" && ["Conflictivo", "Mal pagador", "Irregular"].includes(compDe(c).texto)).sort((a, b) => compDe(a).orden - compDe(b).orden).slice(0, 6);
  const recargar = () => { lista.recargar(); cob.recargar(); comp.recargar(); };
  const estadoPill = (c: any) => verCobranza && cuenta(c.id) ? <Estado e={cuenta(c.id).estado_cuenta} /> : <Estado e={c.estado} />;

  return <>
    <div className="grid g2" style={{ marginBottom: 14 }}>
      <div className="card" style={{ margin: 0 }}><h2>Siempre pagan puntual</h2>{puntuales.length ? puntuales.map(c => <div key={c.id} className="fila entre" style={{ padding: "3px 0" }}><span>{c.nombre}</span><Pill c={{ texto: "Puntual", clase: "ok" }} /></div>) : <p className="mute">Todavía no hay clientes con historial puntual.</p>}</div>
      <div className="card" style={{ margin: 0 }}><h2>Más problemáticos</h2>{problem.length ? problem.map(c => { const k = compDe(c); return <div key={c.id} className="fila entre" style={{ padding: "3px 0" }}><span>{c.nombre}</span><Pill c={k} /></div>; }) : <p className="mute">Ninguno</p>}</div></div>
    <div className="fila entre" style={{ marginBottom: 10 }}><div className="fila" style={{ flex: 1 }}><input placeholder="Buscar por nombre, apellido, código o carnet" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 220 }} /><select value={fe} onChange={e => setFe(e.target.value)}><option value="">Todos los estados</option><option value="ACTIVO">Activos</option><option value="SUSPENDIDO">Suspendidos</option><option value="BAJA">Dados de baja</option></select></div>
      <button className="btn" onClick={() => setNuevo(true)} disabled={!zonaId} title={zonaId ? "" : "Elige una zona arriba"}>+ Nueva instalación</button></div>
    {!zonaId && <Aviso>Para registrar una instalación elige primero una zona arriba.</Aviso>}
    <div className="card tw"><h2>Base de datos de clientes <small className="mute" style={{ fontWeight: 400 }}>({filas.length}) · toca un cliente para ver su ficha</small></h2>{lista.loading ? <Cargando /> : lista.error ? <Aviso tipo="mal">{lista.error}</Aviso> : filas.length ? <table><thead><tr>{["Código", "Nombre", "C.I.", "Teléfono", "Referencia", "Zona", "NAP / Puerto", "Plan", "Mensualidad", "Ubicación", "GPS", "Equipo", "Serie", "MAC", "IP", "Potencia", "Usuario técnico", "Contraseña", "Técnico", "Instalación", "Estado", "Comportamiento"].map(h => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{filas.map(c => { const k = cr(c.clientes_credenciales); const d = "—"; return <tr key={c.id} className="click" style={c.estado === "BAJA" ? { opacity: 0.6 } : undefined} onClick={() => setFicha(c)}>
        <td>{c.codigo}</td><td><b>{c.nombre}</b></td><td>{c.ci || d}</td><td>{c.telefono || d}</td><td>{c.referencia_nombre ? c.referencia_nombre + (c.referencia_tel ? " · " + c.referencia_tel : "") : d}</td><td>{c.zonas?.nombre}</td><td>{c.naps?.codigo ? `${c.naps.codigo} / ${c.puertos?.numero ?? "—"}` : d}</td><td>{c.plan_nombre} {c.mbps} Mbps</td><td>{bs(c.precio_mensual)}</td>
        <td>{c.direccion || d}</td><td>{c.lat != null && c.lng != null ? `${c.lat}, ${c.lng}` : d}</td><td>{k.equipo || d}</td><td>{k.serie || d}</td><td>{k.mac || d}</td><td>{k.ip || d}</td><td>{k.potencia || d}</td><td>{k.usuario_tecnico || d}</td><td>{k.clave_tecnica || d}</td><td>{tecnico(c.id) || d}</td><td>{c.fecha_instalacion || d}</td>
        <td>{estadoPill(c)}</td><td><Pill c={compDe(c)} /></td></tr>; })}</tbody></table> : <Vacio>Aún no hay clientes. Registra la primera instalación.</Vacio>}</div>

    {ficha && <Ficha c={ficha} cuenta={cuenta(ficha.id)} comp={B.find(x => x.cliente_id === ficha.id)} tecnico={tecnico(ficha.id)} verCobranza={verCobranza} onClose={() => setFicha(null)} onCambio={recargar}
      onPago={() => { const x = cuenta(ficha.id); if (x) { setPago(x); setFicha(null); } }} onHist={() => { const x = cuenta(ficha.id); if (x) { setHist(x); setFicha(null); } }} onBaja={() => { setBaja(ficha); setFicha(null); }} />}
    {pago && <Drawer titulo={"Registrar pago · " + pago.nombre} ancho={520} onClose={() => setPago(null)}><FormPago clientes={K} clienteId={pago.cliente_id} onListo={recargar} /></Drawer>}
    {hist && <PanelHistorial c={hist} onClose={() => setHist(null)} onCambio={recargar} />}
    {nuevo && <Instalacion onClose={() => setNuevo(false)} onListo={() => { setNuevo(false); recargar(); }} />}
    {baja && <Baja cliente={baja} onClose={() => setBaja(null)} onListo={() => { setBaja(null); recargar(); }} />}
  </>;
}

function Dato({ l, v }: { l: string; v: any }) { return <><dt>{l}</dt><dd>{v === null || v === undefined || v === "" ? "—" : v}</dd></>; }

function Ficha({ c, cuenta, comp, tecnico, verCobranza, onClose, onCambio, onPago, onHist, onBaja }: any) {
  const [conf, setConf] = useState(!!c.problematico), [nota, setNota] = useState(c.motivo_problematico || ""), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false);
  const k = cr(c.clientes_credenciales), cc = comportamiento(comp, conf);
  const guardar = async () => {
    setMsg(""); setOk(""); if (conf && !nota.trim()) return setMsg("Escribe por qué es un usuario conflictivo.");
    setOcup(true); const { error } = await supabase.from("clientes").update({ problematico: conf, motivo_problematico: conf ? nota.trim() : null }).eq("id", c.id); setOcup(false);
    if (error) setMsg(error.message); else { setOk(conf ? "Marcado como usuario conflictivo." : "Ya no está marcado como conflictivo."); onCambio(); }
  };
  return <Drawer titulo={c.nombre} ancho={500} onClose={onClose}>
    <div className="fila" style={{ marginBottom: 8 }}><span className="mute">{c.codigo}</span>{verCobranza && cuenta ? <Estado e={cuenta.estado_cuenta} /> : <Estado e={c.estado} />}<Pill c={cc} /></div>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="card" style={{ margin: "0 0 10px", borderColor: conf ? "var(--bad)" : undefined }}><label className="fila"><input type="checkbox" checked={conf} onChange={e => setConf(e.target.checked)} /> <b>Usuario conflictivo</b></label>
      {conf && <input style={{ width: "100%", marginTop: 6 }} placeholder="¿Qué pasó? (reclama seguido, no paga, trato difícil…)" value={nota} onChange={e => setNota(e.target.value)} />}
      <div className="fila" style={{ marginTop: 6 }}><button className="btn chico" disabled={ocup || (conf === !!c.problematico && nota === (c.motivo_problematico || ""))} onClick={guardar}>Guardar</button><span className="mute">Los demás usuarios con acceso ven esta marca.</span></div></div>

    <h3 className="ficha-sec">Datos personales</h3><dl className="ficha"><Dato l="C.I." v={c.ci} /><Dato l="Teléfono" v={c.telefono} /><Dato l="Referencia" v={c.referencia_nombre ? c.referencia_nombre + (c.referencia_tel ? " · " + c.referencia_tel : "") : null} /><Dato l="Ubicación" v={c.direccion} />
      <Dato l="GPS" v={c.lat != null && c.lng != null ? <>{c.lat}, {c.lng} · <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noreferrer">Abrir en Google Maps</a></> : null} /><Dato l="Observaciones" v={c.observaciones} /></dl>
    <h3 className="ficha-sec">Servicio</h3><dl className="ficha"><Dato l="Zona" v={c.zonas?.nombre} /><Dato l="NAP / Puerto" v={c.naps?.codigo ? `${c.naps.codigo} / ${c.puertos?.numero ?? "—"}` : null} /><Dato l="Plan" v={`${c.plan_nombre || "—"} ${c.mbps || ""} Mbps`} /><Dato l="Mensualidad" v={bs(c.precio_mensual)} />
      <Dato l="Instalación" v={c.fecha_instalacion} /><Dato l="Precio de instalación" v={bs(c.precio_instalacion)} /><Dato l="Técnico" v={tecnico} />{c.fecha_baja && <Dato l="Fecha de baja" v={c.fecha_baja} />}</dl>
    <h3 className="ficha-sec">Equipo y datos técnicos</h3><dl className="ficha"><Dato l="Equipo" v={k.equipo} /><Dato l="Serie" v={k.serie} /><Dato l="MAC" v={k.mac} /><Dato l="IP" v={k.ip} /><Dato l="Potencia" v={k.potencia} /><Dato l="Usuario técnico" v={k.usuario_tecnico} /><Dato l="Contraseña" v={k.clave_tecnica} /></dl>
    {verCobranza && cuenta && <><h3 className="ficha-sec">Cuenta</h3><dl className="ficha"><Dato l="Debe" v={bs(cuenta.deuda) + (n0(cuenta.meses_deuda) ? ` (${cuenta.meses_deuda} mes${n0(cuenta.meses_deuda) === 1 ? "" : "es"})` : "")} /><Dato l="Último pago" v={cuenta.ultimo_pago} />
      <Dato l="Comportamiento" v={comp && n0(comp.cargos_vencidos) ? `${comp.a_tiempo} de ${comp.cargos_vencidos} meses pagados a tiempo${n0(comp.tarde) ? `, ${comp.tarde} tarde` : ""}${n0(comp.impagos) ? `, ${comp.impagos} sin pagar` : ""}` : "Aún sin meses vencidos"} />
      {c.no_cortar && <Dato l="No cortar" v={"Sí" + (c.no_cortar_hasta ? " hasta " + c.no_cortar_hasta : "") + (c.motivo_estado ? " · " + c.motivo_estado : "")} />}{c.estado === "SUSPENDIDO" && <Dato l="Suspendido por" v={c.motivo_estado} />}</dl></>}
    <div className="fila" style={{ marginTop: 14 }}>{verCobranza && cuenta && c.estado !== "BAJA" && <button className="btn" onClick={onPago}>Registrar pago</button>}{verCobranza && cuenta && <button className="btn suave" onClick={onHist}>Historial de pagos</button>}{c.estado !== "BAJA" && <button className="btn suave" onClick={onBaja}>Dar de baja</button>}</div>
  </Drawer>;
}
const n0 = (x: any) => Number(x) || 0;

function Instalacion({ onClose, onListo }: any) {
  const { zonaId } = useApp(), [f, setF] = useState<any>(F0), [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false);
  const planes = useQuery(() => supabase.from("planes").select("*").eq("zona_id", zonaId).eq("activo", true).order("precio"), [zonaId]);
  const naps = useQuery(() => supabase.from("naps").select("id,codigo,tipo").eq("zona_id", zonaId).order("codigo"), [zonaId]);
  const libres = useQuery(() => f.nap_id ? supabase.from("puertos").select("numero").eq("nap_id", f.nap_id).eq("estado", "LIBRE").order("numero") : Promise.resolve({ data: [], error: null }), [f.nap_id]);
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const T = (l: string, k: string, t = "text") => <Campo l={l}><input type={t} value={f[k]} onChange={e => set(k, e.target.value)} /></Campo>;
  const guardar = async () => {
    setMsg("");
    if (!f.nombre.trim() || !f.plan_id || !f.nap_id || !f.puerto) return setMsg("Faltan datos: nombre, plan, NAP y puerto.");
    setOcup(true);
    const { error } = await supabase.rpc("crear_cliente_instalacion", { p: { ...f, zona_id: zonaId } });
    setOcup(false); if (error) setMsg(error.message); else onListo();
  };
  return <Modal titulo="Nueva instalación" onClose={onClose} ancho={780}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    <h3>Cliente</h3><div className="form">{T("Nombre completo *", "nombre")}{T("Carnet de identidad", "ci")}{T("Teléfono principal", "telefono", "tel")}{T("Nombre de la referencia", "ref_nombre")}{T("Número de la referencia", "ref_tel", "tel")}{T("Ubicación exacta", "direccion")}{T("Latitud", "lat")}{T("Longitud", "lng")}</div>
    <h3>Servicio</h3><div className="form"><Campo l="Plan *"><select value={f.plan_id} onChange={e => set("plan_id", e.target.value)}><option value="">Elige…</option>{((planes.data as any[]) || []).map(p => <option key={p.id} value={p.id}>{p.nombre} · {p.mbps} Mbps · {bs(p.precio)}</option>)}</select></Campo>
      <Campo l="NAP *"><select value={f.nap_id} onChange={e => setF({ ...f, nap_id: e.target.value, puerto: "" })}><option value="">Elige…</option>{((naps.data as any[]) || []).map(n => <option key={n.id} value={n.id}>{n.codigo} ({n.tipo})</option>)}</select></Campo>
      <Campo l="Puerto libre *"><select value={f.puerto} onChange={e => set("puerto", e.target.value)}><option value="">{f.nap_id ? "Elige…" : "Primero elige la NAP"}</option>{((libres.data as any[]) || []).map(p => <option key={p.numero}>{p.numero}</option>)}</select></Campo>
      {T("Fecha de instalación", "fecha", "date")}{T("Precio de instalación (Bs)", "precio_instalacion", "number")}{T("Técnico", "tecnico")}</div>
    <h3>Equipo y datos técnicos</h3><div className="form">{T("Equipo (modelo)", "equipo")}{T("Número de serie", "serie")}{T("MAC", "mac")}{T("IP", "ip")}{T("Potencia óptica", "potencia")}{T("Usuario técnico", "usuario_tecnico")}{T("Contraseña técnica", "clave_tecnica")}{T("Observaciones", "observaciones")}</div>
    <p className="mute">El primer mes se cobra proporcional a los días reales hasta el corte de la zona.</p><button className="btn" disabled={ocup} onClick={guardar}>{ocup ? "Guardando…" : "Registrar instalación"}</button></Modal>;
}

function Baja({ cliente, onClose, onListo }: any) {
  const [f, setF] = useState({ fecha: hoy(), motivo: "", destino: "ALMACEN" }), [msg, setMsg] = useState("");
  const dar = async () => { const { error } = await supabase.rpc("dar_baja", { p_cliente: cliente.id, p_fecha: f.fecha, p_motivo: f.motivo, p_destino: f.destino }); if (error) setMsg(error.message); else onListo(); };
  return <Modal titulo={"Dar de baja a " + cliente.nombre} onClose={onClose}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    <Campo l="Fecha de la baja"><input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></Campo><Campo l="Motivo"><input value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })} /></Campo>
    <Campo l="Destino del equipo"><select value={f.destino} onChange={e => setF({ ...f, destino: e.target.value })}><option value="ALMACEN">Almacén (buen estado)</option><option value="MANTENIMIENTO">Mantenimiento</option><option value="DESCARTE">Descarte</option><option value="PENDIENTE">Aún no recuperado</option></select></Campo>
    <p className="mute">Se libera el puerto y el cliente queda al final de la lista, por si vuelve.</p><button className="btn rojo" disabled={!f.motivo.trim()} onClick={dar}>Confirmar baja</button></Modal>;
}
