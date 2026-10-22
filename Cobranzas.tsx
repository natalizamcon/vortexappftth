import { useState } from "react";
import { supabase, subirArchivo, urlArchivo } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Estado, Modal, Tabs, Vacio, bs, hoy, nombreMes, useAlcance, useQuery } from "../lib/ui";

const ESTADOS = ["PAGADO", "POR VENCER", "VENCIDO", "SUSPENDIDO", "BAJA"];
const mesesAtras = (n: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 10); };

export default function Cobranzas() {
  const { proyectoId, zonaId } = useApp(), al = useAlcance();
  const [tab, setTab] = useState("lista"), [fe, setFe] = useState(""), [q, setQ] = useState(""), [modal, setModal] = useState<any>(null), [msg, setMsg] = useState("");
  const cob = useQuery(() => al(supabase.from("v_cobranza").select("*").order("nombre").limit(1000)), [proyectoId, zonaId]);
  const cargos = useQuery(() => tab === "meses" ? al(supabase.from("v_cargos").select("*").gte("periodo", mesesAtras(-5)).limit(5000)) : Promise.resolve({ data: [], error: null }), [tab, proyectoId, zonaId]);
  const filas: any[] = (cob.data as any[]) || [], vis = filas.filter(c => (!fe || c.estado_cuenta === fe) && (c.nombre + " " + c.codigo).toLowerCase().includes(q.toLowerCase()));
  const generar = async () => { setMsg(""); const { data, error } = await supabase.rpc("generar_cargos", { p_periodo: hoy() }); setMsg(error ? error.message : `Se generaron ${data} cargos del mes.`); cob.recargar(); };
  const MM = [-5, -4, -3, -2, -1, 0].map(mesesAtras);
  const celda = (c: any, m: string) => { const g = ((cargos.data as any[]) || []).find(x => x.cliente_id === c.cliente_id && x.periodo === m); if (!g) return <span className="mute">—</span>; return g.saldo <= 0 ? <span className="tag e-PAGADO">Pagó</span> : g.pagado > 0 ? <span className="tag e-POR_VENCER">Parcial {bs(g.pagado)}</span> : g.vence < hoy() ? <span className="tag e-VENCIDO">Debe</span> : <span className="tag e-POR_VENCER">Por vencer</span>; };
  const acciones = (c: any) => <div className="fila" style={{ gap: 4 }}>{c.estado_cuenta !== "BAJA" && <button className="btn chico" onClick={() => setModal({ t: "pago", c })}>Pago</button>}
    {c.estado_servicio === "SUSPENDIDO" ? <button className="btn chico mor" onClick={() => setModal({ t: "estado", c, accion: "RECONECTAR" })}>Reconectar</button> : c.estado_servicio === "ACTIVO" && <>
      {c.no_cortar ? <button className="btn suave chico" onClick={() => setModal({ t: "estado", c, accion: "QUITAR_NO_CORTAR" })}>Quitar no cortar</button> : <button className="btn suave chico" onClick={() => setModal({ t: "estado", c, accion: "NO_CORTAR" })}>No cortar</button>}
      <button className="btn suave chico" onClick={() => setModal({ t: "estado", c, accion: "SUSPENDER" })}>Suspender</button><button className="btn suave chico" onClick={() => setModal({ t: "estado", c, accion: "SUSPENDER", motivo: "Falta de pago" })}>Cortar por falta de pago</button></>}
    <button className="btn suave chico" onClick={() => setModal({ t: "hist", c })}>Historial</button></div>;
  const cortados = filas.filter(c => c.estado_servicio === "SUSPENDIDO");
  return <>
    <div className="fila entre"><h1>Cobranzas</h1><button className="btn suave" onClick={generar}>Generar cargos del mes</button></div>{msg && <Aviso>{msg}</Aviso>}
    <input placeholder="🔍 Buscar cliente por nombre o apellido" value={q} onChange={e => setQ(e.target.value)} style={{ width: "100%", fontSize: 15, padding: 10, marginBottom: 12 }} />
    <div className="card"><h2>Clientes por estado <small className="mute">(toca uno para filtrar)</small></h2><div className="fila">{ESTADOS.map(e => <button key={e} className={"tag e-" + e.replace(" ", "_")} style={{ border: fe === e ? "2px solid var(--ink)" : 0, cursor: "pointer", padding: "10px 16px", fontSize: 14 }} onClick={() => setFe(fe === e ? "" : e)}>{e} · {filas.filter(c => c.estado_cuenta === e).length}</button>)}</div></div>
    {cortados.length > 0 && <div className="card" style={{ border: "2px solid var(--bad)", background: "var(--badb)" }}><h2 style={{ color: "var(--bad)" }}>⚠ Cortados ({cortados.length}) · deuda {bs(cortados.reduce((s, c) => s + +c.deuda, 0))}</h2>{cortados.map(c => <div key={c.cliente_id} className="fila entre" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}><span><b>{c.nombre}</b> · debe {bs(c.deuda)} <span className="mute">{c.motivo_estado}</span></span>{acciones(c)}</div>)}</div>}
    <Tabs items={[["lista", "Clientes"], ["meses", "Pagos mes a mes"], ["pagos", "Registro de pagos"]]} valor={tab} onChange={setTab} />
    {tab === "lista" && <div className="card tw">{cob.loading ? <Cargando /> : cob.error ? <Aviso tipo="mal">{cob.error}</Aviso> : vis.length ? <table><thead><tr><th>Cliente</th><th>Plan</th><th>Mensualidad</th><th>Deuda</th><th>Estado</th><th>Último pago</th><th /></tr></thead><tbody>{vis.map(c => <tr key={c.cliente_id}><td><b>{c.nombre}</b><br /><small className="mute">{c.codigo}{c.no_cortar && " · No cortar" + (c.no_cortar_hasta ? " hasta " + c.no_cortar_hasta : "") + (c.motivo_estado ? ": " + c.motivo_estado : "")}</small></td><td>{c.plan_nombre}</td><td>{bs(c.precio_mensual)}</td><td><b>{bs(c.deuda)}</b>{c.meses_deuda > 0 && <small className="mute"> · {c.meses_deuda} mes(es)</small>}</td><td><Estado e={c.estado_cuenta} /></td><td>{c.ultimo_pago || "—"}</td><td>{acciones(c)}</td></tr>)}</tbody></table> : <Vacio>No hay clientes con estos filtros.</Vacio>}</div>}
    {tab === "meses" && <div className="card tw">{cargos.loading ? <Cargando /> : <table><thead><tr><th>Cliente</th>{MM.map(m => <th key={m}>{nombreMes(m)}</th>)}</tr></thead><tbody>{vis.map(c => <tr key={c.cliente_id}><td><b>{c.nombre}</b></td>{MM.map(m => <td key={m}>{celda(c, m)}</td>)}</tr>)}</tbody></table>}</div>}
    {tab === "pagos" && <RegistroPagos />}
    {modal?.t === "pago" && <Pago c={modal.c} onClose={() => setModal(null)} onListo={() => { setModal(null); cob.recargar(); }} />}
    {modal?.t === "estado" && <CambiarEstado m={modal} onClose={() => setModal(null)} onListo={() => { setModal(null); cob.recargar(); }} />}
    {modal?.t === "hist" && <Historial c={modal.c} onClose={() => setModal(null)} />}
  </>;
}

