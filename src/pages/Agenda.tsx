import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Cargando, Tabs, Vacio, useQuery } from "../lib/ui";
import { ATAJOS, Atajo, COLOR_ESTADO, ESTADOS, ICONO_REC, aLocalInput, agrupar, deLocalInput, etiquetaFecha, fechaAtajo, finDia, linkCalendario, linkLlamar, linkMapa, linkWhatsApp } from "../lib/agenda";
import { FichaContacto, FormContacto, cambioAgenda } from "./AgendaContacto";

const aDatos = (p: any) => Promise.resolve(p).then((r: any) => r);

/** Numerito del menú: recordatorios tuyos que ya tocan o están atrasados. */
export function ContadorAgenda() {
  const { perfil } = useApp(), [n, setN] = useState(0);
  useEffect(() => {
    let vivo = true; const cargar = () => { if (!perfil?.id) return; Promise.resolve(supabase.from("agenda_recordatorios").select("id").eq("hecho", false).eq("creado_por", perfil.id).lte("fecha_hora", finDia(new Date()).toISOString()).limit(99)).then((r: any) => { if (vivo) setN(((r?.data as any[]) || []).length); }); };
    cargar(); const t = setInterval(cargar, 60000); addEventListener("agenda-cambio", cargar);
    return () => { vivo = false; clearInterval(t); removeEventListener("agenda-cambio", cargar); };
  }, [perfil?.id]);
  return n ? <span style={{ marginLeft: 6, background: "var(--bad)", color: "#fff", borderRadius: 99, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{n}</span> : null;
}

/** Agenda de dirigentes: números, zonas, llamadas y recordatorios. Cada dirigente es privado de quien lo anotó y solo se comparte con quien él elija. */
export default function Agenda() {
  const { perfil, zonas } = useApp();
  const [tab, setTab] = useState("hoy"), [abierto, setAbierto] = useState<string | null>(null), [nuevo, setNuevo] = useState(false), [msg, setMsg] = useState(""), [ok, setOk] = useState("");
  const contactos = useQuery(() => aDatos(supabase.from("agenda_contactos").select("*").order("actualizado_en", { ascending: false }).limit(1000)), []);
  const recs = useQuery(() => aDatos(supabase.from("agenda_recordatorios").select("*").eq("hecho", false).order("fecha_hora", { ascending: true }).limit(500)), []);
  const comp = useQuery(() => aDatos(supabase.from("agenda_compartido").select("*").limit(2000)), []);
  const per = useQuery(() => aDatos(supabase.rpc("agenda_personas")), []);
  const C: any[] = (contactos.data as any[]) || [], R: any[] = (recs.data as any[]) || [], K: any[] = (comp.data as any[]) || [], P: any[] = (per.data as any[]) || [];
  const recargar = () => { contactos.recargar(); recs.recargar(); comp.recargar(); per.recargar(); }, ref = useRef(recargar); ref.current = recargar;
  /** Lo que te comparten otras personas aparece solo: se actualiza cada minuto y cuando vuelves a esta pantalla. */
  useEffect(() => { const t = setInterval(() => ref.current(), 60000), v = () => { if (document.visibilityState === "visible") ref.current(); }; document.addEventListener("visibilitychange", v); return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); }; }, []);
  const primera = (contactos.loading && contactos.data === null) || (recs.loading && recs.data === null);
  const faltaSql = [contactos.error, recs.error].some(e => /relation|does not exist|schema cache/i.test(String(e)));
  const nombreDe = (id: string) => (id === perfil?.id ? "ti" : P.find(p => p.id === id)?.nombre || P.find(p => p.id === id)?.email || "otra cuenta");
  const zonasConocidas = useMemo(() => Array.from(new Set([...zonas.map(z => z.nombre), ...C.map(c => c.zona).filter(Boolean)])).sort() as string[], [zonas.length, C.length]);
  const abrir = C.find(c => c.id === abierto);

  return <>
    <h1>Agenda</h1>
    <p className="mute" style={{ marginTop: -6 }}>Anota a los dirigentes que vas consiguiendo: su número, zona, ubicación, tus llamadas y los recordatorios para llamar o viajar a las reuniones. <b>Es privada:</b> cada dirigente lo ves solo tú, y lo compartes únicamente con quien elijas.</p>
    {faltaSql && <Aviso tipo="mal">⚠️ Falta activar la Agenda en la base de datos: en Supabase → SQL Editor corre <b>27_agenda.sql</b> y recarga la página.</Aviso>}
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="fila entre"><Tabs items={[["hoy", "Hoy y lo que viene"], ["dirigentes", `Dirigentes (${C.length})`]]} valor={tab} onChange={setTab} /><span className="fila"><button className="btn suave chico" onClick={recargar} title="Ver lo más reciente">🔄 Actualizar</button><button className="btn mor" onClick={() => setNuevo(true)}>➕ Nuevo dirigente</button></span></div>
    {tab === "hoy" && <Hoy R={R} C={C} K={K} perfilId={perfil?.id} nombreDe={nombreDe} cargando={primera} onCambio={() => { recs.recargar(); cambioAgenda(); }} onAbrir={setAbierto} setMsg={setMsg} setOk={setOk} />}
    {tab === "dirigentes" && <Dirigentes C={C} R={R} K={K} perfilId={perfil?.id} nombreDe={nombreDe} cargando={primera} zonasConocidas={zonasConocidas} onAbrir={setAbierto} />}
    {nuevo && <FormContacto zonasConocidas={zonasConocidas} onClose={() => setNuevo(false)} onListo={(id, otro) => { recargar(); if (!otro) { setNuevo(false); setTab("dirigentes"); setAbierto(id); } else setOk("Dirigente guardado. Puedes anotar otro."); }} />}
    {abrir && <FichaContacto c={abrir} personas={P} comp={K} zonasConocidas={zonasConocidas} onClose={() => setAbierto(null)} onCambio={recargar} />}
  </>;
}

