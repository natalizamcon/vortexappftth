import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Atajo, COLOR_ESTADO, ICONO_LLAMADA, ICONO_REC, NOMBRES_MES, TIPOS_REC, cap, claveDia, diaYHora, fechaLarga, porDia, semanasDelMes } from "../lib/agenda";
import { FilaActividad } from "./AgendaFila";
import { cambioAgenda } from "./AgendaContacto";

const COLOR_TIPO: Record<string, string> = { "Llamar": "#2b6cb0", "Viaje o reunión": "#7c2bc9", "Otro": "#7a8190" };

/** Calendario del mes: los días con actividades programadas llevan puntos de color, y al lado se ve lo programado para el día elegido. */
export function Calendario({ Rtodas, C, K, L, perfilId, nombreDe, onHecho, onPosponer, onCambio, onAbrir, setMsg, setOk }: { Rtodas: any[]; C: any[]; K: any[]; L: any[]; perfilId?: string; nombreDe: (id: string) => string; onHecho: (x: any, v: boolean) => void; onPosponer: (x: any, a: Atajo) => void; onCambio: () => void; onAbrir: (id: string) => void; setMsg: (t: string) => void; setOk: (t: string) => void }) {
  const hoy = new Date(), [mes, setMes] = useState(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), [sel, setSel] = useState(claveDia(hoy)), [agregando, setAgregando] = useState(false);
  const [f, setF] = useState({ tipo: "Llamar", contacto: "", titulo: "", hora: "09:00", lugar: "" }), [ocup, setOcup] = useState(false);
  const porDias = useMemo(() => porDia(Rtodas), [Rtodas]);
  const llamDias = useMemo(() => { const m = new Map<string, any[]>(); L.forEach(l => { const k = claveDia(new Date(l.fecha)); (m.get(k) || m.set(k, []).get(k)!).push(l); }); return m; }, [L]);
  const semanas = semanasDelMes(mes.getFullYear(), mes.getMonth()), items = porDias.get(sel) || [], pend = items.filter(x => !x.hecho), hechas = items.filter(x => x.hecho), llamadas = llamDias.get(sel) || [];
  const fechaSel = new Date(sel + "T12:00:00"), hoyK = claveDia(hoy);
  const editables = C.filter(c => c.creado_por === perfilId || K.some(k => k.contacto_id === c.id && k.usuario_id === perfilId && k.puede_editar));
  const irMes = (d: number) => setMes(new Date(mes.getFullYear(), mes.getMonth() + d, 1));
  const elegir = (d: Date) => { setSel(claveDia(d)); if (d.getMonth() !== mes.getMonth()) setMes(new Date(d.getFullYear(), d.getMonth(), 1)); setAgregando(false); };
  const guardar = async () => {
    const c = C.find(x => x.id === f.contacto), fecha = diaYHora(sel, f.hora); if (!fecha) return setMsg("Elige la hora.");
    const titulo = f.titulo.trim() || (c ? `${f.tipo === "Llamar" ? "Llamar a" : f.tipo === "Viaje o reunión" ? "Reunión con" : "Recordar:"} ${c.nombre}` : ""); if (!titulo) return setMsg("Escribe qué se va a hacer.");
    setOcup(true); setMsg(""); const { error } = await supabase.from("agenda_recordatorios").insert({ contacto_id: c?.id || null, tipo: f.tipo, titulo, fecha_hora: fecha, lugar: f.lugar.trim() || null }); setOcup(false);
    if (error) return setMsg(error.message); setOk("Actividad programada para el " + fechaLarga(fechaSel) + "."); setAgregando(false); setF({ ...f, titulo: "", lugar: "" }); onCambio(); cambioAgenda();
  };
  const dias = ["L", "M", "M", "J", "V", "S", "D"];
  return <div className="agenda-cal" style={{ marginTop: 8 }}>
    <div className="card" style={{ padding: 12 }}>
      <div className="fila entre" style={{ marginBottom: 8 }}><button className="btn suave chico" onClick={() => irMes(-1)} aria-label="Mes anterior">‹</button><b style={{ textTransform: "capitalize", fontSize: 16 }}>{NOMBRES_MES[mes.getMonth()]} {mes.getFullYear()}</b><span className="fila"><button className="btn suave chico" onClick={() => { setMes(new Date(hoy.getFullYear(), hoy.getMonth(), 1)); setSel(hoyK); }}>Hoy</button><button className="btn suave chico" onClick={() => irMes(1)} aria-label="Mes siguiente">›</button></span></div>
      <div className="cal-grid">{dias.map((d, i) => <div key={i} className="cal-cab">{d}</div>)}
        {semanas.flat().map(d => { const k = claveDia(d), its = porDias.get(k) || [], pen = its.filter(x => !x.hecho), fuera = d.getMonth() !== mes.getMonth(), esSel = k === sel, esHoy = k === hoyK, tipos = (pen.length ? pen : its).slice(0, 3);
          return <button key={k} className={"cal-dia" + (fuera ? " fuera" : "") + (esSel ? " sel" : "") + (esHoy ? " hoy" : "")} onClick={() => elegir(d)} aria-label={`${fechaLarga(d)}${its.length ? ", " + its.length + " actividades" : ""}`} data-dia={k} data-n={its.length}>
            <span>{d.getDate()}</span>{its.length > 0 && <span className="cal-puntos">{tipos.map(x => <i key={x.id} style={{ background: pen.length ? COLOR_TIPO[x.tipo] || "#7a8190" : "#b0b6c2" }} />)}{its.length > 3 && <small>+{its.length - 3}</small>}</span>}</button>; })}</div>
      <div className="fila" style={{ marginTop: 8, gap: 10, fontSize: 12 }}>{TIPOS_REC.map(t => <span key={t} className="fila" style={{ gap: 4 }}><i style={{ width: 10, height: 10, borderRadius: "50%", background: COLOR_TIPO[t], display: "inline-block" }} />{t}</span>)}<span className="fila" style={{ gap: 4 }}><i style={{ width: 10, height: 10, borderRadius: "50%", background: "#b0b6c2", display: "inline-block" }} />Hecha</span></div></div>

    <div>
      <div className="fila entre" style={{ marginBottom: 8 }}><h2 style={{ margin: 0, fontSize: 17 }}>{cap(fechaLarga(fechaSel))}</h2><button className="btn chico" onClick={() => setAgregando(v => !v)}>{agregando ? "Cerrar" : "➕ Agregar actividad"}</button></div>
      {agregando && <div className="card" style={{ marginBottom: 10 }}>
        <div className="fila" style={{ gap: 4 }}>{TIPOS_REC.map(t => <button key={t} type="button" className={"btn chico " + (f.tipo === t ? "" : "suave")} onClick={() => setF({ ...f, tipo: t })}>{ICONO_REC[t]} {t}</button>)}</div>
        <select style={{ width: "100%", marginTop: 6 }} aria-label="Dirigente de la actividad" value={f.contacto} onChange={e => setF({ ...f, contacto: e.target.value })}><option value="">Sin dirigente (actividad general)</option>{editables.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.zona ? " · " + c.zona : ""}</option>)}</select>
        <input style={{ width: "100%", marginTop: 6 }} placeholder="¿Qué se va a hacer? (opcional si eliges dirigente)" value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} />
        <div className="fila" style={{ marginTop: 6 }}><label className="fila">Hora <input type="time" value={f.hora} onChange={e => setF({ ...f, hora: e.target.value })} /></label>{f.tipo === "Viaje o reunión" && <input style={{ flex: 1 }} placeholder="Lugar de la reunión" value={f.lugar} onChange={e => setF({ ...f, lugar: e.target.value })} />}</div>
        <button className="btn" style={{ marginTop: 8 }} disabled={ocup} onClick={guardar}>Guardar actividad</button></div>}
      {pend.length === 0 && hechas.length === 0 ? <div className="card" style={{ padding: 14 }}><span className="mute">Sin actividades programadas este día.</span></div> : <>
        {pend.map(x => <FilaActividad key={x.id} x={x} C={C} K={K} perfilId={perfilId} nombreDe={nombreDe} onHecho={onHecho} onPosponer={onPosponer} onAbrir={onAbrir} />)}
        {hechas.length > 0 && <><h3 style={{ margin: "10px 0 6px" }}>Hechas ({hechas.length})</h3>{hechas.map(x => <FilaActividad key={x.id} x={x} hecha C={C} K={K} perfilId={perfilId} nombreDe={nombreDe} onHecho={onHecho} onPosponer={onPosponer} onAbrir={onAbrir} />)}</>}</>}
      {llamadas.length > 0 && <div className="card" style={{ marginTop: 10 }}><h3 style={{ margin: "0 0 6px" }}>☎️ Llamadas hechas este día ({llamadas.length})</h3>{llamadas.map(l => { const c = C.find(x => x.id === l.contacto_id); return <div key={l.id} style={{ borderTop: "1px solid var(--line)", padding: "5px 0" }}><b>{ICONO_LLAMADA[l.resultado] || "☎️"} {l.resultado}</b> <small className="mute">{new Date(l.fecha).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}{l.creado_por !== perfilId ? " · " + nombreDe(l.creado_por) : ""}</small>{c && <div><small><a href="#/agenda" onClick={e => { e.preventDefault(); onAbrir(c.id); }}>{c.nombre}</a>{c.estado ? <span className="pill" style={{ marginLeft: 6, background: COLOR_ESTADO[c.estado] + "22", color: COLOR_ESTADO[c.estado] }}>{c.estado}</span> : null}</small></div>}{l.nota && <div>{l.nota}</div>}</div>; })}</div>}
    </div></div>;
}
