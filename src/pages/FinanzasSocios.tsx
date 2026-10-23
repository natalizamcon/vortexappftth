import { useState } from "react";
import { supabase, clienteTemporal } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Vacio, bs, useQuery } from "../lib/ui";
import { Drawer } from "../lib/drawer";
import { todas } from "../lib/datos";

const n = (x: any) => Number(x) || 0;
const aDatos = (p: Promise<any[]>) => p.then(data => ({ data, error: null })).catch(e => ({ data: [] as any[], error: { message: e.message } }));

/** Socios: agregar uno nuevo o existente a una zona (participa en sus utilidades) o a un proyecto (solo lo ve), y quitarlo. */
export function SociosFinanzas() {
  const { zonas, proyectos } = useApp();
  const soc = useQuery(() => supabase.from("profiles").select("id, nombre, email, activo").eq("rol", "socio").order("nombre"), []);
  const pu = useQuery(() => supabase.from("proyecto_usuarios").select("proyecto_id, user_id"), [soc.data]);
  const zs = useQuery(() => supabase.from("zona_socios").select("zona_id, user_id, porcentaje"), [soc.data]);
  const pend = useQuery(() => aDatos(todas(() => supabase.from("liquidacion_socios").select("user_id, monto, liquidaciones!inner(estado)").is("pagado_en", null).eq("liquidaciones.estado", "CONFIRMADA").order("id"))), [soc.data]);
  const [panel, setPanel] = useState<any>(null), [msg, setMsg] = useState(""), [ok, setOk] = useState("");
  if (soc.loading || pu.loading || zs.loading) return <Cargando />;
  const S: any[] = (soc.data as any[]) || [], PU: any[] = (pu.data as any[]) || [], ZS: any[] = (zs.data as any[]) || [], PE: any[] = (pend.data as any[]) || [];
  const nz = (id: string) => zonas.find(z => z.id === id)?.nombre || "—", np = (id: string) => proyectos.find(p => p.id === id)?.nombre || "—";
  const recargar = () => { soc.recargar(); };
  const quitar = async (u: any, tipo: "zona" | "proyecto", id: string) => {
    setMsg(""); setOk(""); const deb = PE.filter(x => x.user_id === u.id).reduce((s, x) => s + n(x.monto), 0), nom = u.nombre || u.email;
    const txt = tipo === "zona" ? `¿Quitar a ${nom} de la zona ${nz(id)}?\n\nYa no participará en sus utilidades. Los repartos anteriores no cambian.` : `¿Quitar a ${nom} del proyecto ${np(id)}?\n\nYa no podrá verlo ni participará en sus zonas. Los repartos anteriores no cambian.`;
    if (!confirm(txt + (deb > 0 ? `\n\nOjo: tiene ${bs(deb)} pendientes de pago de repartos ya confirmados. Eso sigue en el registro de esos repartos.` : ""))) return;
    const { error } = await supabase.rpc("quitar_socio", { p_user: u.id, p_zona: tipo === "zona" ? id : null, p_proyecto: tipo === "proyecto" ? id : null });
    if (error) setMsg(error.message); else { setOk("Socio quitado."); recargar(); }
  };
  return <>
    <div className="fila entre" style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>Socios</h2><button className="btn" onClick={() => setPanel({ user: "" })}>+ Agregar socio</button></div>
    <Aviso>Un socio <b>en una zona</b> participa en sus utilidades con el porcentaje que le des (los porcentajes de una zona suman hasta 100%) y ve el proyecto de esa zona. Un socio <b>en un proyecto</b> solo lo ve, con todas sus zonas. Quitarlo es reversible: puedes volver a agregarlo cuando quieras.</Aviso>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="card tw">{S.length ? <table><thead><tr><th>Socio</th><th>Proyectos que ve</th><th>Participa en (zona · %)</th><th>Pendiente de pago</th><th /></tr></thead>
      <tbody>{S.map(u => { const mis = PU.filter(x => x.user_id === u.id), mz = ZS.filter(x => x.user_id === u.id), deb = PE.filter(x => x.user_id === u.id).reduce((s, x) => s + n(x.monto), 0);
        return <tr key={u.id} style={u.activo === false ? { opacity: 0.55 } : undefined}><td><b>{u.nombre || u.email}</b><br /><small className="mute">{u.email}</small></td>
          <td>{mis.length ? mis.map(x => <span key={x.proyecto_id} className="pill" style={{ marginRight: 4 }}>{np(x.proyecto_id)} <a style={{ cursor: "pointer" }} title="Quitar del proyecto" onClick={() => quitar(u, "proyecto", x.proyecto_id)}>✕</a></span>) : <small className="mute">Ninguno</small>}</td>
          <td>{mz.length ? mz.map(x => <span key={x.zona_id} className="pill acc" style={{ marginRight: 4 }}>{nz(x.zona_id)} · {n(x.porcentaje)}% <a style={{ cursor: "pointer" }} title="Quitar de la zona" onClick={() => quitar(u, "zona", x.zona_id)}>✕</a></span>) : <small className="mute">Ninguna zona</small>}</td>
          <td>{deb > 0 ? <b style={{ color: "var(--warn)" }}>{bs(deb)}</b> : "—"}</td><td><button className="btn suave chico" onClick={() => setPanel({ user: u.id })}>Agregar a…</button></td></tr>; })}</tbody></table> : <Vacio>Aún no hay socios. Agrega el primero con el botón de arriba.</Vacio>}</div>
    {panel && <AgregarSocio socios={S} userInicial={panel.user} ZS={ZS} onClose={() => setPanel(null)} onListo={(t: string) => { setPanel(null); setOk(t); recargar(); }} />}
  </>;
}

