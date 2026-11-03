import { useEffect, useRef, useState } from "react";
import { TipoFoto, leerFoto } from "./ia";

export type Ubicacion = { lat: number; lng: number } | null;
/** Pide la ubicación del celular (o de la computadora). Devuelve null si no hay permiso o no hay señal. */
export const pedirUbicacion = (): Promise<Ubicacion> => new Promise(res => {
  if (!navigator.geolocation) return res(null);
  navigator.geolocation.getCurrentPosition(p => res({ lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6 }), () => res(null), { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
});

const ETIQ: Record<string, string> = { codigo: "Código", nombre: "Nombre", ci: "C.I.", direccion: "Dirección", telefono: "Teléfono", referencia_nombre: "Referencia", referencia_telefono: "Tel. de la referencia", plan: "Plan", mbps: "Mbps", precio_mensual: "Precio mensual", precio_instalacion: "Precio de instalación", nap: "NAP", puerto: "Puerto", potencia_nap_dbm: "Potencia NAP (dBm)", potencia_onu_dbm: "Potencia ONU (dBm)", velocidad_mbps: "Velocidad (Mbps)", observaciones: "Observaciones", fecha: "Fecha", tecnico: "Técnico", motivo: "Motivo", destino_equipo: "Destino del equipo", estado_fisico: "Estado físico", autorizo: "Autorizó", objeto: "Qué se atiende", referencia: "Cuál", tipo: "Tipo de trabajo", problema: "Problema", solucion: "Solución", potencia_antes_dbm: "Potencia antes (dBm)", potencia_despues_dbm: "Potencia después (dBm)", costo: "Costo (Bs)" };
const ESPERADOS: Record<string, string[]> = { formulario_instalacion: ["nombre", "ci", "direccion", "telefono", "plan", "nap", "fecha", "tecnico"], formulario_baja: ["nombre", "motivo", "destino_equipo", "fecha"], formulario_mantenimiento: ["objeto", "referencia", "tipo", "problema", "solucion", "fecha", "tecnico"] };
const lleno = (v: any) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length);
const texto = (k: string, v: any) => (Array.isArray(v) ? `${v.length} ${k === "equipos" ? "equipo(s)" : "material(es)"}: ` + v.map((x: any) => x.serie || x.material || x.modelo || x.equipo).filter(Boolean).join(", ") : String(v));

/** Escanea con la cámara una hoja llena a mano (instalación, baja o mantenimiento).
 *  Al tomar la foto pasa todo solo: se guarda la foto con el registro, se marca la ubicación del celular, la IA lee la hoja y el formulario se llena.
 *  Si la IA no está activada o no puede leer, la foto y la ubicación se guardan igual y el formulario se llena a mano.
 *  "onUsar" puede devolver una función para deshacer lo que se llenó. */
export function EscanerFormulario({ tipo, titulo, onUsar, onArchivo, onUbicacion, archivoInicial }: { tipo: TipoFoto; titulo: string; onUsar: (r: { datos: any; ubicacion: Ubicacion; archivo: File }) => void | (() => void); onArchivo?: (f: File | null) => void; onUbicacion?: (u: NonNullable<Ubicacion>) => void; archivoInicial?: File | null }) {
  const [f, setF] = useState<File | null>(archivoInicial || null), [estado, setEstado] = useState<"" | "leyendo" | "listo" | "error">(""), [datos, setDatos] = useState<any>(null), [ubic, setUbic] = useState<Ubicacion>(null), [msg, setMsg] = useState(""), [config, setConfig] = useState(false), [deshacer, setDeshacer] = useState<null | (() => void)>(null), [revertido, setRevertido] = useState(false);
  const usar = useRef(onUsar), foto = useRef(onArchivo), gps = useRef(onUbicacion), iniciado = useRef(false); usar.current = onUsar; foto.current = onArchivo; gps.current = onUbicacion; // siempre la versión más reciente, aunque la IA tarde unos segundos
  const procesar = async (file: File) => {
    setF(file); foto.current?.(file); setEstado("leyendo"); setMsg(""); setConfig(false); setDeshacer(null); setRevertido(false); setUbic(null); setDatos(null);
    const [r, u] = await Promise.all([leerFoto(file, tipo, 2200), pedirUbicacion()]); setUbic(u); if (u) gps.current?.(u);
    if (r.ok) { setDatos(r.datos); setEstado("listo"); const undo = usar.current({ datos: r.datos, ubicacion: u, archivo: file }); if (typeof undo === "function") setDeshacer(() => undo); }
    else { setEstado("error"); setMsg(r.error || "No se pudo leer la hoja."); setConfig(!!r.configurar); }
  };
  useEffect(() => { if (archivoInicial && !iniciado.current) { iniciado.current = true; procesar(archivoInicial); } }, []);
  const campos = datos ? Object.keys(datos).filter(k => k !== "confianza" && k !== "notas" && lleno(datos[k])) : [], faltan = datos ? (ESPERADOS[tipo] || []).filter(k => !lleno(datos[k])) : [];
  const elegir = <label className={"btn " + (f ? "suave chico" : "mor")} style={{ cursor: "pointer", fontSize: f ? undefined : 15 }}>{f ? "Tomar otra foto" : "📷 Tomar foto de la hoja"}<input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => { const x = e.target.files?.[0]; if (x) procesar(x); e.target.value = ""; }} /></label>;
  return <div style={{ border: "2px dashed var(--acc)", borderRadius: 12, padding: 10, margin: "0 0 10px", background: "var(--lilb)" }}>
    <div className="fila" style={{ gap: 6 }}><b>{titulo}</b>{elegir}</div>
    {!f && <p className="mute" style={{ margin: "6px 0 0", fontSize: 13 }}>Llena la hoja a mano y tómale una foto de frente, con buena luz y que se vea completa. La app lee todo, llena el formulario, marca la ubicación donde estás y guarda la foto.</p>}
    {estado === "leyendo" && <div style={{ marginTop: 8 }}>⏳ Leyendo la hoja y marcando la ubicación… <small className="mute">(puede tardar unos segundos)</small></div>}
    {estado === "error" && <div style={{ marginTop: 8, fontSize: 13 }}><div style={{ color: "var(--bad)" }}>{msg}{config && <> Pídele al administrador que siga la guía <b>GUIA_FOTOS_IA.md</b>.</>}</div>
      <div style={{ margin: "4px 0" }}>📎 La foto se guardará igual con el registro. Llena el formulario a mano.</div>
      <div>{ubic ? <span className="pill ok">📍 Ubicación marcada: {ubic.lat}, {ubic.lng}</span> : <span className="pill warn">📍 No se pudo marcar la ubicación (revisa el permiso del navegador)</span>}</div>
      <div className="fila" style={{ marginTop: 6 }}><button type="button" className="btn chico" onClick={() => f && procesar(f)}>Reintentar</button></div></div>}
    {estado === "listo" && datos && <div style={{ marginTop: 8, fontSize: 13 }}>
      {!campos.length ? <div style={{ color: "var(--warn)" }}>No se pudo leer nada de la hoja. Prueba con otra foto más nítida, de frente y con mejor luz. La foto se guardará igual.</div> : <div className="pill ok" style={{ fontSize: 13, whiteSpace: "normal" }}>{revertido ? "Se deshizo lo que se llenó con la hoja" : "✔ Formulario llenado con la hoja. Revisa los campos antes de guardar."}</div>}
      <div style={{ margin: "6px 0" }}>{ubic ? <span className="pill ok">📍 Ubicación marcada: {ubic.lat}, {ubic.lng}</span> : <span className="pill warn">📍 No se pudo marcar la ubicación (revisa el permiso del navegador)</span>} <span className="pill acc">📎 Foto de la hoja adjunta</span></div>
      {faltan.length > 0 && !revertido && <div style={{ color: "var(--warn)", margin: "4px 0" }}>No se leyó: {faltan.map(k => ETIQ[k] || k).join(", ")}. Escríbelo a mano.</div>}
      {campos.length > 0 && <details><summary className="mute" style={{ cursor: "pointer" }}>Ver lo que se leyó (confianza: {datos.confianza || "—"})</summary>
        <table style={{ minWidth: 0, width: "100%", marginTop: 4 }}><tbody>{campos.map(k => <tr key={k}><td className="mute" style={{ padding: "1px 8px 1px 0", whiteSpace: "nowrap", verticalAlign: "top" }}>{ETIQ[k] || (k === "equipos" ? "Equipos" : k === "materiales" ? "Materiales" : k)}</td><td><b>{texto(k, datos[k])}</b></td></tr>)}</tbody></table>{datos.notas && <div className="mute">{datos.notas}</div>}</details>}
      {deshacer && !revertido && <div className="fila" style={{ marginTop: 6 }}><button type="button" className="btn suave chico" onClick={() => { deshacer(); setRevertido(true); }}>Deshacer lo que se llenó</button></div>}</div>}
  </div>;
}
