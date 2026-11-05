import { ATAJOS, Atajo, ICONO_REC, etiquetaFecha, fechaAtajo, linkCalendario, linkLlamar, linkMapa, linkWhatsApp } from "../lib/agenda";

/** Una actividad programada (llamar, viajar, recordar) con todo lo que se puede hacer con ella. Se usa en "Hoy" y en el calendario. */
export function FilaActividad({ x, C, K, perfilId, nombreDe, onHecho, onPosponer, onAbrir, hecha = false }: { x: any; C: any[]; K: any[]; perfilId?: string; nombreDe: (id: string) => string; onHecho: (x: any, v: boolean) => void; onPosponer: (x: any, a: Atajo) => void; onAbrir: (id: string) => void; hecha?: boolean }) {
  const c = x.contacto_id ? C.find(k => k.id === x.contacto_id) : null;
  const editable = x.creado_por === perfilId || (!!c && (c.creado_por === perfilId || K.some(k => k.contacto_id === c.id && k.usuario_id === perfilId && k.puede_editar)));
  const tel = c ? linkLlamar(c.telefono) : "", wa = c ? linkWhatsApp(c.telefono) : "", mapa = x.tipo === "Viaje o reunión" ? linkMapa({ ...(c || {}), lugar: x.lugar }) : "", vencida = !hecha && +new Date(x.fecha_hora) < Date.now();
  return <div className="card" style={{ margin: "0 0 8px", padding: 10, borderLeft: "4px solid " + (hecha ? "#b0b6c2" : vencida ? "var(--bad)" : "var(--acc)"), opacity: hecha ? 0.7 : 1 }}>
    <div className="fila entre"><div><b style={{ textDecoration: hecha ? "line-through" : undefined }}>{ICONO_REC[x.tipo] || "🔔"} {x.titulo}</b><br /><small className="mute">{etiquetaFecha(x.fecha_hora)}{x.lugar ? " · " + x.lugar : ""}{c ? ` · ${c.nombre}${c.zona ? " (" + c.zona + ")" : ""}` : ""}{x.creado_por !== perfilId ? " · de " + nombreDe(x.creado_por) : ""}</small>{x.nota && <div className="mute">{x.nota}</div>}</div>
      {editable && <button className="btn chico" onClick={() => onHecho(x, !hecha)}>{hecha ? "Reabrir" : "Hecho ✓"}</button>}</div>
    {!hecha && <div className="fila" style={{ marginTop: 6 }}>{tel && <a className="btn suave chico" href={tel}>📞 Llamar</a>}{wa && <a className="btn suave chico" href={wa} target="_blank" rel="noreferrer">💬</a>}{mapa && <a className="btn suave chico" href={mapa} target="_blank" rel="noreferrer">📍 Cómo llegar</a>}
      <a className="btn suave chico" href={linkCalendario(x)} target="_blank" rel="noreferrer" title="Agregar al calendario del celular, con alarma">📅</a>
      {editable && <select aria-label="Posponer" value="" onChange={e => e.target.value && onPosponer(x, e.target.value as Atajo)}><option value="">Posponer…</option>{ATAJOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>}
      {c && <button className="btn suave chico" onClick={() => onAbrir(c.id)}>Ver dirigente</button>}</div>}</div>;
}
export { fechaAtajo };
