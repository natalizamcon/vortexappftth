import { useMemo, useState } from "react";
import { Hito, armarHistorial, cap } from "../lib/agenda";
import { Vacio } from "../lib/ui";

const CATS: [string, string][] = [["todo", "Todo"], ["llamadas", "Llamadas"], ["recordatorios", "Recordatorios"], ["cambios", "Cambios"]];

/** Línea de tiempo: se usa dentro de la ficha de un dirigente y, con buscador y fechas, en la pestaña Historial. */
export function LineaTiempo({ hitos, nombreDe, perfilId, nombreContacto, onAbrir, limite = 60 }: { hitos: Hito[]; nombreDe: (id: string) => string; perfilId?: string; nombreContacto?: (id: string) => string; onAbrir?: (id: string) => void; limite?: number }) {
  const [mas, setMas] = useState(limite);
  if (!hitos.length) return <Vacio>Todavía no hay nada en el historial.</Vacio>;
  let diaAnterior = "";
  return <div>{hitos.slice(0, mas).map(h => { const dia = new Date(h.fecha).toLocaleDateString("es-BO", { weekday: "long", day: "numeric", month: "long", year: "numeric" }), nuevoDia = dia !== diaAnterior; diaAnterior = dia;
    return <div key={h.id}>{nuevoDia && <div className="mute" style={{ margin: "10px 0 2px", fontSize: 12 }}>{cap(dia)}</div>}
      <div style={{ borderLeft: "3px solid var(--line)", padding: "3px 0 3px 10px", margin: "2px 0" }}><b>{h.icono} {h.titulo}</b> <small className="mute">{new Date(h.fecha).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}{h.por && h.por !== perfilId ? " · " + nombreDe(h.por) : ""}</small>
        {nombreContacto && <div><small>{onAbrir ? <a href="#/agenda" onClick={e => { e.preventDefault(); onAbrir(h.contacto_id); }}>{nombreContacto(h.contacto_id)}</a> : nombreContacto(h.contacto_id)}</small></div>}
        {h.detalle && <div style={{ whiteSpace: "pre-wrap" }}>{h.detalle}</div>}</div></div>; })}
    {hitos.length > mas && <button className="btn suave chico" style={{ marginTop: 8 }} onClick={() => setMas(m => m + 60)}>Ver más ({hitos.length - mas})</button>}</div>;
}

/** Historial de todos los dirigentes que puedes ver: buscador, tipo y fechas. */
export function Historial({ C, L, Rtodas, E, nombreDe, perfilId, onAbrir, sinEventos }: { C: any[]; L: any[]; Rtodas: any[]; E: any[]; nombreDe: (id: string) => string; perfilId?: string; onAbrir: (id: string) => void; sinEventos?: boolean }) {
  const [q, setQ] = useState(""), [cat, setCat] = useState("todo"), [desde, setDesde] = useState(""), [hasta, setHasta] = useState(""), [quien, setQuien] = useState("");
  const todos = useMemo(() => armarHistorial({ contactos: C, llamadas: L, recordatorios: Rtodas, eventos: E }), [C, L, Rtodas, E]);
  const nombre = (id: string) => C.find(c => c.id === id)?.nombre || "—";
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase(), d0 = desde ? +new Date(desde + "T00:00:00") : 0, d1 = hasta ? +new Date(hasta + "T23:59:59") : Infinity;
    return todos.filter(h => (cat === "todo" || h.categoria === cat) && (!quien || h.contacto_id === quien) && +new Date(h.fecha) >= d0 && +new Date(h.fecha) <= d1 && (!t || [h.titulo, h.detalle, nombre(h.contacto_id)].filter(Boolean).join(" ").toLowerCase().includes(t)));
  }, [todos, q, cat, desde, hasta, quien]);
  return <div style={{ marginTop: 8 }}>
    <div className="fila" style={{ marginBottom: 8 }}><input style={{ flex: "1 1 200px" }} type="search" placeholder="Buscar en el historial…" value={q} onChange={e => setQ(e.target.value)} />
      <select aria-label="Dirigente" value={quien} onChange={e => setQuien(e.target.value)}><option value="">Todos los dirigentes</option>{[...C].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select>
      <label className="fila">Desde <input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></label><label className="fila">Hasta <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></label></div>
    <div className="fila" style={{ marginBottom: 6, gap: 4 }}>{CATS.map(([k, l]) => <button key={k} className={"btn chico " + (cat === k ? "" : "suave")} onClick={() => setCat(k)}>{l}</button>)}<span className="mute">{lista.length} {lista.length === 1 ? "registro" : "registros"}</span></div>
    {sinEventos && <p className="mute" style={{ margin: "0 0 6px" }}>Para ver también los cambios de estado, de datos y a quién se compartió, corre <b>28_agenda_historial.sql</b> en Supabase.</p>}
    <div className="card"><LineaTiempo hitos={lista} nombreDe={nombreDe} perfilId={perfilId} nombreContacto={nombre} onAbrir={onAbrir} /></div></div>;
}
