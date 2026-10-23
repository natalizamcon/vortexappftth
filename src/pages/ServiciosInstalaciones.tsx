import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Vacio, bs, hoy, useAlcance, useQuery } from "../lib/ui";
import { Drawer } from "../lib/drawer";
import type { Accion } from "./Servicios";

const n = (x: any) => Number(x) || 0;
const F0 = { nombre: "", ci: "", telefono: "", ref_nombre: "", ref_tel: "", direccion: "", gps: "", plan_id: "", nap_id: "", puerto: "", equipo_id: "", equipo: "", serie: "", mac: "", ip: "", potencia: "", usuario_tecnico: "", clave_tecnica: "", tecnico: "", fecha: hoy(), precio_instalacion: "0", costo_materiales: "", mano_obra: "", observaciones: "" };

export function Instalaciones({ accion }: { accion: Accion }) {
  const { zonas, zonaId, proyectoId } = useApp(), al = useAlcance(), zona = zonas.find(z => z.id === zonaId);
  const lista = useQuery(() => al(supabase.from("v_instalaciones_lista").select("*").order("fecha", { ascending: false }).order("codigo", { ascending: false }).limit(1000)), [proyectoId, zonaId]);
  const [abrir, setAbrir] = useState(false), [orden, setOrden] = useState<any>(null);
  useEffect(() => { if (accion?.nueva || accion?.orden) { setOrden(accion.orden || null); setAbrir(true); } }, [accion?.ts]);
  const L: any[] = (lista.data as any[]) || [];
  return <>
    <div className="fila" style={{ marginBottom: 10 }}><button className="btn" disabled={!zona} onClick={() => { setOrden(null); setAbrir(true); }} title={zona ? "" : "Elige una zona arriba"}>+ Nueva instalación</button>{!zona && <span className="mute">Elige una zona arriba para registrar una instalación.</span>}</div>
    <div className="card tw">{lista.loading ? <Cargando /> : lista.error ? <Aviso tipo="mal">{lista.error}</Aviso> : L.length ? <table><thead><tr><th>Código</th><th>Cliente</th><th>C.I.</th><th>NAP / puerto</th><th>Técnico</th><th>Fecha</th></tr></thead>
      <tbody>{L.map(x => <tr key={x.id}><td>{x.codigo}</td><td><b>{x.cliente_nombre || "—"}</b></td><td>{x.cliente_ci || "—"}</td><td>{x.nap_codigo ? `${x.nap_codigo} / ${x.puerto_numero ?? "—"}` : "—"}</td><td>{x.tecnico || "—"}</td><td>{x.fecha}</td></tr>)}</tbody></table> : <Vacio>Aún no hay instalaciones registradas.</Vacio>}</div>
    {abrir && zona && <FormInstalacion zona={zona} orden={orden} onClose={() => setAbrir(false)} onListo={() => { setAbrir(false); lista.recargar(); }} />}
  </>;
}

