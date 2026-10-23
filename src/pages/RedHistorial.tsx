import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { aPapelera } from "../lib/papelera";
import { Aviso, Campo, Cargando, Kpi, Vacio, bs, hoy, useAlcance, useQuery } from "../lib/ui";
import { todas } from "../lib/datos";

const n = (x: any) => Number(x) || 0;
const TIPOS_MANUALES = ["Starlink agregada", "OLT cambiada o mejorada", "Equipo cambiado", "Cambio de proveedor", "Mejora de la red", "Otro"];
const PROVEEDORES = ["Digicorp", "Entel", "Tigo", "Viva", "Otro"];
const colorTipo = (t: string) => ({ "Socio agregado": "ok", "Socio quitado": "bad", "Socio cambiado de proyecto": "warn", "Mantenimiento": "", "Viaje": "acc", "Instalación": "ok", "Baja": "bad", "Costo de red": "warn", "Troncal nueva": "acc", "NAP nueva": "acc", "OLT registrada": "acc", "Ampliación de red": "acc" } as Record<string, string>)[t] ?? "";


/** Socios con acceso al proyecto de la zona: agregar, quitar o pasar a otro proyecto. Cada cambio queda en el historial. */
function SociosProyecto({ zona, onCambio }: { zona: any; onCambio: () => void }) {
  const { proyectos } = useApp();
  const pu = useQuery(() => supabase.from("proyecto_usuarios").select("user_id").eq("proyecto_id", zona.proyecto_id), [zona.proyecto_id]);
  const socios = useQuery(() => supabase.from("profiles").select("id, nombre, email").eq("rol", "socio").eq("activo", true).order("nombre"), []);
  const [nuevo, setNuevo] = useState(""), [dest, setDest] = useState<Record<string, string>>({}), [msg, setMsg] = useState(""), [ok, setOk] = useState("");
  const S: any[] = (socios.data as any[]) || [], ids = ((pu.data as any[]) || []).map(x => x.user_id), con = S.filter(x => ids.includes(x.id)), sin = S.filter(x => !ids.includes(x.id));
  const proy = proyectos.find(p => p.id === zona.proyecto_id), otros = proyectos.filter(p => p.id !== zona.proyecto_id);
  const accion = async (user: string, acc: string, destino?: string) => {
    setMsg(""); setOk("");
    const { error } = await supabase.rpc("gestionar_socio_zona", { p_zona: zona.id, p_user: user, p_accion: acc, p_proyecto_destino: destino || null });
    if (error) return setMsg(error.message);
    setOk(acc === "AGREGAR" ? "Socio agregado." : acc === "QUITAR" ? "Socio quitado." : "Socio cambiado de proyecto."); setNuevo(""); pu.recargar(); onCambio();
  };
  return <div className="card"><h2>Socios del proyecto {proy ? "“" + proy.nombre + "”" : ""}</h2>
    <p className="mute" style={{ marginTop: 0 }}>Un socio ve únicamente los proyectos a los que lo agregues (con todas sus zonas). Para que vea solo una zona, esa zona debe estar en un proyecto propio. Cada cambio se anota en el historial.</p>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    {pu.loading || socios.loading ? <Cargando /> : <>
      {con.length ? <div className="tw"><table style={{ minWidth: 0 }}><thead><tr><th>Socio</th><th>Cambiar a otro proyecto</th><th /></tr></thead>
        <tbody>{con.map(x => <tr key={x.id}><td><b>{x.nombre || x.email}</b><br /><small className="mute">{x.email}</small></td>
          <td><div className="fila"><select value={dest[x.id] || ""} onChange={e => setDest({ ...dest, [x.id]: e.target.value })}><option value="">Elige un proyecto…</option>{otros.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>
            <button className="btn suave chico" disabled={!dest[x.id]} onClick={() => confirm(`¿Pasar a ${x.nombre || x.email} al proyecto elegido? Dejará de ver este proyecto.`) && accion(x.id, "CAMBIAR", dest[x.id])}>Cambiar</button></div></td>
          <td><button className="btn suave chico" onClick={() => confirm(`¿Quitar a ${x.nombre || x.email} de este proyecto? Ya no podrá verlo.`) && accion(x.id, "QUITAR")}>Quitar</button></td></tr>)}</tbody></table></div> : <Vacio>Ningún socio ve este proyecto todavía.</Vacio>}
      <div className="fila" style={{ marginTop: 10 }}>{sin.length ? <><select value={nuevo} onChange={e => setNuevo(e.target.value)}><option value="">Agregar un socio…</option>{sin.map(x => <option key={x.id} value={x.id}>{x.nombre || x.email}</option>)}</select><button className="btn" disabled={!nuevo} onClick={() => accion(nuevo, "AGREGAR")}>Agregar</button></> : <span className="mute">No hay más usuarios con rol Socio. Créalos en Configuración → Usuarios y socios.</span>}</div></>}</div>;
}

export function HistorialRed() {
  const { zonas, zonaId, proyectoId, perfil } = useApp(), al = useAlcance(), zona = zonas.find(z => z.id === zonaId);
  const q = useQuery(() => al(supabase.from("v_historial_red").select("*").order("fecha", { ascending: false }).limit(800)), [proyectoId, zonaId]);
  const inst = useQuery(() => todas(() => al(supabase.from("clientes").select("precio_instalacion").not("fecha_instalacion", "is", null).order("id"))).then(data => ({ data, error: null })).catch(e => ({ data: null, error: { message: e.message } })), [proyectoId, zonaId]);
  const vacio = { tipo: TIPOS_MANUALES[0], fecha: hoy(), descripcion: "", monto: "0", proveedor: "Digicorp", mensual: "0" };
  const [f, setF] = useState(vacio), [filtro, setFiltro] = useState(""), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false);
  const H: any[] = (q.data as any[]) || [], tipos = Array.from(new Set(H.map(x => x.tipo))).sort(), V = H.filter(x => !filtro || x.tipo === filtro);
  const costo = H.reduce((s, x) => s + n(x.monto), 0), ingresos = ((inst.data as any[]) || []).reduce((s, x) => s + n(x.precio_instalacion), 0);

  const guardar = async () => {
    setMsg(""); setOk(""); if (!zona) return setMsg("Elige una zona arriba.");
    if (!f.descripcion.trim()) return setMsg("Escribe una descripción (por ejemplo: segunda Starlink, OLT de 16 PON).");
    setOcup(true);
    try {
      const { error } = await supabase.from("historial_red").insert({ proyecto_id: zona.proyecto_id, zona_id: zona.id, fecha: f.fecha, tipo: f.tipo, descripcion: f.descripcion.trim(), monto: n(f.monto), proveedor: f.proveedor });
      if (error) throw new Error(error.message);
      if (n(f.mensual) > 0) { const r = await supabase.from("costos_fijos").insert({ proyecto_id: zona.proyecto_id, zona_id: zona.id, concepto: f.descripcion.trim(), cantidad: 1, monto_unitario: n(f.mensual) }); if (r.error) throw new Error(r.error.message); }
      setF(vacio); setOk(n(f.mensual) > 0 ? "Agregado al historial y a los costos fijos de la zona." : "Agregado al historial."); q.recargar();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  const quitar = async (x: any) => { if (!confirm("¿Mandar este registro a la papelera? Podrás recuperarlo desde Configuración → Papelera.")) return; try { await aPapelera("historial_red", [x.id]); q.recargar(); } catch (e: any) { setMsg(e.message); } };
  const nz = (id: string) => zonas.find(z => z.id === id)?.nombre || "";

  return <>
    <div className="grid gk" style={{ marginBottom: 14 }}><Kpi t="Eventos registrados" v={H.length} /><Kpi t="Costo acumulado de la red" v={bs(costo)} /><Kpi t="Ingresos por instalaciones" v={bs(ingresos)} s="Según el precio de instalación de cada cliente" /></div>
    <div className="grid" style={{ gridTemplateColumns: "minmax(300px, 4fr) minmax(320px, 6fr)", alignItems: "start" }}>
      <div className="card"><h2>Registrar un cambio de la red{zona ? " · " + zona.nombre : ""}</h2>
        {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
        <div className="form" style={{ gridTemplateColumns: "1fr" }}>
          <Campo l="Qué se hizo"><select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>{TIPOS_MANUALES.map(t => <option key={t}>{t}</option>)}</select></Campo>
          <Campo l="Fecha"><input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></Campo>
          <Campo l="Descripción (ej. segunda Starlink, OLT de 16 PON)"><input value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })} /></Campo>
          <Campo l="Costo (Bs)"><input type="number" min={0} step={0.01} value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} /></Campo>
          <Campo l="Proveedor"><input list="prov-red" value={f.proveedor} onChange={e => setF({ ...f, proveedor: e.target.value })} /><datalist id="prov-red">{PROVEEDORES.map(p => <option key={p} value={p} />)}</datalist></Campo>
          <Campo l="Costo mensual del servicio (Bs, se suma a los costos fijos)"><input type="number" min={0} step={0.01} value={f.mensual} onChange={e => setF({ ...f, mensual: e.target.value })} /></Campo>
        </div><button className="btn" style={{ width: "100%" }} disabled={ocup || !zona} onClick={guardar}>{ocup ? "Guardando…" : "Agregar al historial"}</button>
        {!zona && <p className="mute">Elige una zona arriba para poder registrar.</p>}</div>

      <div className="card tw"><div className="fila entre"><h2>Historial de la red{zona ? " · " + zona.nombre : ""}</h2>
        <select value={filtro} onChange={e => setFiltro(e.target.value)}><option value="">Todo</option>{tipos.map(t => <option key={t}>{t}</option>)}</select></div>
        {q.loading ? <Cargando /> : V.length ? <table><thead><tr><th>Fecha</th><th>Qué pasó</th><th>Detalle</th><th>Monto</th><th>Origen</th><th /></tr></thead>
          <tbody>{V.map(x => <tr key={x.fuente + x.id}><td style={{ whiteSpace: "nowrap" }}>{x.fecha}</td><td><span className={"pill " + colorTipo(x.tipo)}>{x.tipo}</span></td><td>{x.detalle || "—"}{!zona && <><br /><small className="mute">{nz(x.zona_id)}</small></>}</td>
            <td style={{ color: n(x.monto) > 0 ? "var(--bad)" : undefined, whiteSpace: "nowrap" }}>{n(x.monto) > 0 ? "−" + bs(x.monto) : "—"}</td><td>{x.origen}</td>
            <td>{x.fuente === "historial" && x.origen === "Manual" && <button className="btn suave chico" onClick={() => quitar(x)}>Quitar</button>}</td></tr>)}</tbody></table> : <Vacio>Aún no hay cambios registrados.</Vacio>}
        <p className="mute" style={{ marginTop: 10 }}>Instalaciones, bajas, mantenimientos, viajes, costos de red, nuevas NAP o troncales y los cambios de socios se anotan solos. Los cambios de equipos (Starlink, OLT) se registran a mano.</p></div>
    </div>
    {zona && perfil?.rol === "admin" && <SociosProyecto zona={zona} onCambio={q.recargar} />}
  </>;
}
