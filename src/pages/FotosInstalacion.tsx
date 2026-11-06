import { useEffect, useState } from "react";
import { supabase, subirArchivo, urlArchivo } from "../lib/supabase";
import { Aviso, Cargando } from "../lib/ui";
import { Drawer } from "../lib/drawer";
import { SLOTS_FOTOS, comprimirFoto, contarFotos } from "../lib/fotos";

export type FotosElegidas = Record<string, File | null>;

/** Las 5 fotos de la instalación al registrarla: se toman con la cámara del celular o se eligen de la galería. */
export function SelectorFotos({ fotos, onChange, requeridas = true }: { fotos: FotosElegidas; onChange: (f: FotosElegidas) => void; requeridas?: boolean }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => { const nuevo: Record<string, string> = {}; SLOTS_FOTOS.forEach(s => { const f = fotos[s.k]; if (f) nuevo[s.k] = URL.createObjectURL(f); }); setUrls(nuevo); return () => Object.values(nuevo).forEach(u => URL.revokeObjectURL(u)); }, [fotos]);
  const n = SLOTS_FOTOS.filter(s => fotos[s.k]).length;
  return <div style={{ margin: "10px 0" }}><h3 style={{ margin: "0 0 4px" }}>📷 Fotos de la instalación <span className={"pill " + (n === 5 ? "ok" : "warn")}>{n} de 5</span></h3>
    <p className="mute" style={{ margin: "0 0 8px" }}>{requeridas ? "Estas 5 fotos son el respaldo de la instalación." : "Puedes agregar las fotos ahora o después."} Toca cada recuadro para tomar la foto con la cámara.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>{SLOTS_FOTOS.map(s => <div key={s.k} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 8, background: fotos[s.k] ? "var(--lilb)" : "#fff" }}>
      <b style={{ fontSize: 13 }}>{s.t}</b>
      <label style={{ display: "block", cursor: "pointer", marginTop: 6 }}>{urls[s.k] ? <img src={urls[s.k]} alt={s.t} style={{ width: "100%", height: 110, objectFit: "cover", borderRadius: 8 }} /> : <div style={{ height: 110, borderRadius: 8, border: "2px dashed var(--line)", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 12, padding: 6 }} className="mute">📷 Tomar o elegir foto<br />{s.ayuda}</div>}
        <input type="file" accept="image/*" capture="environment" data-slot={s.k} style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0] || null; if (f) onChange({ ...fotos, [s.k]: f }); e.target.value = ""; }} /></label>
      {fotos[s.k] && <button type="button" className="btn suave chico" style={{ marginTop: 4 }} onClick={() => onChange({ ...fotos, [s.k]: null })}>Quitar</button>}</div>)}</div></div>;
}

/** Achica y sube las fotos elegidas. Devuelve la ruta de cada una (las que fallen se omiten) y cuántas no se pudieron subir. */
export async function subirFotos(proyectoId: string, fotos: FotosElegidas, progreso?: (t: string) => void) {
  const rutas: Record<string, string> = {}; let fallaron = 0, i = 0; const elegidas = SLOTS_FOTOS.filter(s => fotos[s.k]);
  for (const s of elegidas) { i++; progreso?.(`Subiendo foto ${i} de ${elegidas.length}…`); try { const f = await comprimirFoto(fotos[s.k]!, s.k); rutas[s.k] = await subirArchivo("fotos", proyectoId, f); } catch { fallaron++; } }
  return { rutas, fallaron };
}

/** Ver las fotos de una instalación y completar o cambiar las que falten. */
export function GaleriaFotos({ instalacion, titulo, onClose, onCambio, puedeEditar = true }: { instalacion: { id: string; proyecto_id: string; fotos: any }; titulo: string; onClose: () => void; onCambio: () => void; puedeEditar?: boolean }) {
  const [fotos, setFotos] = useState<Record<string, string>>(instalacion.fotos || {}), [urls, setUrls] = useState<Record<string, string>>({}), [cargando, setCargando] = useState(true), [msg, setMsg] = useState(""), [ocup, setOcup] = useState("");
  useEffect(() => { let vivo = true; (async () => { const nuevo: Record<string, string> = {}; await Promise.all(SLOTS_FOTOS.filter(s => fotos[s.k]).map(async s => { try { const u = await urlArchivo("fotos", fotos[s.k]); if (u) nuevo[s.k] = u; } catch { /* sin vista previa */ } })); if (vivo) { setUrls(nuevo); setCargando(false); } })(); return () => { vivo = false; }; }, [JSON.stringify(fotos)]);
  const poner = async (k: string, file: File) => {
    setMsg(""); setOcup(k);
    try { const f = await comprimirFoto(file, k), ruta = await subirArchivo("fotos", instalacion.proyecto_id, f), nuevo = { ...fotos, [k]: ruta }, { error } = await supabase.from("instalaciones").update({ fotos: nuevo }).eq("id", instalacion.id); if (error) throw new Error(error.message); setFotos(nuevo); onCambio(); }
    catch (e: any) { setMsg(e.message || "No se pudo subir la foto."); }
    setOcup("");
  };
  return <Drawer titulo={titulo} ancho={560} onClose={onClose}>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}
    <p className="mute" style={{ marginTop: 0 }}>Fotos de la instalación: <b>{contarFotos(fotos)} de 5</b>.{puedeEditar ? " Puedes completar o cambiar cualquiera." : ""}</p>
    {cargando ? <Cargando /> : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>{SLOTS_FOTOS.map(s => <div key={s.k} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 8 }}>
      <b style={{ fontSize: 13 }}>{s.t}</b>
      {urls[s.k] ? <a href={urls[s.k]} target="_blank" rel="noreferrer"><img src={urls[s.k]} alt={s.t} style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 8, marginTop: 6 }} /></a> : <div className="mute" style={{ height: 150, marginTop: 6, borderRadius: 8, border: "2px dashed var(--line)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, textAlign: "center", padding: 6 }}>{fotos[s.k] ? "No se pudo mostrar" : "Sin foto"}</div>}
      {puedeEditar && <label className="btn suave chico" style={{ cursor: "pointer", marginTop: 6, display: "inline-block" }}>{ocup === s.k ? "Subiendo…" : fotos[s.k] ? "Cambiar foto" : "📷 Agregar foto"}<input type="file" accept="image/*" capture="environment" data-slot={s.k} style={{ display: "none" }} disabled={!!ocup} onChange={e => { const f = e.target.files?.[0]; if (f) poner(s.k, f); e.target.value = ""; }} /></label>}</div>)}</div>}
  </Drawer>;
}
