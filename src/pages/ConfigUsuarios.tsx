import { useState } from "react";
import { supabase, clienteTemporal } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Vacio, useQuery } from "../lib/ui";
import { Drawer } from "../lib/drawer";
import { MODULOS, matrizDe } from "../lib/permisos";

export const nombreDeRol = (roles: any[], u: any) => roles.find(r => r.clave === (u.rol_clave || u.rol))?.nombre || (u.rol === "pendiente" ? "Sin acceso" : u.rol);

export function ConfigUsuarios() {
  const { proyectos, zonas } = useApp();
  const u = useQuery(() => supabase.from("profiles").select("*").order("creado_en"), []);
  const pu = useQuery(() => supabase.from("proyecto_usuarios").select("*"), [u.data]);
  const uz = useQuery(() => supabase.from("usuario_zonas").select("*"), [u.data]);
  const roles = useQuery(() => supabase.from("roles").select("*").order("sistema", { ascending: false }).order("creado_en"), []);
  const rp = useQuery(() => supabase.from("roles_permisos").select("*"), []);
  const [panel, setPanel] = useState<any>(null), [ok, setOk] = useState("");
  if (u.loading || roles.loading) return <Cargando />;
  const U: any[] = (u.data as any[]) || [], PU: any[] = (pu.data as any[]) || [], UZ: any[] = (uz.data as any[]) || [], R: any[] = (roles.data as any[]) || [];
  const proysDe = (x: any) => x.rol === "admin" ? proyectos.map(p => p.id) : PU.filter(a => a.user_id === x.id).map(a => a.proyecto_id);
  const zonasDe = (x: any) => UZ.filter(a => a.user_id === x.id).map(a => a.zona_id);
  return <>
    <div className="fila" style={{ marginBottom: 10 }}><button className="btn" onClick={() => setPanel({ nuevo: true })}>+ Invitar usuario</button><span className="mute">Los administradores ven todos los usuarios.</span></div>
    {ok && <Aviso tipo="ok">{ok}</Aviso>}{u.error && <Aviso tipo="mal">{u.error}</Aviso>}
    <div className="card tw">{U.length ? <table><thead><tr><th>Usuario</th><th>Rol</th><th>Proyectos</th><th>Zonas</th><th>Estado</th></tr></thead>
      <tbody>{U.map(x => { const zs = zonasDe(x); return <tr key={x.id} className="click" style={x.activo ? undefined : { opacity: 0.55 }} onClick={() => setPanel({ u: x })}>
        <td><b>{x.nombre || x.email}</b><br /><small className="mute">{x.email}</small></td><td><span className="pill">{nombreDeRol(R, x)}</span></td>
        <td>{proysDe(x).length ? proysDe(x).map(id => <span key={id} className="pill" style={{ marginRight: 4 }}>{proyectos.find(p => p.id === id)?.nombre}</span>) : <small className="mute">Ninguno</small>}</td>
        <td>{x.rol === "admin" ? "Todas" : !proysDe(x).length ? "—" : zs.length ? zs.map(id => zonas.find(z => z.id === id)?.nombre).filter(Boolean).join(", ") : "Todas las zonas"}</td><td>{x.activo ? "Activo" : "Inactivo"}</td></tr>; })}</tbody></table> : <Vacio>Sin usuarios.</Vacio>}</div>
    {panel && <PanelUsuario u={panel.u} nuevo={!!panel.nuevo} roles={R} permisos={(rp.data as any[]) || []} PU={PU} UZ={UZ} onClose={() => setPanel(null)} onListo={t => { setPanel(null); setOk(t); u.recargar(); }} />}
  </>;
}