/* ---------------- Hoy ---------------- */
function Hoy({ R, C, K, perfilId, nombreDe, cargando, onCambio, onAbrir, setMsg, setOk }: any) {
  const [general, setGeneral] = useState(false), [g, setG] = useState({ titulo: "", fecha: aLocalInput(fechaAtajo("manana")) });
  const grupos = agrupar(R as any[]);
  const quien = (id: string) => C.find((c: any) => c.id === id);
  const hecho = async (x: any) => { const { error } = await supabase.from("agenda_recordatorios").update({ hecho: true, hecho_en: new Date().toISOString() }).eq("id", x.id); if (error) setMsg(error.message); else { setOk("¡Hecho!"); onCambio(); } };
  const posponer = async (x: any, a: string) => { if (!a) return; const { error } = await supabase.from("agenda_recordatorios").update({ fecha_hora: fechaAtajo(a as Atajo).toISOString() }).eq("id", x.id); if (error) setMsg(error.message); else { setOk("Pospuesto."); onCambio(); } };
  const crearGeneral = async () => { if (!g.titulo.trim()) return setMsg("Escribe qué quieres recordar."); const { error } = await supabase.from("agenda_recordatorios").insert({ contacto_id: null, tipo: "Otro", titulo: g.titulo.trim(), fecha_hora: deLocalInput(g.fecha) }); if (error) return setMsg(error.message); setG({ ...g, titulo: "" }); setGeneral(false); setOk("Recordatorio guardado."); onCambio(); };
  const Fila = ({ x }: { x: any }) => {
    const c = quien(x.contacto_id), editable = x.creado_por === perfilId || (!!c && (c.creado_por === perfilId || (K as any[]).some(k => k.contacto_id === c.id && k.usuario_id === perfilId && k.puede_editar))), tel = c ? linkLlamar(c.telefono) : "", wa = c ? linkWhatsApp(c.telefono) : "", mapa = x.tipo === "Viaje o reunión" ? linkMapa({ ...(c || {}), lugar: x.lugar }) : "";
    return <div className="card" style={{ margin: "0 0 8px", padding: 10, borderLeft: "4px solid " + (+new Date(x.fecha_hora) < Date.now() ? "var(--bad)" : "var(--acc)") }}>
      <div className="fila entre"><div><b>{ICONO_REC[x.tipo] || "🔔"} {x.titulo}</b><br /><small className="mute">{etiquetaFecha(x.fecha_hora)}{x.lugar ? " · " + x.lugar : ""}{c ? ` · ${c.nombre}${c.zona ? " (" + c.zona + ")" : ""}` : ""}{x.creado_por !== perfilId ? " · de " + nombreDe(x.creado_por) : ""}</small></div>
        {editable && <button className="btn chico" onClick={() => hecho(x)}>Hecho ✓</button>}</div>
      <div className="fila" style={{ marginTop: 6 }}>{tel && <a className="btn suave chico" href={tel}>📞 Llamar</a>}{wa && <a className="btn suave chico" href={wa} target="_blank" rel="noreferrer">💬</a>}{mapa && <a className="btn suave chico" href={mapa} target="_blank" rel="noreferrer">📍 Cómo llegar</a>}
        <a className="btn suave chico" href={linkCalendario(x)} target="_blank" rel="noreferrer" title="Agregar al calendario del celular, con alarma">📅</a>
        {editable && <select aria-label="Posponer" value="" onChange={e => posponer(x, e.target.value)}><option value="">Posponer…</option>{ATAJOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>}
        {c && <button className="btn suave chico" onClick={() => onAbrir(c.id)}>Ver dirigente</button>}</div></div>;
  };
  const Bloque = ({ t, lista, color }: { t: string; lista: any[]; color?: string }) => lista.length ? <div style={{ marginBottom: 12 }}><h3 style={{ margin: "0 0 6px", color }}>{t} ({lista.length})</h3>{lista.map(x => <Fila key={x.id} x={x} />)}</div> : null;
  if (cargando) return <Cargando />;
  return <div style={{ marginTop: 8 }}>
    <div className="fila" style={{ marginBottom: 10 }}><button className="btn suave" onClick={() => setGeneral(v => !v)}>{general ? "Cerrar" : "➕ Recordatorio general"}</button><span className="mute">Para algo que no es de un dirigente en particular.</span></div>
    {general && <div className="card" style={{ marginBottom: 10 }}><input style={{ width: "100%" }} placeholder="¿Qué quieres recordar?" value={g.titulo} onChange={e => setG({ ...g, titulo: e.target.value })} /><div className="fila" style={{ marginTop: 6 }}>{ATAJOS.map(([k, t]) => <button key={k} type="button" className="btn suave chico" onClick={() => setG({ ...g, fecha: aLocalInput(fechaAtajo(k as Atajo)) })}>{t}</button>)}<input type="datetime-local" value={g.fecha} onChange={e => setG({ ...g, fecha: e.target.value })} /><button className="btn chico" onClick={crearGeneral}>Guardar</button></div></div>}
    {!R.length ? <Vacio>No tienes recordatorios pendientes. 🎉 Entra a un dirigente y toca "Nuevo" en Recordatorios, o anota una llamada y elige cuándo volver a llamar.</Vacio> : <>
      <Bloque t="⏰ Atrasados" lista={grupos.atrasados} color="var(--bad)" /><Bloque t="Hoy" lista={grupos.hoy} /><Bloque t="Próximos 7 días" lista={grupos.proximos} /><Bloque t="Más adelante" lista={grupos.despues} /></>}
  </div>;
}

/* ---------------- Dirigentes ---------------- */
function Dirigentes({ C, R, K, perfilId, nombreDe, cargando, zonasConocidas, onAbrir }: any) {
  const [q, setQ] = useState(""), [zona, setZona] = useState(""), [est, setEst] = useState(""), [quien, setQuien] = useState("todos");
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (C as any[]).filter(c => (!t || [c.nombre, c.telefono, c.telefono2, c.zona, c.cargo, c.organizacion, c.ubicacion, c.notas].filter(Boolean).join(" ").toLowerCase().includes(t)) && (!zona || c.zona === zona) && (!est || c.estado === est) && (quien === "todos" || (quien === "mios" ? c.creado_por === perfilId : c.creado_por !== perfilId)));
  }, [C, q, zona, est, quien, perfilId]);
  const prox = (id: string) => (R as any[]).filter(r => r.contacto_id === id).sort((a, b) => +new Date(a.fecha_hora) - +new Date(b.fecha_hora))[0];
  const csv = () => { const f = [["Nombre", "Teléfono", "Otro teléfono", "Cargo", "Organización", "Zona", "Ubicación", "Estado", "Notas"], ...(lista as any[]).map(c => [c.nombre, c.telefono, c.telefono2, c.cargo, c.organizacion, c.zona, c.ubicacion, c.estado, c.notas])]; const t = f.map(r => r.map(x => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")).join("\n"), a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + t], { type: "text/csv;charset=utf-8" })); a.download = "dirigentes-" + new Date().toLocaleDateString("en-CA") + ".csv"; a.click(); };
  if (cargando) return <Cargando />;
  return <div style={{ marginTop: 8 }}>
    <div className="fila" style={{ marginBottom: 10 }}><input style={{ flex: "1 1 220px" }} type="search" placeholder="Buscar por nombre, teléfono, zona…" value={q} onChange={e => setQ(e.target.value)} />
      <select aria-label="Zona" value={zona} onChange={e => setZona(e.target.value)}><option value="">Todas las zonas</option>{zonasConocidas.map((z: string) => <option key={z}>{z}</option>)}</select>
      <select aria-label="Estado" value={est} onChange={e => setEst(e.target.value)}><option value="">Todos los estados</option>{ESTADOS.map(x => <option key={x}>{x}</option>)}</select>
      <select aria-label="De quién" value={quien} onChange={e => setQuien(e.target.value)}><option value="todos">Todos</option><option value="mios">Anotados por mí</option><option value="compartidos">Compartidos conmigo</option></select>
      {lista.length > 0 && <button className="btn suave chico" onClick={csv}>Descargar lista</button>}</div>
    {lista.length ? <div className="card tw"><table><thead><tr><th>Dirigente</th><th>Teléfono</th><th>Zona</th><th>Cómo va</th><th>Siguiente recordatorio</th><th>Quién lo ve</th></tr></thead>
      <tbody>{lista.map((c: any) => { const p = prox(c.id), n = (K as any[]).filter(x => x.contacto_id === c.id).length;
        return <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => onAbrir(c.id)}><td><b>{c.nombre}</b><br /><small className="mute">{[c.cargo, c.organizacion].filter(Boolean).join(" · ")}</small></td>
          <td onClick={e => e.stopPropagation()}>{c.telefono ? <a href={linkLlamar(c.telefono)}>{c.telefono}</a> : "—"}</td><td>{c.zona || "—"}</td>
          <td><span className="pill" style={{ background: COLOR_ESTADO[c.estado] + "22", color: COLOR_ESTADO[c.estado] }}>{c.estado}</span></td>
          <td>{p ? <small>{ICONO_REC[p.tipo]} {etiquetaFecha(p.fecha_hora)}</small> : <small className="mute">—</small>}</td>
          <td>{c.creado_por === perfilId ? (n ? <small>Tú y {n} más</small> : <small className="mute">🔒 Solo tú</small>) : <small>De {nombreDe(c.creado_por)}</small>}</td></tr>; })}</tbody></table></div>
      : <Vacio>{(C as any[]).length ? "Ningún dirigente coincide con la búsqueda." : "Todavía no has anotado a ningún dirigente. Toca \"➕ Nuevo dirigente\"."}</Vacio>}
  </div>;
}
