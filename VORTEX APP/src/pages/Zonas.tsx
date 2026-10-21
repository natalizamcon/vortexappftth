import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Vacio, hoy, useQuery } from "../lib/ui";
import Crud from "../lib/crud";

export default function Zonas() {
  const { perfil, proyectos, zonas, recargar, zonaId, proyectoId } = useApp();
  const [np, setNp] = useState({ codigo: "", nombre: "" }), [nz, setNz] = useState<any>({ proyecto_id: "", nombre: "", fecha_inicio: hoy(), dia_corte: 5, meta_clientes: "", meta_meses: "" }), [msg, setMsg] = useState(""), [ok, setOk] = useState("");
  const planes = useQuery(() => zonaId ? supabase.from("planes").select("*").eq("zona_id", zonaId).order("precio") : Promise.resolve({ data: [], error: null }), [zonaId]);
  const crearProyecto = async () => { setMsg(""); const { error } = await supabase.from("proyectos").insert({ codigo: np.codigo || null, nombre: np.nombre }); if (error) setMsg(error.message); else { setOk("Proyecto creado."); setNp({ codigo: "", nombre: "" }); recargar(); } };
  const crearZona = async () => {
    setMsg(""); setOk(""); const pid = nz.proyecto_id || proyectoId || (proyectos.length === 1 ? proyectos[0].id : "");
    if (!pid || !nz.nombre) return setMsg("Elige el proyecto y escribe el nombre de la zona.");
    const { error } = await supabase.from("zonas").insert({ proyecto_id: pid, nombre: nz.nombre, fecha_inicio: nz.fecha_inicio, dia_corte: +nz.dia_corte || 5, meta_clientes: nz.meta_clientes || null, meta_meses: nz.meta_meses || null });
    if (error) setMsg(error.message); else { setOk("Zona creada con su almacén y 3 planes base."); setNz({ ...nz, nombre: "" }); recargar(); }
  };
  const cambiarPlan = async (id: string, campo: string, valor: any) => { const { error } = await supabase.from("planes").update({ [campo]: valor }).eq("id", id); if (error) setMsg(error.message); else planes.recargar(); };
  const zona = zonas.find(z => z.id === zonaId);
  return <>
    <h1>Proyectos y zonas</h1>{msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="grid g2">
      {perfil?.rol === "admin" && <div className="card"><h2>Nuevo proyecto</h2><Campo l="Código (ej. C)"><input value={np.codigo} onChange={e => setNp({ ...np, codigo: e.target.value })} /></Campo><Campo l="Nombre"><input value={np.nombre} onChange={e => setNp({ ...np, nombre: e.target.value })} /></Campo><button className="btn" disabled={!np.nombre.trim()} onClick={crearProyecto}>Crear proyecto</button><p className="mute">Después, en Usuarios, asigna los socios que participan.</p></div>}
      <div className="card"><h2>Nueva zona</h2><div className="form">
        {proyectos.length > 1 && <Campo l="Proyecto"><select value={nz.proyecto_id} onChange={e => setNz({ ...nz, proyecto_id: e.target.value })}><option value="">Elige…</option>{proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>}
        <Campo l="Nombre de la zona"><input value={nz.nombre} onChange={e => setNz({ ...nz, nombre: e.target.value })} /></Campo><Campo l="Fecha de inicio"><input type="date" value={nz.fecha_inicio} onChange={e => setNz({ ...nz, fecha_inicio: e.target.value })} /></Campo>
        <Campo l="Día de corte (1 a 28)"><input type="number" value={nz.dia_corte} onChange={e => setNz({ ...nz, dia_corte: e.target.value })} /></Campo><Campo l="Meta de clientes"><input type="number" value={nz.meta_clientes} onChange={e => setNz({ ...nz, meta_clientes: e.target.value })} /></Campo><Campo l="Meses para llegar a la meta"><input type="number" value={nz.meta_meses} onChange={e => setNz({ ...nz, meta_meses: e.target.value })} /></Campo></div>
        <button className="btn" onClick={crearZona}>Crear zona</button></div></div>
    <div className="card tw"><h2>Zonas</h2>{zonas.length ? <table><thead><tr><th>Proyecto</th><th>Zona</th><th>Inicio</th><th>Corte</th><th>Meta</th></tr></thead><tbody>{zonas.filter(z => !proyectoId || z.proyecto_id === proyectoId).map(z => <tr key={z.id}><td>{proyectos.find(p => p.id === z.proyecto_id)?.nombre}</td><td><b>{z.nombre}</b></td><td>{z.fecha_inicio}</td><td>día {z.dia_corte}</td><td>{z.meta_clientes ? z.meta_clientes + " clientes en " + (z.meta_meses || "?") + " meses" : "—"}</td></tr>)}</tbody></table> : <Vacio>Aún no hay zonas.</Vacio>}</div>
    <div className="card tw"><h2>Planes{zona ? " de " + zona.nombre : ""}</h2>{!zonaId ? <Vacio>Elige una zona arriba para ver y cambiar sus planes. Cambiar un plan no modifica a los clientes que ya lo contrataron.</Vacio> : planes.loading ? <Cargando /> : <table><thead><tr><th>Plan</th><th>Mbps</th><th>Precio (Bs)</th><th>Activo</th></tr></thead><tbody>{((planes.data as any[]) || []).map(p => <tr key={p.id}><td>{p.nombre}</td><td><input type="number" style={{ width: 90 }} defaultValue={p.mbps} onBlur={e => +e.target.value !== p.mbps && cambiarPlan(p.id, "mbps", +e.target.value)} /></td><td><input type="number" style={{ width: 100 }} defaultValue={p.precio} onBlur={e => +e.target.value !== +p.precio && cambiarPlan(p.id, "precio", +e.target.value)} /></td><td><input type="checkbox" checked={p.activo} onChange={e => cambiarPlan(p.id, "activo", e.target.checked)} /></td></tr>)}</tbody></table>}</div>
    {zonaId && <Crud titulo="Costos fijos mensuales de la zona (Starlink, alquiler…)" tabla="costos_fijos" conZona campos={[{ k: "concepto", l: "Concepto", req: true }, { k: "cantidad", l: "Cantidad", t: "number", def: 1 }, { k: "monto_unitario", l: "Monto por unidad (Bs)", t: "number", req: true }]} />}
  </>;
}