function Pago({ c, onClose, onListo }: any) {
  const [f, setF] = useState({ monto: "", medio: "Transferencia QR", periodo: mesesAtras(0), obs: "" }), [arch, setArch] = useState<File | null>(null), [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false);
  const guardar = async () => {
    setMsg(""); if (!(+f.monto > 0)) return setMsg("Escribe el monto."); if (!arch) return setMsg("Falta adjuntar el comprobante: es obligatorio para guardar el pago.");
    setOcup(true);
    try { const ruta = await subirArchivo("comprobantes", c.proyecto_id, arch); const { error } = await supabase.rpc("registrar_pago", { p_cliente: c.cliente_id, p_monto: +f.monto, p_medio: f.medio, p_periodo: f.periodo, p_comprobante: ruta, p_obs: f.obs || null }); if (error) throw new Error(error.message); onListo(); }
    catch (e: any) { setMsg(e.message); } setOcup(false);
  };
  return <Modal titulo={"Registrar pago · " + c.nombre} onClose={onClose}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    <p className="mute">Mensualidad {bs(c.precio_mensual)} · Deuda actual {bs(c.deuda)}. El pago se reparte solo entre los meses, de más antiguo a más nuevo desde el mes que elijas.</p>
    <div className="form"><Campo l="Monto (Bs)"><input type="number" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} /></Campo><Campo l="Medio de pago"><select value={f.medio} onChange={e => setF({ ...f, medio: e.target.value })}><option>Transferencia QR</option><option>Efectivo</option><option>Depósito</option></select></Campo>
      <Campo l="Pagar desde el mes"><select value={f.periodo} onChange={e => setF({ ...f, periodo: e.target.value })}>{[-3, -2, -1, 0, 1, 2].map(n => <option key={n} value={mesesAtras(n)}>{nombreMes(mesesAtras(n))}</option>)}</select></Campo>
      <Campo l="Comprobante (obligatorio)"><input type="file" accept="image/*,.pdf" onChange={e => setArch(e.target.files?.[0] || null)} /></Campo></div>
    <Campo l="Observaciones"><input value={f.obs} onChange={e => setF({ ...f, obs: e.target.value })} /></Campo><button className="btn" disabled={ocup} onClick={guardar}>{ocup ? "Guardando…" : "Guardar pago"}</button></Modal>;
}

