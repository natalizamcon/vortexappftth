import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Cargando, Vacio, useQuery } from "../lib/ui";
import Crud from "../lib/crud";
import { AccesosZona, ZonaWizard } from "./ZonaWizard";
import { aPapelera } from "../lib/papelera";

export default function Zonas() {
  const { perfil, zonas, proyectos, zonaId, proyectoId, recargar, setZonaId, setProyectoId } = useApp();
  const esAdmin = perfil?.rol === "admin";
  const [ok, setOk] = useState(""), [msg, setMsg] = useState(""), [nueva, setNueva] = useState(false), [acc, setAcc] = useState<any>(null);
  const planes = useQuery(() => zonaId ? supabase.from("planes").select("*").eq("zona_id", zonaId).order("precio") : Promise.resolve({ data: [], error: null }), [zonaId]);
  const zonaAPapelera = async (z: any) => {
    setMsg(""); setOk("");
    if (!confirm(`¿Mandar la zona "${z.nombre}" a la papelera?\n\nDesaparece de todas las pantallas junto con todo lo que contiene (clientes, red, cobranzas, finanzas). No se borra nada: podrás restaurarla desde el menú Papelera.`)) return;
    try { await aPapelera("zonas", [z.id]); if (zonaId === z.id) setZonaId(""); await recargar(); setOk(`La zona "${z.nombre}" está en la papelera.`); } catch (e: any) { setMsg(e.message); }
  };
  const espacioAPapelera = async (p: any) => {
    setMsg(""); setOk("");
    if (!confirm(`¿Mandar el espacio "${p.nombre}" a la papelera?\n\nDesaparecen todas sus zonas y todo lo que contienen. No se borra nada: podrás restaurarlo desde el menú Papelera.`)) return;
    try { await aPapelera("proyectos", [p.id]); if (proyectoId === p.id) setProyectoId(""); setZonaId(""); await recargar(); setOk(`El espacio "${p.nombre}" está en la papelera.`); } catch (e: any) { setMsg(e.message); }
  };
  const cambiarPlan = async (id: string, campo: string, valor: any) => { const { error } = await supabase.from("planes").update({ [campo]: valor }).eq("id", id); if (error) setMsg(error.message); else planes.recargar(); };
  const zona = zonas.find(z => z.id === zonaId);
  return <>
    <div className="fila entre"><h1>Zonas</h1>{esAdmin && <button className="btn" onClick={() => setNueva(true)}>+ Crear zona</button>}</div>{msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    {!esAdmin && !zonas.length && <Aviso>Todavía no tienes ninguna zona asignada. Pide al administrador que te dé acceso.</Aviso>}
    {esAdmin && !zonas.length && <Aviso>Para empezar, pulsa <b>Crear zona</b>. Te voy a guiar paso a paso: datos, socios, inversores, precios, red, costos y meta.</Aviso>}
    <div className="card tw"><h2>Zonas</h2>{zonas.length ? <table><thead><tr><th>Zona</th><th>Acceso</th><th>Inicio</th><th>Corte</th><th>Meta</th>{esAdmin && <th />}</tr></thead><tbody>{zonas.filter(z => !proyectoId || z.proyecto_id === proyectoId).map(z => <tr key={z.id}><td><b>{z.nombre}</b>{z.ubicacion && <><br /><span className="mute">{z.ubicacion}</span></>}</td><td>{z.con_socios ? <span className="tag">Con socios</span> : <span className="mute">Solo mía</span>}</td><td>{z.fecha_inicio}</td><td>día {z.dia_corte}</td><td>{z.meta_clientes ? z.meta_clientes + " clientes en " + (z.meta_meses || "?") + " meses" : "—"}{z.fecha_meta ? <><br /><span className="mute">hasta {z.fecha_meta}</span></> : null}</td>{esAdmin && <td><div className="fila">{z.con_socios && <button className="btn suave chico" onClick={() => setAcc(z)}>Socios</button>}<button className="btn suave chico" onClick={() => zonaAPapelera(z)}>A la papelera</button></div></td>}</tr>)}</tbody></table> : <Vacio>Aún no hay zonas. Pulsa "Crear zona" para empezar.</Vacio>}</div>
    {esAdmin && proyectos.length > 0 && <div className="card tw"><h2>Espacios</h2><p className="mute">Un espacio agrupa zonas. Se crea solo al crear la primera zona; las zonas con socios tienen el suyo. Si mandas un espacio a la papelera, desaparecen todas sus zonas.</p>
      <table><thead><tr><th>Espacio</th><th>Zonas</th><th /></tr></thead><tbody>{proyectos.map(p => <tr key={p.id}><td><b>{p.nombre}</b></td><td>{zonas.filter(z => z.proyecto_id === p.id).length}</td><td><button className="btn suave chico" onClick={() => espacioAPapelera(p)}>A la papelera</button></td></tr>)}</tbody></table></div>}
    <div className="card tw"><h2>Planes{zona ? " de " + zona.nombre : ""}</h2>{!zonaId ? <Vacio>Elige una zona arriba para ver y cambiar sus planes. Cambiar un plan no modifica a los clientes que ya lo contrataron.</Vacio> : planes.loading ? <Cargando /> : <table><thead><tr><th>Plan</th><th>Mbps</th><th>Precio (Bs)</th><th>Activo</th></tr></thead><tbody>{((planes.data as any[]) || []).map(p => <tr key={p.id}><td>{p.nombre}</td><td><input type="number" style={{ width: 90 }} defaultValue={p.mbps} onBlur={e => +e.target.value !== p.mbps && cambiarPlan(p.id, "mbps", +e.target.value)} /></td><td><input type="number" style={{ width: 100 }} defaultValue={p.precio} onBlur={e => +e.target.value !== +p.precio && cambiarPlan(p.id, "precio", +e.target.value)} /></td><td><input type="checkbox" checked={p.activo} onChange={e => cambiarPlan(p.id, "activo", e.target.checked)} /></td></tr>)}</tbody></table>}</div>
    {zonaId && <Crud titulo="Costos fijos mensuales de la zona (Starlink, alquiler…)" tabla="costos_fijos" conZona campos={[{ k: "concepto", l: "Concepto", req: true }, { k: "cantidad", l: "Cantidad", t: "number", def: 1 }, { k: "monto_unitario", l: "Monto por unidad (Bs)", t: "number", req: true }]} />}
    {nueva && <ZonaWizard onClose={() => setNueva(false)} />}
    {acc && <AccesosZona zona={acc} onClose={() => setAcc(null)} />}
  </>;
}
