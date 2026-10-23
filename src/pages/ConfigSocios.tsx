import { useState } from "react";
import { supabase, clienteTemporal } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Vacio, useQuery } from "../lib/ui";
import { Drawer } from "../lib/drawer";

/** Socios y proyectos: un socio solo ve los proyectos en los que está incluido. */
export function ConfigSocios() {
  const { proyectos, zonas, recargar, setProyectoId, setZonaId } = useApp();
  const soc = useQuery(() => supabase.from("profiles").select("id, nombre, email, telefono, activo").eq("rol", "socio").order("nombre"), []);
  const pu = useQuery(() => supabase.from("proyecto_usuarios").select("proyecto_id, user_id"), [soc.data]);
  const [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [asignar, setAsignar] = useState<any>(null), [ocup, setOcup] = useState(false);
  const vacio = { nombre: "", email: "", telefono: "", clave: "", proyectos: [] as string[], nuevo: "" }, [f, setF] = useState(vacio), [pn, setPn] = useState({ nombre: "", socios: [] as string[] });
  if (soc.loading || pu.loading) return <Cargando />;
  const S: any[] = (soc.data as any[]) || [], PU: any[] = (pu.data as any[]) || [];
  const sociosDe = (pid: string) => S.filter(s => PU.some(a => a.proyecto_id === pid && a.user_id === s.id)), proysDe = (sid: string) => PU.filter(a => a.user_id === sid).map(a => a.proyecto_id);
  const etiqueta = (pid: string) => { const n = proyectos.find(p => p.id === pid)?.nombre, ss = sociosDe(pid); return `${n} — ${["Empresa", ...ss.map(s => s.nombre || s.email)].join(" + ")}`; };

  const registrar = async () => {
    setMsg(""); setOk(""); if (!f.nombre.trim() || !f.email.trim()) return setMsg("Escribe el nombre y el correo del socio."); if (f.clave.length < 6) return setMsg("La contraseña inicial debe tener al menos 6 caracteres.");
    if (!f.proyectos.length && !f.nuevo.trim() && !confirm("No elegiste ningún proyecto: el socio no verá nada hasta que se lo asignes. ¿Registrarlo así?")) return;
    setOcup(true);
    try {
      const { data, error } = await clienteTemporal().auth.signUp({ email: f.email.trim(), password: f.clave, options: { data: { nombre: f.nombre.trim() } } });
      if (error) throw new Error(error.message); const id = data.user?.id; if (!id || (data.user?.identities && data.user.identities.length === 0)) throw new Error("Ese correo ya está registrado.");
      const r = await supabase.rpc("registrar_socio", { p: { user_id: id, nombre: f.nombre.trim(), telefono: f.telefono, proyectos: f.proyectos, proyecto_nuevo: f.nuevo } }); if (r.error) throw new Error(r.error.message);
      setOk(`Socio registrado: ${f.nombre.trim()}.`); setF(vacio); await recargar(); soc.recargar();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  const crearProyecto = async () => {
    setMsg(""); setOk(""); if (!pn.nombre.trim()) return setMsg("Escribe el nombre del proyecto.");
    const { data, error } = await supabase.rpc("crear_proyecto", { p: { nombre: pn.nombre.trim(), socios: pn.socios } }); if (error) return setMsg(error.message);
    setOk(`Proyecto "${pn.nombre.trim()}" creado.`); setPn({ nombre: "", socios: [] }); await recargar(); setProyectoId(data as any); setZonaId(""); soc.recargar();
  };
  const alternar = async (s: any) => { setMsg(""); setOk(""); const { error } = await supabase.rpc("usuario_activar", { p_user: s.id, p_activo: !s.activo }); if (error) setMsg(error.message); else soc.recargar(); };
  const zonasDe = (pid: string) => zonas.filter(z => z.proyecto_id === pid).map(z => z.nombre);
  const marca = (arr: string[], v: string, on: boolean) => (on ? [...arr, v] : arr.filter(x => x !== v));

  return <>
    <Aviso>Un socio solo ve los proyectos en los que está incluido: menús, listados, mapa, reportes, archivos y alertas de los demás proyectos no existen para él. Esto lo exige la base de datos.</Aviso>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="grid g2" style={{ alignItems: "start" }}>
      <div className="card"><h2>Registrar socio</h2><div className="form" style={{ gridTemplateColumns: "1fr" }}>
        <input placeholder="Nombre completo" value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /><input type="email" placeholder="Correo" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} />
        <input type="tel" placeholder="Teléfono" value={f.telefono} onChange={e => setF({ ...f, telefono: e.target.value })} /><input placeholder="Contraseña inicial (mínimo 6 caracteres)" value={f.clave} onChange={e => setF({ ...f, clave: e.target.value })} /></div>
        <h3>Proyectos existentes</h3>{proyectos.length ? proyectos.map(p => <label key={p.id} className="fila" style={{ padding: "2px 0" }}><input type="checkbox" checked={f.proyectos.includes(p.id)} onChange={e => setF({ ...f, proyectos: marca(f.proyectos, p.id, e.target.checked) })} /> {etiqueta(p.id)}</label>) : <Vacio>Aún no hay proyectos.</Vacio>}
        <input style={{ width: "100%", marginTop: 8 }} placeholder="O crear un proyecto nuevo con este socio (nombre, opcional)" value={f.nuevo} onChange={e => setF({ ...f, nuevo: e.target.value })} />
        <button className="btn" style={{ width: "100%", marginTop: 8 }} disabled={ocup} onClick={registrar}>{ocup ? "Registrando…" : "Registrar socio"}</button>
        <p className="mute" style={{ margin: "8px 0 0" }}>Para que entre de inmediato, en Supabase debe estar desactivada la opción “Confirm email”.</p></div>
      <div className="card"><h2>Nuevo proyecto</h2><input style={{ width: "100%" }} placeholder="Nombre del proyecto (ej. Valle Alto)" value={pn.nombre} onChange={e => setPn({ ...pn, nombre: e.target.value })} />
        <h3>Socios que participan</h3>{S.length ? S.map(s => <label key={s.id} className="fila" style={{ padding: "2px 0" }}><input type="checkbox" checked={pn.socios.includes(s.id)} onChange={e => setPn({ ...pn, socios: marca(pn.socios, s.id, e.target.checked) })} /> {s.nombre || s.email}</label>) : <p className="mute">Aún no hay socios registrados.</p>}
        <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={crearProyecto}>Crear proyecto</button><p className="mute" style={{ margin: "8px 0 0" }}>Después se le agregan zonas con el asistente de nueva zona.</p></div></div>

    <div className="card tw"><h2>Socios registrados</h2>{S.length ? <table><thead><tr><th>Socio</th><th>Contacto</th><th>Proyectos en los que está</th><th>Estado</th><th /></tr></thead>
      <tbody>{S.map(s => <tr key={s.id} style={s.activo ? undefined : { opacity: 0.55 }}><td><b>{s.nombre || s.email}</b></td><td>{s.email}{s.telefono ? " · " + s.telefono : ""}</td>
        <td>{proysDe(s.id).length ? proysDe(s.id).map(id => <span key={id} className="pill" style={{ marginRight: 4 }}>{proyectos.find(p => p.id === id)?.nombre}</span>) : <small className="mute">Ninguno</small>}</td><td>{s.activo ? "Activo" : "Inactivo"}</td>
        <td><div className="fila"><button className="btn suave chico" onClick={() => setAsignar(s)}>Asignar proyectos</button><button className="btn suave chico" onClick={() => alternar(s)}>{s.activo ? "Desactivar" : "Activar"}</button></div></td></tr>)}</tbody></table> : <Vacio>Aún no hay socios registrados.</Vacio>}</div>

    <div className="card tw"><h2>Proyectos y sus socios</h2>{proyectos.length ? <table><thead><tr><th>Proyecto</th><th>Zonas</th><th>Socios</th></tr></thead>
      <tbody>{proyectos.map(p => <tr key={p.id}><td><b>{etiqueta(p.id)}</b></td><td>{zonasDe(p.id).join(", ") || <small className="mute">Sin zonas</small>}</td><td>{sociosDe(p.id).length ? sociosDe(p.id).map(s => <span key={s.id} className="pill" style={{ marginRight: 4 }}>{s.nombre || s.email}</span>) : <small className="mute">Solo administradores</small>}</td></tr>)}</tbody></table> : <Vacio>Aún no hay proyectos.</Vacio>}</div>
    {asignar && <AsignarProyectos socio={asignar} actuales={proysDe(asignar.id)} onClose={() => setAsignar(null)} onListo={() => { setAsignar(null); setOk("Proyectos actualizados."); soc.recargar(); }} />}
  </>;
}

function AsignarProyectos({ socio, actuales, onClose, onListo }: { socio: any; actuales: string[]; onClose: () => void; onListo: () => void }) {
  const { proyectos, zonas } = useApp(), [sel, setSel] = useState<string[]>(actuales), [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false);
  const guardar = async () => {
    setMsg(""); setOcup(true);
    try {
      for (const id of sel.filter(x => !actuales.includes(x))) { const { error } = await supabase.rpc("agregar_socio", { p: { user_id: socio.id, proyecto_id: id } }); if (error) throw new Error(error.message); }
      for (const id of actuales.filter(x => !sel.includes(x))) { const { error } = await supabase.rpc("quitar_socio", { p_user: socio.id, p_zona: null, p_proyecto: id }); if (error) throw new Error(error.message); }
      onListo();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  return <Drawer titulo={"Proyectos de " + (socio.nombre || socio.email)} onClose={onClose}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    <p className="mute" style={{ marginTop: 0 }}>Marca los proyectos que este socio puede ver. Al quitarle un proyecto también deja de participar en sus zonas; los repartos anteriores no cambian.</p>
    {proyectos.map(p => <label key={p.id} className="fila" style={{ padding: "4px 0" }}><input type="checkbox" checked={sel.includes(p.id)} onChange={e => setSel(e.target.checked ? [...sel, p.id] : sel.filter(x => x !== p.id))} /> <b>{p.nombre}</b> <small className="mute">{zonas.filter(z => z.proyecto_id === p.id).map(z => z.nombre).join(", ")}</small></label>)}
    <button className="btn" style={{ width: "100%", marginTop: 12 }} disabled={ocup} onClick={guardar}>{ocup ? "Guardando…" : "Guardar"}</button></Drawer>;
}