function CambiarEstado({ m, onClose, onListo }: any) {
  const [mot, setMot] = useState(m.motivo || ""), [hasta, setHasta] = useState(""), [msg, setMsg] = useState("");
  const t: any = { NO_CORTAR: "No cortar", QUITAR_NO_CORTAR: "Quitar “no cortar”", SUSPENDER: "Suspender / cortar", RECONECTAR: "Reconectar" };
  const ir = async () => { const { error } = await supabase.rpc("cambiar_estado_cliente", { p_cliente: m.c.cliente_id, p_accion: m.accion, p_motivo: mot || null, p_hasta: hasta || null }); if (error) setMsg(error.message); else onListo(); };
  return <Modal titulo={t[m.accion] + " · " + m.c.nombre} onClose={onClose}>{msg && <Aviso tipo="mal">{msg}</Aviso>}<p className="mute">Acción manual: queda registrada con tu nombre y la fecha.</p>
    {m.accion !== "QUITAR_NO_CORTAR" && <Campo l="Razón"><input value={mot} onChange={e => setMot(e.target.value)} placeholder={m.accion === "NO_CORTAR" ? "Ej. paga el viernes" : "Razón"} /></Campo>}
    {m.accion === "NO_CORTAR" && <Campo l="Paga hasta"><input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></Campo>}<button className="btn" onClick={ir}>Confirmar</button></Modal>;
}

function Historial({ c, onClose }: any) {
  const p = useQuery(() => supabase.from("pagos").select("*").eq("cliente_id", c.cliente_id).order("fecha", { ascending: false }), [c.cliente_id]), [msg, setMsg] = useState("");
  const ver = async (ruta: string) => { const u = await urlArchivo("comprobantes", ruta); if (u) window.open(u, "_blank"); else setMsg("No se pudo abrir el comprobante."); };
  const anular = async (id: string) => { const motivo = prompt("Motivo de la anulación:"); if (!motivo) return; const { error } = await supabase.rpc("anular_pago", { p_pago: id, p_motivo: motivo }); if (error) setMsg(error.message); else p.recargar(); };
  return <Modal titulo={"Historial de pagos · " + c.nombre} onClose={onClose} ancho={720}>{msg && <Aviso tipo="mal">{msg}</Aviso>}{p.loading ? <Cargando /> : ((p.data as any[]) || []).length ? <div className="tw"><table><thead><tr><th>Fecha</th><th>Monto</th><th>Tipo</th><th>Desde</th><th>Comprobante</th><th /></tr></thead><tbody>{((p.data as any[]) || []).map(x => <tr key={x.id} style={x.anulado ? { opacity: .5 } : undefined}><td>{x.fecha}</td><td><b>{bs(x.monto)}</b></td><td>{x.anulado ? "ANULADO" : x.tipo}</td><td>{x.periodo_inicio?.slice(0, 7)}</td><td><button className="btn suave chico" onClick={() => ver(x.comprobante_path)}>Ver</button></td><td>{!x.anulado && <button className="btn suave chico" onClick={() => anular(x.id)}>Anular</button>}</td></tr>)}</tbody></table></div> : <Vacio>Este cliente aún no tiene pagos registrados.</Vacio>}</Modal>;
}

function RegistroPagos() {
  const { proyectoId } = useApp(), al = useAlcance(), p = useQuery(() => al(supabase.from("pagos").select("*, clientes(nombre, codigo, zona_id)").order("fecha", { ascending: false }).limit(300), false), [proyectoId]), [msg, setMsg] = useState("");
  const ver = async (ruta: string) => { const u = await urlArchivo("comprobantes", ruta); if (u) window.open(u, "_blank"); else setMsg("No se pudo abrir el comprobante."); };
  const filas: any[] = (p.data as any[]) || [];
  return <div className="card tw"><h2>Registro de pagos</h2>{msg && <Aviso tipo="mal">{msg}</Aviso>}{p.loading ? <Cargando /> : filas.length ? <><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Monto</th><th>Tipo</th><th>Comprobante</th></tr></thead><tbody>{filas.map(x => <tr key={x.id} style={x.anulado ? { opacity: .5 } : undefined}><td>{x.fecha}</td><td>{x.clientes?.nombre}<br /><small className="mute">{x.clientes?.codigo}</small></td><td><b>{bs(x.monto)}</b></td><td>{x.anulado ? "ANULADO" : x.tipo}</td><td><button className="btn suave chico" onClick={() => ver(x.comprobante_path)}>Ver comprobante</button></td></tr>)}</tbody></table><p>Total registrado: <b>{bs(filas.filter(x => !x.anulado).reduce((s, x) => s + +x.monto, 0))}</b></p></> : <Vacio>Aún no hay pagos registrados.</Vacio>}</div>;
}
