import { useState } from "react";
import { useApp } from "../lib/auth";
import { Aviso, Cargando, Kpi, Tabs, Vacio } from "../lib/ui";
import { Alerta, PESO, Prioridad, RESPONSABLE_ORDEN, ROLES_REGLAS, TIPOS, useAlertas } from "../lib/alertas";

export const PRIORIDAD: Record<Prioridad, { nombre: string; clase: string }> = { critica: { nombre: "Crítica", clase: "crit" }, alta: { nombre: "Alta", clase: "alta" }, media: { nombre: "Media", clase: "media" }, baja: { nombre: "Baja", clase: "baja" } };
export const Prio = ({ p }: { p: string }) => { const x = PRIORIDAD[p as Prioridad] || PRIORIDAD.media; return <span className={"pill " + x.clase}>{x.nombre}</span>; };

/** Tarjeta resumida (la usa el Dashboard). */
export function TarjetaAlerta({ a }: { a: Alerta }) {
  return <div className="card" style={{ borderLeft: "5px solid " + (a.prioridad === "critica" ? "var(--bad)" : a.prioridad === "alta" ? "#c4651a" : "var(--warn)") }}>
    <div className="fila entre"><div className="fila"><Prio p={a.prioridad} /><span className="mute">{a.area}</span></div><a className="btn suave chico" href={"#/" + a.ruta}>Ir a resolver</a></div>
    <h2 style={{ margin: "8px 0 4px" }}>{a.descripcion}</h2>{a.detalle.length > 0 && <ul style={{ margin: 0, paddingLeft: 18 }}>{a.detalle.slice(0, 4).map((d, i) => <li key={i}>{d}</li>)}</ul>}
  </div>;
}

export default function Alertas() {
  const { alertas, historial, cargando, actualizadaA, recargar } = useAlertas();
  const [tab, setTab] = useState("activas");
  return <>
    <div className="fila entre"><h1>Centro de alertas</h1><span className="fila"><small className="mute">{actualizadaA ? "Actualizado " + actualizadaA.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" }) : ""}</small><button className="btn suave chico" disabled={cargando} onClick={recargar}>{cargando ? "Actualizando…" : "Actualizar"}</button></span></div>
    <Tabs items={[["activas", `Activas (${alertas.length})`], ["historial", `Historial (${historial.length})`], ["reglas", "Destinatarios y reglas"]]} valor={tab} onChange={setTab} />
    {tab === "activas" && <Activas />}{tab === "historial" && <Historial />}{tab === "reglas" && <Reglas />}
  </>;
}

function Activas() {
  const { alertas, cargando, marcar, rolesDe } = useAlertas(), { zonas, proyectos } = useApp();
  const [fp, setFp] = useState(""), [ft, setFt] = useState(""), [nota, setNota] = useState(""), [msg, setMsg] = useState("");
  const k = (p: Prioridad) => alertas.filter(a => a.prioridad === p).length;
  const lista = alertas.filter(a => (!fp || a.prioridad === fp) && (!ft || a.tipo === ft)).sort((a, b) => PESO[a.prioridad] - PESO[b.prioridad] || a.fecha.localeCompare(b.fecha));
  const responsable = (tipo: string) => { const r = rolesDe(tipo), x = RESPONSABLE_ORDEN.find(y => r.includes(y)); return x ? ROLES_REGLAS.find(z => z[0] === x)![1] : "Administrador"; };
  const accion = async (a: Alerta, estado: "REVISADA" | "RESUELTA") => { setMsg(""); const e = await marcar(a, estado, nota); if (e) setMsg(e); else setNota(""); };
  return <>
    <div className="grid gk" style={{ marginBottom: 14 }}><Kpi t="Crítica" v={k("critica")} c={k("critica") ? "var(--bad)" : undefined} /><Kpi t="Alta" v={k("alta")} c={k("alta") ? "#c4651a" : undefined} /><Kpi t="Media" v={k("media")} /><Kpi t="Baja" v={k("baja")} /></div>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}
    <div className="card tw"><div className="fila" style={{ marginBottom: 10 }}>
      <select value={fp} onChange={e => setFp(e.target.value)}><option value="">Todas las prioridades</option>{(Object.keys(PRIORIDAD) as Prioridad[]).map(p => <option key={p} value={p}>{PRIORIDAD[p].nombre}</option>)}</select>
      <select value={ft} onChange={e => setFt(e.target.value)}><option value="">Todos los tipos</option>{TIPOS.map(t => <option key={t.clave} value={t.clave}>{t.nombre}</option>)}</select>
      <input placeholder="Nota opcional al revisar o resolver" value={nota} onChange={e => setNota(e.target.value)} style={{ flex: 1, minWidth: 220 }} /></div>
      {cargando && !alertas.length ? <Cargando /> : lista.length ? <table><thead><tr><th>Prioridad</th><th>Fecha</th><th>Proyecto</th><th>Zona</th><th>Descripción</th><th>Responsable</th><th /></tr></thead>
        <tbody>{lista.map(a => <tr key={a.id}><td><Prio p={a.prioridad} /></td><td style={{ whiteSpace: "nowrap" }}>{a.fecha}</td><td>{proyectos.find(p => p.id === a.proyecto_id)?.nombre || "—"}</td><td>{zonas.find(z => z.id === a.zona_id)?.nombre || "—"}</td>
          <td>{a.descripcion}{a.detalle.length > 0 && <details><summary className="mute" style={{ cursor: "pointer", fontSize: 12 }}>Ver detalle</summary><ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{a.detalle.map((d, i) => <li key={i}>{d}</li>)}</ul></details>}</td><td>{responsable(a.tipo)}</td>
          <td><div className="fila" style={{ flexWrap: "nowrap" }}><a className="btn suave chico" href={"#/" + a.ruta}>Abrir →</a><button className="btn suave chico" onClick={() => accion(a, "REVISADA")}>Revisada</button><button className="btn suave chico" onClick={() => accion(a, "RESUELTA")}>Resolver</button></div></td></tr>)}</tbody></table>
        : <Vacio>{alertas.length ? "No hay alertas con ese filtro." : "Todo en orden: no hay alertas por ahora."}</Vacio>}</div>
  </>;
}

