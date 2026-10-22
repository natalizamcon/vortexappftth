import { useState } from "react";
import { supabase, clienteTemporal } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Modal, Vacio, useQuery } from "../lib/ui";

const ROLES: [string, string][] = [["admin", "Administrador (ve todo)"], ["socio", "Socio (solo sus proyectos)"], ["supervisor", "Supervisor"], ["tecnico", "Técnico"], ["cobranzas", "Cobranzas"], ["almacen", "Almacén"], ["financiero", "Financiero"], ["pendiente", "Sin acceso"]];

export default function Usuarios() {
  const { proyectos } = useApp(), [ed, setEd] = useState<any>(null), [nuevo, setNuevo] = useState(false);
  const u = useQuery(() => supabase.from("profiles").select("*").order("creado_en"), []), pu = useQuery(() => supabase.from("proyecto_usuarios").select("*"), [u.data]);
  const asig = (id: string) => ((pu.data as any[]) || []).filter(x => x.user_id === id).map(x => x.proyecto_id);
  return <><div className="fila entre"><h2 style={{ margin: 0 }}>Usuarios y socios</h2><button className="btn" onClick={() => setNuevo(true)}>+ Crear usuario</button></div>
    <Aviso>Un socio solo ve los proyectos que le asignes aquí: la base de datos le impide ver cualquier otro. Los dos administradores ven todo.</Aviso>
    <div className="card tw">{u.loading ? <Cargando /> : u.error ? <Aviso tipo="mal">{u.error}</Aviso> : ((u.data as any[]) || []).length ? <table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Proyectos</th><th>Estado</th><th /></tr></thead><tbody>{((u.data as any[]) || []).map(x => <tr key={x.id}><td><b>{x.nombre}</b></td><td>{x.email}</td><td>{ROLES.find(r => r[0] === x.rol)?.[1] || x.rol}</td><td>{x.rol === "admin" ? "Todos" : asig(x.id).map(id => <span key={id} className="tag" style={{ marginRight: 4 }}>{proyectos.find(p => p.id === id)?.nombre}</span>)}{x.rol !== "admin" && !asig(x.id).length && <small className="mute">Ninguno</small>}</td><td>{x.activo ? "Activo" : "Desactivado"}</td><td><button className="btn suave chico" onClick={() => setEd({ ...x, proyectos: asig(x.id) })}>Editar</button></td></tr>)}</tbody></table> : <Vacio>Sin usuarios.</Vacio>}</div>
    {ed && <Editar u={ed} onClose={() => setEd(null)} onListo={() => { setEd(null); u.recargar(); }} />}
    {nuevo && <Crear onClose={() => setNuevo(false)} onListo={() => { setNuevo(false); u.recargar(); }} />}</>;
}

function Proyectos({ v, set }: { v: string[]; set: (x: string[]) => void }) {
  const { proyectos } = useApp();
  return <div><b>Proyectos que puede ver</b>{proyectos.map(p => <label key={p.id} className="fila" style={{ padding: "3px 0" }}><input type="checkbox" checked={v.includes(p.id)} onChange={() => set(v.includes(p.id) ? v.filter(x => x !== p.id) : [...v, p.id])} />{p.nombre}</label>)}</div>;
}

function Editar({ u, onClose, onListo }: any) {
  const [f, setF] = useState({ nombre: u.nombre || "", rol: u.rol, activo: u.activo, proyectos: u.proyectos as string[] }), [msg, setMsg] = useState("");
  const guardar = async () => { const { error } = await supabase.rpc("admin_guardar_usuario", { p_user: u.id, p_nombre: f.nombre, p_rol: f.rol, p_activo: f.activo, p_proyectos: f.proyectos }); if (error) setMsg(error.message); else onListo(); };
  return <Modal titulo={"Editar · " + u.email} onClose={onClose}>{msg && <Aviso tipo="mal">{msg}</Aviso>}<Campo l="Nombre"><input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></Campo>
    <Campo l="Rol"><select value={f.rol} onChange={e => setF({ ...f, rol: e.target.value })}>{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Campo>
    <label className="fila"><input type="checkbox" checked={f.activo} onChange={e => setF({ ...f, activo: e.target.checked })} />Usuario activo</label>{f.rol !== "admin" && <Proyectos v={f.proyectos} set={x => setF({ ...f, proyectos: x })} />}<button className="btn" style={{ marginTop: 10 }} onClick={guardar}>Guardar</button></Modal>;
}

function Crear({ onClose, onListo }: any) {
  const [f, setF] = useState({ nombre: "", email: "", clave: "", rol: "socio", proyectos: [] as string[] }), [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false);
  const crear = async () => {
    setMsg(""); if (f.clave.length < 6) return setMsg("La contraseña debe tener al menos 6 caracteres."); setOcup(true);
    try {
      const tmp = clienteTemporal(), { data, error } = await tmp.auth.signUp({ email: f.email.trim(), password: f.clave, options: { data: { nombre: f.nombre } } });
      if (error) throw new Error(error.message); const id = data.user?.id; if (!id || (data.user?.identities && data.user.identities.length === 0)) throw new Error("Ese correo ya está registrado.");
      const { error: e2 } = await supabase.rpc("admin_guardar_usuario", { p_user: id, p_nombre: f.nombre, p_rol: f.rol, p_activo: true, p_proyectos: f.proyectos }); if (e2) throw new Error(e2.message); onListo();
    } catch (e: any) { setMsg(e.message); } setOcup(false);
  };
  return <Modal titulo="Crear usuario" onClose={onClose}>{msg && <Aviso tipo="mal">{msg}</Aviso>}<Campo l="Nombre"><input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></Campo><Campo l="Correo"><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Campo><Campo l="Contraseña inicial"><input type="text" value={f.clave} onChange={e => setF({ ...f, clave: e.target.value })} /></Campo>
    <Campo l="Rol"><select value={f.rol} onChange={e => setF({ ...f, rol: e.target.value })}>{ROLES.filter(r => r[0] !== "pendiente").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Campo>{f.rol !== "admin" && <Proyectos v={f.proyectos} set={x => setF({ ...f, proyectos: x })} />}
    <p className="mute">Para que el usuario pueda entrar de inmediato, en Supabase debe estar desactivada la opción “Confirm email” (paso 3 de la guía).</p><button className="btn" disabled={ocup || !f.email || !f.nombre} onClick={crear}>{ocup ? "Creando…" : "Crear usuario"}</button></Modal>;
}
