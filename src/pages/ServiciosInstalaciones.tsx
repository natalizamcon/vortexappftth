import { useEffect, useState } from "react";
import { supabase, subirArchivo, urlArchivo } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Vacio, bs, hoy, useAlcance, useQuery } from "../lib/ui";
import { Drawer } from "../lib/drawer";
import { LectorFoto } from "../lib/LectorFoto";
import { BotonGPS } from "../lib/BotonGPS";
import { EscanerFormulario } from "../lib/EscanerFormulario";
import { aNumero, coincidir, norm } from "../lib/coincidir";
import type { Accion } from "./Servicios";

const n = (x: any) => Number(x) || 0;
const F0 = { nombre: "", ci: "", telefono: "", ref_nombre: "", ref_tel: "", direccion: "", gps: "", plan_id: "", nap_id: "", puerto: "", equipo_id: "", equipo: "", serie: "", mac: "", ip: "", potencia: "", usuario_tecnico: "", clave_tecnica: "", tecnico: "", fecha: hoy(), precio_instalacion: "0", costo_materiales: "", mano_obra: "", observaciones: "" };

export function Instalaciones({ accion }: { accion: Accion }) {
  const { zonas, zonaId, proyectoId } = useApp(), al = useAlcance(), zona = zonas.find(z => z.id === zonaId);
  const lista = useQuery(() => al(supabase.from("v_instalaciones_lista").select("*").order("fecha", { ascending: false }).order("codigo", { ascending: false }).limit(1000)), [proyectoId, zonaId]);
  const [abrir, setAbrir] = useState(false), [orden, setOrden] = useState<any>(null), [foto, setFoto] = useState<File | null>(null);
  useEffect(() => { if (accion?.nueva || accion?.orden) { setOrden(accion.orden || null); setFoto(accion.archivo || null); setAbrir(true); } }, [accion?.ts]);
  const L: any[] = (lista.data as any[]) || [];
  return <>
    <div className="fila" style={{ marginBottom: 10 }}>{zona ? <label className="btn mor" style={{ cursor: "pointer" }}>📷 Escanear hoja de instalación<input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) { setOrden(null); setFoto(f); setAbrir(true); } e.target.value = ""; }} /></label> : <button className="btn mor" disabled title="Elige una zona arriba">📷 Escanear hoja de instalación</button>}<button className="btn" disabled={!zona} onClick={() => { setOrden(null); setFoto(null); setAbrir(true); }} title={zona ? "" : "Elige una zona arriba"}>+ Nueva instalación (a mano)</button>{!zona && <span className="mute">Elige una zona arriba para registrar una instalación.</span>}</div>
    <div className="card tw">{lista.loading ? <Cargando /> : lista.error ? <Aviso tipo="mal">{lista.error}</Aviso> : L.length ? <table><thead><tr><th>Código</th><th>Cliente</th><th>C.I.</th><th>NAP / puerto</th><th>Técnico</th><th>Fecha</th><th>Formulario</th></tr></thead>
      <tbody>{L.map(x => <tr key={x.id}><td>{x.codigo}</td><td><b>{x.cliente_nombre || "—"}</b></td><td>{x.cliente_ci || "—"}</td><td>{x.nap_codigo ? `${x.nap_codigo} / ${x.puerto_numero ?? "—"}` : "—"}</td><td>{x.tecnico || "—"}</td><td>{x.fecha}</td><td>{x.formulario_path ? <button className="btn suave chico" onClick={async () => { const u = await urlArchivo("fotos", x.formulario_path); if (u) window.open(u, "_blank"); }}>Ver formulario</button> : "—"}</td></tr>)}</tbody></table> : <Vacio>Aún no hay instalaciones registradas.</Vacio>}</div>
    {abrir && zona && <FormInstalacion zona={zona} orden={orden} archivoInicial={foto} onClose={() => setAbrir(false)} onListo={() => { setAbrir(false); lista.recargar(); }} />}
  </>;
}

