import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Aviso, Campo, Cargando, Modal, useQuery } from "../lib/ui";
import { ACCIONES, MODULOS, Matriz, matrizDe } from "../lib/permisos";

const BASES: [string, string][] = [["socio", "Socio"], ["supervisor", "Supervisor técnico"], ["tecnico", "Técnico"], ["cobranzas", "Cobranzas"], ["almacen", "Almacén"], ["financiero", "Financiero"]];

export function ConfigRoles() {
  const roles = useQuery(() => supabase.from("roles").select("*").order("sistema", { ascending: false }).order("creado_en"), []);
  const rp = useQuery(() => supabase.from("roles_permisos").select("*"), []);
  const [sel, setSel] = useState("socio"), [nuevo, setNuevo] = useState(false), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false);
  const R: any[] = (roles.data as any[]) || [], rol = R.find(r => r.clave === sel) || R[0];
  const [nombre, setNombre] = useState(""), [activo, setActivo] = useState(true), [mat, setMat] = useState<Matriz>({});
  useEffect(() => { if (!rol) return; setNombre(rol.nombre); setActivo(!!rol.activo); setMat(matrizDe(rol.base, ((rp.data as any[]) || []).filter(x => x.rol_clave === rol.clave))); setMsg(""); setOk(""); }, [rol?.clave, roles.data, rp.data]);
  if (roles.loading) return <Cargando />;
  if (!rol) return <Aviso tipo="mal">No se pudieron cargar los roles. ¿Ejecutaste el archivo 18 de Supabase?</Aviso>;
  const admin = rol.clave === "admin";
  const alternar = (m: string, a: string, v: boolean) => setMat(x => { const f = { ...x[m], [a]: v } as any; if (a === "ver" && !v) { f.crear = f.editar = f.eliminar = false; } if (a !== "ver" && v) f.ver = true; return { ...x, [m]: f }; });
  const guardar = async () => {
    setMsg(""); setOk(""); if (!nombre.trim()) return setMsg("Escribe el nombre del rol."); setOcup(true);
    try {
      const a = await supabase.from("roles").update({ nombre: nombre.trim(), activo: admin ? true : activo }).eq("clave", rol.clave); if (a.error) throw new Error(a.error.message);
      if (!admin) { const b = await supabase.from("roles_permisos").upsert(MODULOS.map(([k]) => ({ rol_clave: rol.clave, modulo: k, ver: !!mat[k]?.ver, crear: !!mat[k]?.crear, editar: !!mat[k]?.editar, eliminar: !!mat[k]?.eliminar })), { onConflict: "rol_clave,modulo" }); if (b.error) throw new Error(b.error.message); }
      setOk("Cambios guardados."); roles.recargar(); rp.recargar();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  return <div className="grid" style={{ gridTemplateColumns: "minmax(200px, 1fr) minmax(0, 4fr)", alignItems: "start" }}>
    <div className="card"><h2>Roles</h2>
      {R.map(r => <button key={r.clave} onClick={() => setSel(r.clave)} style={{ display: "block", width: "100%", textAlign: "left", marginBottom: 6, padding: "8px 10px", borderRadius: 8, border: r.clave === rol.clave ? "1px solid var(--lil)" : "1px solid transparent", background: r.clave === rol.clave ? "var(--lilb)" : "transparent", cursor: "pointer", font: "inherit", color: "var(--ink)" }}>{r.nombre}<br /><small className="mute">{r.activo ? "Activo" : "Disponible, sin activar"}{!r.sistema ? " · propio" : ""}</small></button>)}
      <button className="btn suave" style={{ width: "100%" }} onClick={() => setNuevo(true)}>+ Crear rol</button></div>
    <div className="card">{msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
      <div className="fila"><input value={nombre} onChange={e => setNombre(e.target.value)} style={{ flex: 1, fontWeight: 700 }} /><label className="fila"><input type="checkbox" checked={activo} disabled={admin} onChange={e => setActivo(e.target.checked)} /> Rol activo</label></div>
      <p className="mute">Alcance: {admin ? "Todos los proyectos." : "Solo proyectos asignados."}{!rol.sistema ? ` Funciona como "${BASES.find(b => b[0] === rol.base)?.[1]}" en la base de datos.` : ""}</p>
      <div className="tw"><table><thead><tr><th>Módulo</th>{ACCIONES.map(([k, l]) => <th key={k} style={{ textAlign: "center" }}>{l}</th>)}</tr></thead>
        <tbody>{MODULOS.map(([m, l]) => <tr key={m}><td>{l}</td>{ACCIONES.map(([a]) => <td key={a} style={{ textAlign: "center" }}><input type="checkbox" disabled={admin} checked={admin || !!mat[m]?.[a]} onChange={e => alternar(m, a, e.target.checked)} /></td>)}</tr>)}</tbody></table></div>
      <div className="fila" style={{ marginTop: 10 }}><button className="btn" disabled={ocup} onClick={guardar}>{ocup ? "Guardando…" : "Guardar cambios"}</button></div>
      <p className="mute" style={{ margin: "8px 0 0" }}>“Ver” controla qué módulos aparecen en el menú. “Eliminar” controla quién puede mandar cosas a la papelera, y “Crear” y “Editar” controlan las tablas editables. Los datos que cada rol puede leer o escribir los sigue limitando la base de datos según su rol de base.</p></div>
    {nuevo && <NuevoRol onClose={() => setNuevo(false)} onListo={c => { setNuevo(false); setSel(c); roles.recargar(); }} />}
  </div>;
}

function NuevoRol({ onClose, onListo }: { onClose: () => void; onListo: (clave: string) => void }) {
  const [nombre, setNombre] = useState(""), [base, setBase] = useState("tecnico"), [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false);
  const crear = async () => {
    setMsg(""); const n = nombre.trim(); if (!n) return setMsg("Escribe el nombre del rol.");
    const clave = "r_" + n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) + "_" + Math.random().toString(36).slice(2, 5);
    setOcup(true);
    const a = await supabase.from("roles").insert({ clave, nombre: n, base, activo: true, sistema: false }); if (a.error) { setOcup(false); return setMsg(a.error.message); }
    const m = matrizDe(base, []); const b = await supabase.from("roles_permisos").insert(MODULOS.map(([k]) => ({ rol_clave: clave, modulo: k, ...m[k] }))); setOcup(false);
    if (b.error) return setMsg(b.error.message); onListo(clave);
  };
  return <Modal titulo="Crear rol" onClose={onClose}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    <div className="form"><Campo l="Nombre del rol"><input autoFocus value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Asesor comercial" /></Campo>
      <Campo l="Se parece a"><select value={base} onChange={e => setBase(e.target.value)}>{BASES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Campo></div>
    <p className="mute">El rol nuevo empieza con los permisos del rol que elijas y luego los ajustas. En la base de datos se comporta como ese rol.</p>
    <button className="btn" disabled={ocup} onClick={crear}>{ocup ? "Creando…" : "Crear rol"}</button></Modal>;
}