function PanelUsuario({ u, nuevo, roles, permisos, PU, UZ, onClose, onListo }: { u?: any; nuevo: boolean; roles: any[]; permisos: any[]; PU: any[]; UZ: any[]; onClose: () => void; onListo: (t: string) => void }) {
  const { proyectos, zonas, perfil } = useApp();
  const [f, setF] = useState({ nombre: u?.nombre || "", email: u?.email || "", clave: "", telefono: u?.telefono || "", rol: u ? u.rol_clave || (u.rol === "pendiente" ? "pendiente" : u.rol) : "tecnico", activo: u ? (u.activo ? "si" : "no") : "si" });
  const [proys, setProys] = useState<string[]>(u ? PU.filter(a => a.user_id === u.id).map(a => a.proyecto_id) : []), [zs, setZs] = useState<string[]>(u ? UZ.filter(a => a.user_id === u.id).map(a => a.zona_id) : []);
  const [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false);
  const rol = roles.find(r => r.clave === f.rol), base = f.rol === "pendiente" ? "pendiente" : rol?.base || "tecnico", esAdmin = base === "admin", sinAcceso = base === "pendiente";
  const opciones = roles.filter(r => r.activo || r.clave === f.rol);
  const mat = matrizDe(base, permisos.filter(p => p.rol_clave === f.rol)), modulos = MODULOS.filter(([k]) => mat[k]?.ver).map(([, l]) => l);
  const nz = (id: string) => zonas.find(z => z.id === id)?.nombre, np = (id: string) => proyectos.find(p => p.id === id)?.nombre;
  const marcarProy = (id: string, v: boolean) => { setProys(v ? [...proys, id] : proys.filter(x => x !== id)); if (!v) setZs(zs.filter(z => zonas.find(zz => zz.id === z)?.proyecto_id !== id)); };
  const guardar = async () => {
    setMsg(""); if (!f.nombre.trim()) return setMsg("Escribe el nombre.");
    if (nuevo) { if (!f.email.trim()) return setMsg("Escribe el correo."); if (f.clave.length < 6) return setMsg("La contraseña inicial debe tener al menos 6 caracteres."); }
    if (!esAdmin && !sinAcceso && !proys.length && !confirm("Este usuario no tiene ningún proyecto asignado: no verá datos. ¿Guardar así?")) return;
    setOcup(true);
    try {
      let id = u?.id;
      if (nuevo) {
        const { data, error } = await clienteTemporal().auth.signUp({ email: f.email.trim(), password: f.clave, options: { data: { nombre: f.nombre.trim() } } });
        if (error) throw new Error(error.message); id = data.user?.id; if (!id || (data.user?.identities && data.user.identities.length === 0)) throw new Error("Ese correo ya está registrado.");
      }
      const { error } = await supabase.rpc("admin_guardar_usuario2", { p: { user_id: id, nombre: f.nombre.trim(), telefono: f.telefono, rol_clave: f.rol, activo: f.activo === "si", proyectos: proys, zonas: zs } });
      if (error) throw new Error(error.message);
      onListo(nuevo ? "Usuario creado. Ya puede entrar con su correo y la contraseña inicial." : "Cambios guardados.");
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  return <Drawer titulo={nuevo ? "Invitar usuario" : u.nombre || u.email} ancho={480} onClose={onClose}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    <div className="form" style={{ gridTemplateColumns: "1fr" }}>
      <Campo l="Nombre"><input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></Campo>
      <Campo l="Correo"><input type="email" value={f.email} disabled={!nuevo} onChange={e => setF({ ...f, email: e.target.value })} /></Campo>
      {nuevo && <Campo l="Contraseña inicial"><input type="text" value={f.clave} onChange={e => setF({ ...f, clave: e.target.value })} /></Campo>}
      <Campo l="Teléfono"><input type="tel" value={f.telefono} onChange={e => setF({ ...f, telefono: e.target.value })} /></Campo>
      <Campo l="Rol"><select value={f.rol} onChange={e => setF({ ...f, rol: e.target.value })}>{opciones.map(r => <option key={r.clave} value={r.clave}>{r.nombre}{r.activo ? "" : " (sin activar)"}</option>)}<option value="pendiente">Sin acceso</option></select></Campo>
      <Campo l="Estado"><select value={f.activo} onChange={e => setF({ ...f, activo: e.target.value })} disabled={u?.id === perfil?.id}><option value="si">Activo</option><option value="no">Inactivo</option></select></Campo></div>
    {esAdmin && <div className="aviso" style={{ marginTop: 10 }}>Administrador principal: acceso total, no necesita asignación.</div>}
    {sinAcceso && <div className="aviso" style={{ marginTop: 10 }}>Sin acceso: no podrá entrar al sistema hasta que le des un rol.</div>}
    {!esAdmin && !sinAcceso && <><h3>Proyectos y zonas</h3><p className="mute" style={{ marginTop: 0 }}>Marca los proyectos que puede ver. Si no marcas ninguna zona de un proyecto, verá todas sus zonas.</p>
      {proyectos.map(p => { const mias = zonas.filter(z => z.proyecto_id === p.id), on = proys.includes(p.id); return <div key={p.id} style={{ marginBottom: 8 }}><label className="fila"><input type="checkbox" checked={on} onChange={e => marcarProy(p.id, e.target.checked)} /> <b>{p.nombre}</b></label>
        {on && <div style={{ marginLeft: 26 }}>{mias.map(z => <label key={z.id} className="fila" style={{ padding: "2px 0" }}><input type="checkbox" checked={zs.includes(z.id)} onChange={e => setZs(e.target.checked ? [...zs, z.id] : zs.filter(x => x !== z.id))} /> {z.nombre}</label>)}{!mias.length && <small className="mute">Este proyecto aún no tiene zonas.</small>}</div>}</div>; })}</>}
    <div className="aviso" style={{ marginTop: 12 }}><b>Qué verá este usuario</b><br />{esAdmin ? "Todos los proyectos y módulos." : sinAcceso ? "Nada." : <>Proyectos: {proys.length ? proys.map(np).join(", ") : "ninguno"}. Zonas: {proys.length ? (zs.length ? zs.map(nz).join(", ") : "todas las de sus proyectos") : "—"}. Módulos: {["Dashboard", "Centro de alertas", ...modulos].join(", ")}.</>}</div>
    <button className="btn" style={{ width: "100%", marginTop: 12 }} disabled={ocup} onClick={guardar}>{ocup ? "Guardando…" : nuevo ? "Crear usuario" : "Guardar"}</button>
    {nuevo && <p className="mute">Para que pueda entrar de inmediato, en Supabase debe estar desactivada la opción “Confirm email”.</p>}
  </Drawer>;
}
