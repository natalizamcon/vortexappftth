import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Estado, Vacio, bs, useAlcance, useQuery } from "../lib/ui";

/** Instaladores de la zona. No tienen acceso al sistema: solo quedan disponibles para elegirlos en instalaciones, mantenimientos y viajes. */
export function Instaladores() {
  const { zonas, zonaId, proyectoId } = useApp(), al = useAlcance(), zona = zonas.find(z => z.id === zonaId);
  const q = useQuery(() => al(supabase.from("instaladores").select("*").order("activo", { ascending: false }).order("nombre")), [proyectoId, zonaId]);
  const vacio = { nombre: "", celular: "", ci: "", pago_dia: "150" }, [f, setF] = useState(vacio), [msg, setMsg] = useState(""), [ok, setOk] = useState("");
  const L: any[] = (q.data as any[]) || [];
  const agregar = async () => {
    setMsg(""); setOk(""); if (!zona) return setMsg("Elige una zona arriba."); if (!f.nombre.trim()) return setMsg("Escribe el nombre completo.");
    const { error } = await supabase.from("instaladores").insert({ proyecto_id: zona.proyecto_id, zona_id: zona.id, nombre: f.nombre.trim(), celular: f.celular || null, ci: f.ci || null, pago_dia: Number(f.pago_dia) || 0 });
    if (error) setMsg(error.message); else { setF(vacio); setOk("Instalador agregado."); q.recargar(); }
  };
  const alternar = async (x: any) => { const { error } = await supabase.from("instaladores").update({ activo: !x.activo }).eq("id", x.id); if (error) setMsg(error.message); else q.recargar(); };
  return <div className="grid g2" style={{ alignItems: "start" }}>
    <div className="card"><h2>Nuevo instalador{zona ? " · zona " + zona.nombre : ""}</h2>{msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
      <div className="form" style={{ gridTemplateColumns: "1fr" }}>
        <Campo l="Nombre completo"><input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></Campo>
        <Campo l="Celular"><input type="tel" value={f.celular} onChange={e => setF({ ...f, celular: e.target.value })} /></Campo>
        <Campo l="Carnet de identidad"><input value={f.ci} onChange={e => setF({ ...f, ci: e.target.value })} /></Campo>
        <Campo l="Pago por día (Bs)"><input type="number" min={0} step={0.01} value={f.pago_dia} onChange={e => setF({ ...f, pago_dia: e.target.value })} /></Campo></div>
      <button className="btn" style={{ width: "100%", marginTop: 8 }} disabled={!zona} onClick={agregar}>Agregar instalador</button>
      <p className="mute" style={{ margin: "8px 0 0" }}>Los instaladores quedan disponibles al registrar instalaciones, mantenimientos y viajes. No tienen acceso al sistema.</p></div>
    <div className="card tw"><h2>Instaladores</h2>{q.loading ? <Cargando /> : L.length ? <table style={{ minWidth: 0 }}><thead><tr><th>Nombre</th><th>Celular</th><th>Pago por día</th><th>Estado</th><th /></tr></thead>
      <tbody>{L.map(x => <tr key={x.id} style={x.activo ? undefined : { opacity: 0.55 }}><td><b>{x.nombre}</b></td><td>{x.celular || "—"}</td><td>{Number(x.pago_dia) ? bs(x.pago_dia) : "—"}</td><td><Estado e={x.activo ? "ACTIVO" : "BAJA"} /></td><td><button className="btn suave chico" onClick={() => alternar(x)}>{x.activo ? "Desactivar" : "Activar"}</button></td></tr>)}</tbody></table> : <Vacio>Aún no hay instaladores{zona ? " en esta zona" : ""}.</Vacio>}</div>
  </div>;
}