function FormInstalacion({ zona, orden, archivoInicial, onClose, onListo }: { zona: any; orden: any; archivoInicial?: File | null; onClose: () => void; onListo: () => void }) {
  const [f, setF] = useState<any>({ ...F0, nombre: orden && !orden.cliente_id ? orden.referencia || "" : "", tecnico: orden?.tecnico || "" }), [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false), [otroPuerto, setOtroPuerto] = useState(false), [otroTec, setOtroTec] = useState(false), [formFile, setFormFile] = useState<File | null>(null), [avisos, setAvisos] = useState<string[]>([]);
  const planes = useQuery(() => supabase.from("planes").select("*").eq("zona_id", zona.id).eq("activo", true).order("precio"), [zona.id]);
  const naps = useQuery(() => supabase.from("naps").select("id, codigo, tipo").eq("zona_id", zona.id).order("codigo"), [zona.id]);
  const libres = useQuery(() => f.nap_id ? supabase.from("puertos").select("numero").eq("nap_id", f.nap_id).eq("estado", "LIBRE").order("numero") : Promise.resolve({ data: [], error: null }), [f.nap_id]);
  const equipos = useQuery(() => supabase.from("equipos_serie").select("id, serie, modelo, mac").eq("proyecto_id", zona.proyecto_id).eq("estado", "ALMACEN").order("modelo"), [zona.proyecto_id]);
  const tecnicos = useQuery(() => supabase.from("instaladores").select("nombre").eq("zona_id", zona.id).eq("activo", true).order("nombre"), [zona.id]);
  const L: any[] = (libres.data as any[]) || [], pedido = f.puerto && L.some(p => String(p.numero) === String(f.puerto)) ? String(f.puerto) : "", puerto = pedido || (L[0] ? String(L[0].numero) : "");
  /** Llena todo el formulario con lo que la IA leyó de la hoja escrita a mano, y marca la ubicación del celular. */
  const aplicarHoja = ({ datos: d, ubicacion, archivo }: { datos: any; ubicacion: { lat: number; lng: number } | null; archivo: File }) => {
    const antes = f, antesTec = otroTec, av: string[] = [], P: any[] = (planes.data as any[]) || [], N: any[] = (naps.data as any[]) || [], EQ: any[] = (equipos.data as any[]) || [], TE: any[] = (tecnicos.data as any[]) || [];
    const mbps = aNumero(d.mbps), plan = coincidir(d.plan, P, p => [p.nombre, `${p.nombre}${p.mbps}`]) || (mbps != null ? P.find(p => Number(p.mbps) === mbps) : undefined);
    if ((d.plan || mbps != null) && !plan) av.push(`No encontré el plan "${d.plan || mbps + " Mbps"}" entre los de esta zona: elígelo a mano.`);
    const nap = coincidir(d.nap, N, x => x.codigo); if (d.nap && !nap) av.push(`La NAP "${d.nap}" no existe en esta zona: elígela a mano.`);
    const e0 = (d.equipos || [])[0], eq = e0?.serie ? EQ.find(x => norm(x.serie) === norm(e0.serie)) : undefined; if (e0?.serie && !eq) av.push(`El equipo con serie ${e0.serie} no está en el almacén: se anotó a mano; revisa que sea correcto.`);
    const tec = d.tecnico ? coincidir(d.tecnico, TE, x => x.nombre) : undefined, pot = aNumero(d.potencia_onu_dbm), pn = aNumero(d.potencia_nap_dbm), vel = aNumero(d.velocidad_mbps), pi = aNumero(d.precio_instalacion), puertoLeido = aNumero(d.puerto);
    const mats = (d.materiales || []).filter((m: any) => m.material).map((m: any) => `${m.material}${m.cantidad != null ? " " + m.cantidad : ""}${m.unidad ? " " + m.unidad : ""}`).join("; ");
    const obs = [d.observaciones, mats && "Materiales usados: " + mats, vel != null && "Velocidad medida: " + vel + " Mbps", pn != null && "Potencia en la NAP: " + pn + " dBm"].filter(Boolean).join(" · ");
    setOtroTec(!!d.tecnico && !tec);
    setF((x: any) => ({ ...x, nombre: d.nombre || x.nombre, ci: d.ci || x.ci, telefono: d.telefono || x.telefono, ref_nombre: d.referencia_nombre || x.ref_nombre, ref_tel: d.referencia_telefono || x.ref_tel, direccion: d.direccion || x.direccion, gps: ubicacion ? `${ubicacion.lat}, ${ubicacion.lng}` : x.gps,
      plan_id: plan?.id || x.plan_id, nap_id: nap?.id || x.nap_id, puerto: nap ? (puertoLeido != null ? String(puertoLeido) : "") : x.puerto, equipo_id: eq?.id || "", equipo: eq ? eq.modelo || "" : e0?.modelo || x.equipo, serie: eq ? eq.serie : e0?.serie || x.serie, mac: eq ? eq.mac || "" : e0?.mac || x.mac,
      potencia: pot != null ? String(pot) : x.potencia, fecha: d.fecha || x.fecha, tecnico: tec ? tec.nombre : d.tecnico || x.tecnico, precio_instalacion: pi != null ? String(pi) : x.precio_instalacion, observaciones: obs || x.observaciones }));
    setFormFile(archivo); setAvisos(ubicacion ? av : [...av, "No se pudo marcar la ubicación: usa el botón 📍 Usar mi ubicación cuando estés en la casa del cliente."]);
    return () => { setF(antes); setOtroTec(antesTec); setAvisos([]); };
  };
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));
  const T = (l: string, k: string, t = "text", ph?: string) => <Campo l={l}><input type={t} placeholder={ph} value={f[k]} onChange={e => set(k, e.target.value)} /></Campo>;
  const elegirEquipo = (id: string) => { const e = ((equipos.data as any[]) || []).find(x => x.id === id); setF((x: any) => ({ ...x, equipo_id: id, equipo: e ? e.modelo || "" : x.equipo, serie: e ? e.serie || "" : x.serie, mac: e ? e.mac || "" : x.mac })); };

  const guardar = async () => {
    setMsg("");
    if (!f.nombre.trim() || !f.plan_id || !f.nap_id || !puerto) return setMsg("Faltan datos: nombre, plan, NAP y un puerto libre.");
    let lat: any = "", lng: any = ""; if (f.gps.trim()) { const p = f.gps.split(/[,;\s]+/).filter(Boolean); if (p.length !== 2 || isNaN(+p[0]) || isNaN(+p[1])) return setMsg("Las coordenadas deben verse así: -17.39, -66.15"); [lat, lng] = p; }
    setOcup(true);
    try {
      let rutaHoja: string | null = null; if (formFile) { try { rutaHoja = await subirArchivo("fotos", zona.proyecto_id, formFile); } catch { /* la instalación igual se guarda */ } }
      const { data, error } = await supabase.rpc("crear_cliente_instalacion", { p: { ...f, lat, lng, puerto, zona_id: zona.id } }); if (error) throw new Error(error.message);
      const id = data as any;
      if (rutaHoja) await supabase.from("instalaciones").update({ formulario_path: rutaHoja }).eq("cliente_id", id);
      if (f.equipo_id) await supabase.from("equipos_serie").update({ estado: "INSTALADO", cliente_id: id }).eq("id", f.equipo_id);
      if (f.costo_materiales !== "" || f.mano_obra !== "") await supabase.from("instalaciones").update({ costo_materiales: n(f.costo_materiales), mano_obra: n(f.mano_obra) }).eq("cliente_id", id);
      if (orden) await supabase.from("ordenes_trabajo").update({ estado: "COMPLETADA", cerrado_en: new Date().toISOString(), resultado_id: id, cliente_id: id }).eq("id", orden.id);
      onListo();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };

  return <Drawer titulo={"Nueva instalación · zona " + zona.nombre} ancho={520} onClose={onClose}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    <EscanerFormulario tipo="formulario_instalacion" titulo="Hoja de instalación llena a mano" archivoInicial={archivoInicial} onArchivo={setFormFile} onUbicacion={u => setF((x: any) => ({ ...x, gps: x.gps || `${u.lat}, ${u.lng}` }))} onUsar={aplicarHoja} />
    {avisos.map((a, i) => <Aviso key={i}>{a}</Aviso>)}
    <h3 style={{ marginTop: 0 }}>Cliente nuevo</h3>
    <LectorFoto tipo="carnet" titulo="Leer el carnet con foto" onUsar={d => setF((x: any) => ({ ...x, nombre: d.nombre || x.nombre, ci: d.ci ? String(d.ci) + (d.extension ? " " + d.extension : "") : x.ci }))} />
    <div className="form" style={{ gridTemplateColumns: "1fr" }}>{T("Nombre completo *", "nombre")}{T("Carnet de identidad (C.I.)", "ci")}{T("Teléfono principal", "telefono", "tel")}{T("Nombre de la referencia", "ref_nombre")}{T("Número de la referencia", "ref_tel", "tel")}{T("Ubicación exacta", "direccion")}{T("Coordenadas GPS", "gps", "text", "-17.39, -66.15")}<div><BotonGPS onPunto={t => set("gps", t)} /></div></div>
    <h3>Servicio y equipo</h3>
    <div className="form" style={{ gridTemplateColumns: "1fr" }}>
      <Campo l="Plan *"><select value={f.plan_id} onChange={e => set("plan_id", e.target.value)}><option value="">Elige…</option>{((planes.data as any[]) || []).map(p => <option key={p.id} value={p.id}>{p.nombre} · {p.mbps} Mbps · {bs(p.precio)}</option>)}</select></Campo>
      <Campo l="NAP *"><select value={f.nap_id} onChange={e => setF((x: any) => ({ ...x, nap_id: e.target.value, puerto: "" }))}><option value="">Elige…</option>{((naps.data as any[]) || []).map(x => <option key={x.id} value={x.id}>{x.codigo}</option>)}</select></Campo>
      {f.nap_id && <p style={{ margin: 0 }}>{L.length ? <>{f.puerto && !pedido && <><span style={{ color: "var(--warn)" }}>El puerto {f.puerto} del formulario no está libre. </span></>}Puerto asignado: <b>{puerto}</b> {L.length > 1 && <a style={{ cursor: "pointer" }} onClick={() => setOtroPuerto(!otroPuerto)}>· elegir otro</a>}</> : <span style={{ color: "var(--bad)" }}>Esta NAP no tiene puertos libres. Elige otra NAP.</span>}</p>}
      {otroPuerto && L.length > 1 && <select value={puerto} onChange={e => set("puerto", e.target.value)}>{L.map(p => <option key={p.numero}>{p.numero}</option>)}</select>}
      <Campo l="Equipo"><select value={f.equipo_id} onChange={e => elegirEquipo(e.target.value)}><option value="">Otro (lo escribo abajo)</option>{((equipos.data as any[]) || []).map(x => <option key={x.id} value={x.id}>{x.modelo || "Equipo"} · {x.serie}</option>)}</select></Campo>
      <LectorFoto tipo="etiqueta_equipo" titulo="Leer la etiqueta del equipo con foto" onUsar={d => setF((x: any) => ({ ...x, serie: d.serie || x.serie, mac: d.mac || x.mac, equipo: x.equipo_id ? x.equipo : d.modelo || x.equipo }))} />
      {!f.equipo_id && T("Modelo del equipo", "equipo")}{T("Número de serie", "serie")}{T("MAC", "mac")}{T("IP", "ip")}<LectorFoto tipo="potencia" titulo="Leer la potencia con foto del medidor" onUsar={d => d.potencia_dbm !== null && d.potencia_dbm !== undefined && set("potencia", String(d.potencia_dbm))} />{T("Potencia óptica", "potencia")}{T("Usuario técnico", "usuario_tecnico")}{T("Contraseña técnica", "clave_tecnica")}
      <Campo l="Técnico">{otroTec || !((tecnicos.data as any[]) || []).length ? <input value={f.tecnico} onChange={e => set("tecnico", e.target.value)} placeholder="Nombre del técnico" /> : <select value={f.tecnico} onChange={e => e.target.value === "__otro" ? (setOtroTec(true), set("tecnico", "")) : set("tecnico", e.target.value)}><option value="">Elige…</option>{((tecnicos.data as any[]) || []).map(x => <option key={x.nombre}>{x.nombre}</option>)}<option value="__otro">Otro (escribir)</option></select>}</Campo>
      {T("Fecha de instalación", "fecha", "date")}{T("Precio de instalación (Bs)", "precio_instalacion", "number")}{T("Costo de materiales (Bs, opcional)", "costo_materiales", "number")}{T("Mano de obra (Bs, opcional)", "mano_obra", "number")}{T("Observaciones", "observaciones")}</div>
    <p className="mute">El primer mes se cobra proporcional a los días reales hasta el corte de la zona.</p>
    <button className="btn" style={{ width: "100%" }} disabled={ocup} onClick={guardar}>{ocup ? "Guardando…" : "Registrar instalación"}</button></Drawer>;
}