function Historial() {
  const { historial, reabrir } = useAlertas(), { zonas, proyectos } = useApp(), [msg, setMsg] = useState("");
  return <><div className="card tw"><h2>Historial de alertas</h2>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    {historial.length ? <table><thead><tr><th>Cuándo</th><th>Estado</th><th>Prioridad</th><th>Proyecto</th><th>Zona</th><th>Descripción</th><th>Nota</th><th>Quién</th><th /></tr></thead>
      <tbody>{historial.map(h => <tr key={h.clave}><td style={{ whiteSpace: "nowrap" }}>{String(h.fecha).slice(0, 16).replace("T", " ")}</td><td><span className={"pill " + (h.estado === "RESUELTA" ? "ok" : "acc")}>{h.estado === "RESUELTA" ? "Resuelta" : "Revisada"}</span></td><td><Prio p={h.prioridad} /></td>
        <td>{proyectos.find(p => p.id === h.proyecto_id)?.nombre || "—"}</td><td>{zonas.find(z => z.id === h.zona_id)?.nombre || "—"}</td><td>{h.descripcion}</td><td>{h.nota || "—"}</td><td>{h.usuario_nombre || "—"}</td>
        <td><button className="btn suave chico" onClick={async () => setMsg(await reabrir(h.clave))}>Reabrir</button></td></tr>)}</tbody></table> : <p className="mute">Aún no se ha revisado ni resuelto ninguna alerta.</p>}</div></>;
}

function Reglas() {
  const { rolesDe, guardarRegla } = useAlertas(), { perfil } = useApp(), admin = perfil?.rol === "admin", [msg, setMsg] = useState("");
  const alternar = async (tipo: string, rol: string, valor: boolean) => { setMsg(""); const actual = rolesDe(tipo), nuevo = valor ? [...actual, rol] : actual.filter(x => x !== rol); setMsg(await guardarRegla(tipo, nuevo)); };
  const fila = (t: typeof TIPOS[number]) => <tr key={t.clave}><td>{t.nombre}</td><td>{t.cuando}</td><td>{t.prioridad}</td><td style={{ textAlign: "center" }}><input type="checkbox" checked disabled /></td>
    {ROLES_REGLAS.map(([rol]) => <td key={rol} style={{ textAlign: "center" }}><input type="checkbox" disabled={!admin} checked={rolesDe(t.clave).includes(rol)} onChange={e => alternar(t.clave, rol, e.target.checked)} /></td>)}</tr>;
  return <div className="card tw"><h2>Quién recibe cada alerta</h2>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    <table className="reglas"><thead><tr><th>Alerta</th><th>Se genera cuando</th><th>Prioridad</th><th style={{ textAlign: "center" }}>Administrador</th>{ROLES_REGLAS.map(([k, l]) => <th key={k} style={{ textAlign: "center" }}>{l}</th>)}</tr></thead>
      <tbody>{TIPOS.filter(t => !t.extra).map(fila)}<tr className="subtitulo"><td colSpan={4 + ROLES_REGLAS.length}>Otras alertas del sistema</td></tr>{TIPOS.filter(t => t.extra).map(fila)}</tbody></table>
    <p className="mute" style={{ margin: "10px 0 0" }}>Solo los administradores cambian esta tabla. Cada usuario ve únicamente las alertas de sus proyectos asignados.</p></div>;
}