function AgregarSocio({ socios, userInicial, ZS, onClose, onListo }: { socios: any[]; userInicial: string; ZS: any[]; onClose: () => void; onListo: (t: string) => void }) {
  const { zonas, proyectos } = useApp();
  const [modo, setModo] = useState(userInicial || socios.length ? "existente" : "nuevo"), [user, setUser] = useState(userInicial || ""), [nuevo, setNuevo] = useState({ nombre: "", email: "", clave: "" });
  const [donde, setDonde] = useState("zona"), [zona, setZona] = useState(""), [proy, setProy] = useState(""), [pct, setPct] = useState("0"), [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false);
  const usado = ZS.filter(x => x.zona_id === zona && x.user_id !== user).reduce((s, x) => s + n(x.porcentaje), 0), libre = Math.max(0, 100 - usado), etiqueta = (z: any) => (proyectos.length > 1 ? `${proyectos.find(p => p.id === z.proyecto_id)?.nombre || ""} › ${z.nombre}` : z.nombre);
  const guardar = async () => {
    setMsg(""); if (donde === "zona" && !zona) return setMsg("Elige la zona."); if (donde === "proyecto" && !proy) return setMsg("Elige el proyecto.");
    if (donde === "zona" && (n(pct) < 0 || n(pct) > libre)) return setMsg(`El porcentaje debe estar entre 0 y ${libre}% (el resto ya está asignado a otros socios de esa zona).`);
    if (modo === "existente" && !user) return setMsg("Elige el socio.");
    if (modo === "nuevo") { if (!nuevo.nombre.trim() || !nuevo.email.trim()) return setMsg("Escribe el nombre y el correo del socio."); if (nuevo.clave.length < 6) return setMsg("La contraseña inicial debe tener al menos 6 caracteres."); }
    setOcup(true);
    try {
      let id = user;
      if (modo === "nuevo") {
        const { data, error } = await clienteTemporal().auth.signUp({ email: nuevo.email.trim(), password: nuevo.clave, options: { data: { nombre: nuevo.nombre.trim() } } });
        if (error) throw new Error(error.message); id = data.user?.id || ""; if (!id || (data.user?.identities && data.user.identities.length === 0)) throw new Error("Ese correo ya está registrado. Elígelo en 'Socio existente' (si ya es socio) o crea el usuario como socio en Configuración → Usuarios.");
      }
      const { error } = await supabase.rpc("agregar_socio", { p: { user_id: id, nombre: modo === "nuevo" ? nuevo.nombre.trim() : null, zona_id: donde === "zona" ? zona : null, proyecto_id: donde === "proyecto" ? proy : null, porcentaje: donde === "zona" ? n(pct) : null } });
      if (error) throw new Error(error.message);
      onListo(donde === "zona" ? "Socio agregado a la zona." : "Socio agregado al proyecto.");
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  return <Drawer titulo={userInicial ? "Agregar socio a una zona o proyecto" : "Agregar socio"} ancho={480} onClose={onClose}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    {!userInicial && <><h3 style={{ marginTop: 0 }}>¿Quién es?</h3><div className="fila" style={{ marginBottom: 8 }}><label className="fila"><input type="radio" checked={modo === "existente"} onChange={() => setModo("existente")} /> Socio existente</label><label className="fila"><input type="radio" checked={modo === "nuevo"} onChange={() => setModo("nuevo")} /> Socio nuevo</label></div></>}
    {modo === "existente" ? <Campo l="Socio"><select value={user} onChange={e => setUser(e.target.value)} disabled={!!userInicial}><option value="">Elige…</option>{socios.map(s => <option key={s.id} value={s.id}>{s.nombre || s.email}</option>)}</select></Campo>
      : <div className="form" style={{ gridTemplateColumns: "1fr" }}><Campo l="Nombre completo"><input value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} /></Campo><Campo l="Correo"><input type="email" value={nuevo.email} onChange={e => setNuevo({ ...nuevo, email: e.target.value })} /></Campo><Campo l="Contraseña inicial"><input type="text" value={nuevo.clave} onChange={e => setNuevo({ ...nuevo, clave: e.target.value })} /></Campo>
        <p className="mute" style={{ margin: 0 }}>Se crea su cuenta y queda como socio. Para que entre de inmediato, en Supabase debe estar desactivada la opción “Confirm email”.</p></div>}
    <h3>¿Dónde?</h3><div className="fila" style={{ marginBottom: 8 }}><label className="fila"><input type="radio" checked={donde === "zona"} onChange={() => setDonde("zona")} /> En una zona</label><label className="fila"><input type="radio" checked={donde === "proyecto"} onChange={() => setDonde("proyecto")} /> En un proyecto</label></div>
    {donde === "zona" ? <div className="form" style={{ gridTemplateColumns: "1fr" }}><Campo l="Zona"><select value={zona} onChange={e => setZona(e.target.value)}><option value="">Elige…</option>{zonas.map(z => <option key={z.id} value={z.id}>{etiqueta(z)}</option>)}</select></Campo>
      <Campo l="Participación en las utilidades de la zona (%)"><input type="number" min={0} max={libre} step="any" value={pct} onChange={e => setPct(e.target.value)} /></Campo>
      {zona && <p className="mute" style={{ margin: 0 }}>Ya asignado a otros socios: {usado}% · disponible: <b>{libre}%</b>. También verá el proyecto de la zona.</p>}</div>
      : <Campo l="Proyecto"><select value={proy} onChange={e => setProy(e.target.value)}><option value="">Elige…</option>{proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>}
    <button className="btn" style={{ width: "100%", marginTop: 12 }} disabled={ocup} onClick={guardar}>{ocup ? "Agregando…" : "Agregar socio"}</button></Drawer>;
}
