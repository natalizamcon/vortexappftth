import { useState } from "react";
import { TipoFoto, leerFoto } from "./ia";

const CAMPOS: Record<TipoFoto, [string, string][]> = {
  etiqueta_equipo: [["serie", "Número de serie"], ["mac", "MAC"], ["modelo", "Modelo"], ["marca", "Marca"]],
  comprobante: [["monto", "Monto"], ["moneda", "Moneda"], ["fecha", "Fecha"], ["referencia", "Referencia"], ["banco", "Banco o app"], ["remitente", "Pagó"]],
  potencia: [["potencia_dbm", "Potencia (dBm)"], ["punto", "Punto"]],
  carnet: [["nombre", "Nombre"], ["ci", "C.I."], ["extension", "Extensión"]],
};
const mostrar = (k: string, v: any) => (v === null || v === undefined || v === "" ? "—" : k === "monto" ? Number(v).toLocaleString("es-BO", { minimumFractionDigits: 2 }) : String(v));

/** Lee una foto con IA y propone los datos. El usuario revisa y decide si los usa: nunca se guarda nada solo.
 *  Si se pasa "archivo", usa esa foto (por ejemplo el comprobante ya elegido); si no, muestra su propio botón para elegir o tomar la foto. */
export function LectorFoto({ tipo, titulo, archivo, onUsar, onArchivo }: { tipo: TipoFoto; titulo: string; archivo?: File | null; onUsar: (datos: any) => void; onArchivo?: (f: File | null) => void }) {
  const [propio, setPropio] = useState<File | null>(null), [estado, setEstado] = useState<"" | "leyendo" | "listo" | "error">(""), [datos, setDatos] = useState<any>(null), [msg, setMsg] = useState(""), [usado, setUsado] = useState(false), [config, setConfig] = useState(false);
  const f = archivo !== undefined ? archivo : propio;
  const leer = async () => {
    if (!f) return; setEstado("leyendo"); setMsg(""); setUsado(false); setConfig(false);
    const r = await leerFoto(f, tipo);
    if (r.ok) { setDatos(r.datos); setEstado("listo"); } else { setEstado("error"); setMsg(r.error || "No se pudo leer."); setConfig(!!r.configurar); }
  };
  const vacio = datos && CAMPOS[tipo].every(([k]) => datos[k] === null || datos[k] === undefined || datos[k] === "");
  return <div style={{ border: "1px dashed var(--line)", borderRadius: 10, padding: 8, margin: "6px 0", background: "var(--lilb)" }}>
    <div className="fila" style={{ gap: 6 }}><b style={{ fontSize: 13 }}>📷 {titulo}</b>
      {archivo === undefined && <label className="btn suave chico" style={{ cursor: "pointer" }}>{propio ? "Cambiar foto" : "Elegir o tomar foto"}<input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => { const x = e.target.files?.[0] || null; setPropio(x); onArchivo?.(x); setEstado(""); setDatos(null); e.target.value = ""; }} /></label>}
      <button type="button" className="btn chico" disabled={!f || estado === "leyendo"} onClick={leer}>{estado === "leyendo" ? "Leyendo…" : "Leer con IA"}</button>
      {archivo === undefined && propio && <small className="mute">{propio.name}</small>}{archivo === null && <small className="mute">Primero elige el archivo.</small>}</div>
    {estado === "error" && <div style={{ color: "var(--bad)", marginTop: 6, fontSize: 13 }}>{msg}{config && <> Pídele al administrador que siga la guía <b>GUIA_FOTOS_IA.md</b>.</>}</div>}
    {estado === "listo" && datos && <div style={{ marginTop: 6, fontSize: 13 }}>
      {vacio ? <div className="mute">No se pudo leer ningún dato. Prueba con una foto más cercana, nítida y con buena luz.</div> : <>
        <table style={{ minWidth: 0, width: "100%" }}><tbody>{CAMPOS[tipo].map(([k, l]) => <tr key={k}><td className="mute" style={{ padding: "2px 6px 2px 0" }}>{l}</td><td><b>{mostrar(k, datos[k])}</b></td></tr>)}</tbody></table>
        <div className="mute" style={{ margin: "4px 0" }}>Confianza: {datos.confianza || "—"}{datos.notas ? " · " + datos.notas : ""}. <b>Revisa que coincida con la foto.</b></div>
        <div className="fila"><button type="button" className="btn chico" disabled={usado} onClick={() => { onUsar(datos); setUsado(true); }}>{usado ? "Datos usados ✓" : "Usar estos datos"}</button><button type="button" className="btn suave chico" onClick={() => { setEstado(""); setDatos(null); }}>Descartar</button></div></>}</div>}
  </div>;
}
