import { useState } from "react";
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
  const [nombre, setNombre] = useState(""), [codigo, setCodigo] = useState(""), [sel, setSel] = useState<string[]>([]), [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false);
  const S: any[] = (socios.data as any[]) || [];
  const guardar = async () => {
    setMsg(""); if (!nombre.trim()) return setMsg("Escribe el nombre del proyecto.");
    setOcup(true); const { data, error } = await supabase.rpc("crear_proyecto", { p: { nombre: nombre.trim(), codigo, socios: sel } }); setOcup(false);
    if (error) return setMsg(error.message);
    await recargar(); setProyectoId(data as any); setZonaId(""); onClose();
  };
  return <Modal titulo="Nuevo proyecto" onClose={onClose}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    <p className="mute" style={{ marginTop: 0 }}>Un proyecto agrupa zonas y define qué ve cada socio: el socio que agregues verá todas las zonas de este proyecto, y ninguna de los demás.</p>
    <div className="form"><Campo l="Nombre del proyecto *"><input autoFocus value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Proyecto Norte" /></Campo><Campo l="Código (opcional)"><input value={codigo} onChange={e => setCodigo(e.target.value)} /></Campo></div>
    <h3>¿Tiene socios?</h3>{socios.loading ? <Cargando /> : S.length ? S.map(x => <label key={x.id} className="fila" style={{ padding: "3px 0" }}><input type="checkbox" checked={sel.includes(x.id)} onChange={e => setSel(e.target.checked ? [...sel, x.id] : sel.filter(y => y !== x.id))} /> {x.nombre || x.email} <span className="mute">{x.email}</span></label>)
      : <Vacio>Aún no tienes usuarios con rol Socio. Puedes crear el proyecto ahora y agregarlos después en Red → Historial de la red.</Vacio>}
    <p className="mute">Podrás agregar, quitar o cambiar socios cuando quieras en Red → Historial de la red.</p>
    <button className="btn" disabled={ocup} onClick={guardar}>{ocup ? "Creando…" : "Crear proyecto"}</button></Modal>;
}
