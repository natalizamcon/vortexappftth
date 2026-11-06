import { useState } from "react";
import { FilasInversores, InvFila, aInversorDB } from "../lib/FilasInversores";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Modal, Vacio, useQuery } from "../lib/ui";
import { ZonaWizard } from "./ZonaWizard";

/** Botones "+ Nueva zona" y "+ Nuevo proyecto" (solo administrador). Se muestran arriba de Red, Clientes e Instalaciones y servicios. */
export function BotonesNuevo() {
  const { perfil } = useApp(), [zona, setZona] = useState(false), [proy, setProy] = useState(false);
  if (perfil?.rol !== "admin") return null;
  return <div className="fila" style={{ marginBottom: 10 }}>
    <button className="btn suave" onClick={() => setZona(true)}>+ Nueva zona</button>
    <button className="btn suave" onClick={() => setProy(true)}>+ Nuevo proyecto</button>
    {zona && <ZonaWizard onClose={() => setZona(false)} />}{proy && <NuevoProyecto onClose={() => setProy(false)} />}</div>;
}

function NuevoProyecto({ onClose }: { onClose: () => void }) {
  const { recargar, setProyectoId, setZonaId } = useApp();
  const socios = useQuery(() => supabase.from("profiles").select("id, nombre, email").eq("rol", "socio").eq("activo", true).order("nombre"), []);
  const [nombre, setNombre] = useState(""), [codigo, setCodigo] = useState(""), [sel, setSel] = useState<string[]>([]), [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false), [inv, setInv] = useState<InvFila[]>([]);
  const S: any[] = (socios.data as any[]) || [];
  const guardar = async () => {
    setMsg(""); if (!nombre.trim()) return setMsg("Escribe el nombre del proyecto.");
    const filas: any[] = []; for (const x of inv.filter(y => y.nombre.trim() || Number(y.cap) > 0)) { const r = aInversorDB(x); if ("error" in r) return setMsg(r.error + " (o quita esa fila)."); filas.push(r.fila); }
    setOcup(true); const { data, error } = await supabase.rpc("crear_proyecto", { p: { nombre: nombre.trim(), codigo, socios: sel } });
    if (error) { setOcup(false); return setMsg(error.message); }
    if (filas.length) { const { error: e2 } = await supabase.from("inversores").insert(filas.map(f => ({ ...f, proyecto_id: data as any, zona_id: null, fecha_inicio: new Date().toLocaleDateString("en-CA") }))); if (e2) alert("El proyecto se creó, pero no se pudieron guardar los inversores: " + (/zona_id|not-null/i.test(e2.message) ? "falta correr en Supabase el archivo 29_fondo_inversion.sql" : e2.message) + ". Agrégalos después en Finanzas → Inversores."); }
    setOcup(false); await recargar(); setProyectoId(data as any); setZonaId(""); onClose();
  };
  return <Modal titulo="Nuevo proyecto" onClose={onClose} ancho={820}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    <p className="mute" style={{ marginTop: 0 }}>Un proyecto agrupa zonas y define qué ve cada socio: el socio que agregues verá todas las zonas de este proyecto, y ninguna de los demás.</p>
    <div className="form"><Campo l="Nombre del proyecto *"><input autoFocus value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Proyecto Norte" /></Campo><Campo l="Código (opcional)"><input value={codigo} onChange={e => setCodigo(e.target.value)} /></Campo></div>
    <h3>¿Tiene socios?</h3>{socios.loading ? <Cargando /> : S.length ? S.map(x => <label key={x.id} className="fila" style={{ padding: "3px 0" }}><input type="checkbox" checked={sel.includes(x.id)} onChange={e => setSel(e.target.checked ? [...sel, x.id] : sel.filter(y => y !== x.id))} /> {x.nombre || x.email} <span className="mute">{x.email}</span></label>)
      : <Vacio>Aún no tienes usuarios con rol Socio. Puedes crear el proyecto ahora y agregarlos después en Red → Historial de la red.</Vacio>}
    <p className="mute">Podrás agregar, quitar o cambiar socios cuando quieras en Red → Historial de la red.</p>
    <h3>¿Hay inversores del proyecto?</h3>
    <p className="mute" style={{ marginTop: 0 }}>Dinero que invierten en el proyecto <b>en general</b> (no en una zona en particular). Aparece solo en <b>Finanzas → Inversores</b> como inversor general y suma al <b>fondo general</b> de inversión. Si no hay, déjalo vacío.</p>
    <FilasInversores filas={inv} onChange={setInv} />
    <button className="btn" disabled={ocup} onClick={guardar}>{ocup ? "Creando…" : "Crear proyecto"}</button></Modal>;
}