function FormInstalacion({ zona, orden, onClose, onListo }: { zona: any; orden: any; onClose: () => void; onListo: () => void }) {
  const [f, setF] = useState<any>({ ...F0, nombre: orden && !orden.cliente_id ? orden.referencia || "" : "", tecnico: orden?.tecnico || "" }), [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false), [otroPuerto, setOtroPuerto] = useState(false), [otroTec, setOtroTec] = useState(false);
  const planes = useQuery(() => supabase.from("planes").select("*").eq("zona_id", zona.id).eq("activo", true).order("precio"), [zona.id]);
  const naps = useQuery(() => supabase.from("naps").select("id, codigo, tipo").eq("zona_id", zona.id).order("codigo"), [zona.id]);
  const libres = useQuery(() => f.nap_id ? supabase.from("puertos").select("numero").eq("nap_id", f.nap_id).eq("estado", "LIBRE").order("numero") : Promise.resolve({ data: [], error: null }), [f.nap_id]);
  const equipos = useQuery(() => supabase.from("equipos_serie").select("id, serie, modelo, mac").eq("proyecto_id", zona.proyecto_id).eq("estado", "ALMACEN").order("modelo"), [zona.proyecto_id]);
  const tecnicos = useQuery(() => supabase.from("instaladores").select("nombre").eq("zona_id", zona.id).eq("activo", true).order("nombre"), [zona.id]);
  const L: any[] = (libres.data as any[]) || [], puerto = f.puerto || (L[0] ? String(L[0].numero) : "");
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const T = (l: string, k: string, t = "text", ph?: string) => <Campo l={l}><input type={t} placeholder={ph} value={f[k]} onChange={e => set(k, e.target.value)} /></Campo>;
  const elegirEquipo = (id: string) => { const e = ((equipos.data as any[]) || []).find(x => x.id === id); setF((x: any) => ({ ...x, equipo_id: id, equipo: e ? e.modelo || "" : x.equipo, serie: e ? e.serie || "" : x.serie, mac: e ? e.mac || "" : x.mac })); };

  const guardar = async () => {
    setMsg("");
    if (!f.nombre.trim() || !f.plan_id || !f.nap_id || !puerto) return setMsg("Faltan datos: nombre, plan, NAP y un puerto libre.");
    let lat: any = "", lng: any = ""; if (f.gps.trim()) { const p = f.gps.split(/[,;\s]+/).filter(Boolean); if (p.length !== 2 || isNaN(+p[0]) || isNaN(+p[1])) return setMsg("Las coordenadas deben verse así: -17.39, -66.15"); [lat, lng] = p; }
    setOcup(true);
    try {
      const { data, error } = await supabase.rpc("crear_cliente_instalacion", { p: { ...f, lat, lng, puerto, zona_id: zona.id } }); if (error) throw new Error(error.message);
      const id = data as any;
      if (f.equipo_id) await supabase.from("equipos_serie").update({ estado: "INSTALADO", cliente_id: id }).eq("id", f.equipo_id);
      if (f.costo_materiales !== "" || f.mano_obra !== "") await supabase.from("instalaciones").update({ costo_materiales: n(f.costo_materiales), mano_obra: n(f.mano_obra) }).eq("cliente_id", id);
      if (orden) await supabase.from("ordenes_trabajo").update({ estado: "COMPLETADA", cerrado_en: new Date().toISOString(), resultado_id: id, cliente_id: id }).eq("id", orden.id);
      onListo();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };

  return <Drawer titulo={"Nueva instalación · zona " + zona.nombre} ancho={520} onClose={onClose}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    <h3 style={{ marginTop: 0 }}>Cliente nuevo</h3>
    <div className="form" style={{ gridTemplateColumns: "1fr" }}>{T("Nombre completo *", "nombre")}{T("Carnet de identidad (C.I.)", "ci")}{T("Teléfono principal", "telefono", "tel")}{T("Nombre de la referencia", "ref_nombre")}{T("Número de la referencia", "ref_tel", "tel")}{T("Ubicación exacta", "direccion")}{T("Coordenadas GPS", "gps", "text", "-17.39, -66.15")}</div>
    <h3>Servicio y equipo</h3>
    <div className="form" style={{ gridTemplateColumns: "1fr" }}>
      <Campo l="Plan *"><select value={f.plan_id} onChange={e => set("plan_id", e.target.value)}><option value="">Elige…</option>{((planes.data as any[]) || []).map(p => <option key={p.id} value={p.id}>{p.nombre} · {p.mbps} Mbps · {bs(p.precio)}</option>)}</select></Campo>
      <Campo l="NAP *"><select value={f.nap_id} onChange={e => setF((x: any) => ({ ...x, nap_id: e.target.value, puerto: "" }))}><option value="">Elige…</option>{((naps.data as any[]) || []).map(x => <option key={x.id} value={x.id}>{x.codigo}</option>)}</select></Campo>
      {f.nap_id && <p style={{ margin: 0 }}>{L.length ? <>Puerto asignado: <b>{puerto}</b> {L.length > 1 && <a style={{ cursor: "pointer" }} onClick={() => setOtroPuerto(!otroPuerto)}>· elegir otro</a>}</> : <span style={{ color: "var(--bad)" }}>Esta NAP no tiene puertos libres. Elige otra NAP.</span>}</p>}
      {otroPuerto && L.length > 1 && <select value={puerto} onChange={e => set("puerto", e.target.value)}>{L.map(p => <option key={p.numero}>{p.numero}</option>)}</select>}
      <Campo l="Equipo"><select value={f.equipo_id} onChange={e => elegirEquipo(e.target.value)}><option value="">Otro (lo escribo abajo)</option>{((equipos.data as any[]) || []).map(x => <option key={x.id} value={x.id}>{x.modelo || "Equipo"} · {x.serie}</option>)}</select></Campo>
      {!f.equipo_id && T("Modelo del equipo", "equipo")}{T("Número de serie", "serie")}{T("MAC", "mac")}{T("IP", "ip")}{T("Potencia óptica", "potencia")}{T("Usuario técnico", "usuario_tecnico")}{T("Contraseña técnica", "clave_tecnica")}
      <Campo l="Técnico">{otroTec || !((tecnicos.data as any[]) || []).length ? <input value={f.tecnico} onChange={e => set("tecnico", e.target.value)} placeholder="Nombre del técnico" /> : <select value={f.tecnico} onChange={e => e.target.value === "__otro" ? (setOtroTec(true), set("tecnico", "")) : set("tecnico", e.target.value)}><option value="">Elige…</option>{((tecnicos.data as any[]) || []).map(x => <option key={x.nombre}>{x.nombre}</option>)}<option value="__otro">Otro (escribir)</option></select>}</Campo>
      {T("Fecha de instalación", "fecha", "date")}{T("Precio de instalación (Bs)", "precio_instalacion", "number")}{T("Costo de materiales (Bs, opcional)", "costo_materiales", "number")}{T("Mano de obra (Bs, opcional)", "mano_obra", "number")}{T("Observaciones", "observaciones")}</div>
    <p className="mute">El primer mes se cobra proporcional a los días reales hasta el corte de la zona.</p>
    <button className="btn" style={{ width: "100%" }} disabled={ocup} onClick={guardar}>{ocup ? "Guardando…" : "Registrar instalación"}</button></Drawer>;
}
