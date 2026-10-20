import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Estado, Modal, Vacio, bs, hoy, useAlcance, useQuery } from "../lib/ui";

const cr = (x: any) => (Array.isArray(x) ? x[0] : x) || {};
const F0 = { nombre: "", ci: "", telefono: "", ref_nombre: "", ref_tel: "", direccion: "", lat: "", lng: "", plan_id: "", nap_id: "", puerto: "", fecha: hoy(), precio_instalacion: "0", equipo: "", serie: "", mac: "", ip: "", potencia: "", usuario_tecnico: "", clave_tecnica: "", tecnico: "", observaciones: "" };

export default function Clientes() {
  const { zonaId, proyectoId } = useApp(), al = useAlcance();
  const [q, setQ] = useState(""), [fe, setFe] = useState(""), [nuevo, setNuevo] = useState(false), [baja, setBaja] = useState<any>(null);
  const lista = useQuery(() => al(supabase.from("clientes").select("*, zonas(nombre), naps(codigo), puertos!clientes_puerto_id_fkey(numero), clientes_credenciales(*)").order("estado").order("nombre").limit(1000)), [proyectoId, zonaId]);
  const filas: any[] = ((lista.data as any[]) || []).filter(c => (!fe || c.estado === fe) && (c.nombre + " " + c.codigo + " " + (c.ci || "")).toLowerCase().includes(q.toLowerCase()));
  return <>
    <div className="fila entre"><h1>Clientes</h1><button className="btn" onClick={() => setNuevo(true)} disabled={!zonaId} title={zonaId ? "" : "Elige una zona arriba"}>+ Nueva instalación</button></div>
    {!zonaId && <Aviso>Para registrar una instalación elige primero una zona arriba.</Aviso>}
    <div className="fila" style={{ marginBottom: 10 }}><input placeholder="Buscar por nombre, apellido, código o carnet" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 220 }} /><select value={fe} onChange={e => setFe(e.target.value)}><option value="">Todos los estados</option><option value="ACTIVO">Activos</option><option value="SUSPENDIDO">Suspendidos</option><option value="BAJA">Dados de baja</option></select></div>
    <div className="card tw"><h2>Base de datos de clientes ({filas.length})</h2>{lista.loading ? <Cargando /> : lista.error ? <Aviso tipo="mal">{lista.error}</Aviso> : filas.length ? <table><thead><tr>{["Código", "Nombre", "C.I.", "Teléfono", "Referencia", "Zona", "NAP / puerto", "Plan", "Mensualidad", "Dirección", "Equipo", "Serie", "MAC", "IP", "Usuario", "Contraseña", "Instalación", "Estado", ""].map(h => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{filas.map(c => { const k = cr(c.clientes_credenciales); return <tr key={c.id} style={c.estado === "BAJA" ? { opacity: .6 } : undefined}><td>{c.codigo}</td><td><b>{c.nombre}</b>{c.problematico && <span className="tag e-SUSPENDIDO" style={{ marginLeft: 4 }}>Problemático</span>}</td><td>{c.ci || "—"}</td><td>{c.telefono || "—"}</td><td>{c.referencia_nombre ? c.referencia_nombre + " · " + (c.referencia_tel || "") : "—"}</td><td>{c.zonas?.nombre}</td><td>{c.naps?.codigo} / {c.puertos?.numero}</td><td>{c.plan_nombre} {c.mbps} Mbps</td><td>{bs(c.precio_mensual)}</td><td>{c.direccion || "—"}</td><td>{k.equipo || "—"}</td><td>{k.serie || "—"}</td><td>{k.mac || "—"}</td><td>{k.ip || "—"}</td><td>{k.usuario_tecnico || "—"}</td><td>{k.clave_tecnica || "—"}</td><td>{c.fecha_instalacion || "—"}</td><td><Estado e={c.estado} /></td>
        <td>{c.estado !== "BAJA" && <button className="btn suave chico" onClick={() => setBaja(c)}>Dar de baja</button>}</td></tr>; })}</tbody></table> : <Vacio>Aún no hay clientes. Registra la primera instalación.</Vacio>}</div>
    {nuevo && <Instalacion onClose={() => setNuevo(false)} onListo={() => { setNuevo(false); lista.recargar(); }} />}
    {baja && <Baja cliente={baja} onClose={() => setBaja(null)} onListo={() => { setBaja(null); lista.recargar(); }} />}
  </>;
}

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
