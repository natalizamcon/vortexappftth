import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Vacio, useQuery } from "../lib/ui";
import { Drawer } from "../lib/drawer";
import { BotonGPS } from "../lib/BotonGPS";
import { ATAJOS, Atajo, COLOR_ESTADO, ESTADOS, ICONO_REC, RESULTADOS, TIPOS_REC, aLocalInput, deLocalInput, etiquetaFecha, fechaAtajo, linkCalendario, linkLlamar, linkMapa, linkWhatsApp } from "../lib/agenda";

export const cambioAgenda = () => window.dispatchEvent(new Event("agenda-cambio"));
const vacio = (c: any) => ({ nombre: c?.nombre || "", telefono: c?.telefono || "", telefono2: c?.telefono2 || "", cargo: c?.cargo || "", organizacion: c?.organizacion || "", zona: c?.zona || "", ubicacion: c?.ubicacion || "", lat: c?.lat ?? null, lng: c?.lng ?? null, estado: c?.estado || "Nuevo", notas: c?.notas || "" });

/** Anotar o corregir un dirigente. Lo único obligatorio es el nombre; todo lo demás se puede completar después. */
export function FormContacto({ contacto, zonasConocidas, onClose, onListo }: { contacto?: any; zonasConocidas: string[]; onClose: () => void; onListo: (id: string, otro: boolean) => void }) {
  const [f, setF] = useState(vacio(contacto)), [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false);
  const set = (k: string, v: any) => setF(x => ({ ...x, [k]: v }));
  const guardar = async (otro: boolean) => {
    setMsg(""); if (!f.nombre.trim()) return setMsg("Escribe el nombre del dirigente."); setOcup(true);
    const fila = { nombre: f.nombre.trim(), telefono: f.telefono.trim() || null, telefono2: f.telefono2.trim() || null, cargo: f.cargo.trim() || null, organizacion: f.organizacion.trim() || null, zona: f.zona.trim() || null, ubicacion: f.ubicacion.trim() || null, lat: f.lat, lng: f.lng, estado: f.estado, notas: f.notas.trim() || null };
    const q = contacto ? supabase.from("agenda_contactos").update(fila).eq("id", contacto.id).select("id").single() : supabase.from("agenda_contactos").insert(fila).select("id").single();
    const { data, error } = await q; setOcup(false);
    if (error) return setMsg(/relation|does not exist|schema cache/i.test(error.message) ? "Falta actualizar la base de datos: en Supabase corre el archivo 27_agenda.sql y recarga la página." : error.message);
    cambioAgenda(); onListo((data as any)?.id || contacto?.id, otro);
    if (otro) setF(vacio(null));
  };
  const tieneGps = f.lat != null && f.lng != null;
  return <Drawer titulo={contacto ? "Corregir datos" : "Nuevo dirigente"} ancho={480} onClose={onClose}>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}
    <div className="form" style={{ gridTemplateColumns: "1fr" }}>
      <Campo l="Nombre del dirigente *"><input autoFocus value={f.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Por ejemplo: Don Pedro Mamani" /></Campo>
      <Campo l="Teléfono"><input type="tel" inputMode="tel" value={f.telefono} onChange={e => set("telefono", e.target.value)} placeholder="7XXXXXXX" /></Campo>
      <Campo l="Zona o comunidad"><input list="agenda-zonas" value={f.zona} onChange={e => set("zona", e.target.value)} placeholder="Dónde vive o dirige" /><datalist id="agenda-zonas">{zonasConocidas.map(z => <option key={z} value={z} />)}</datalist></Campo>
      <Campo l="Cargo"><input list="agenda-cargos" value={f.cargo} onChange={e => set("cargo", e.target.value)} placeholder="Presidente, secretario…" /><datalist id="agenda-cargos">{["Presidente", "Vicepresidente", "Secretario", "Tesorero", "Vocal", "Dirigente"].map(z => <option key={z} value={z} />)}</datalist></Campo>
      <Campo l="Organización"><input list="agenda-orgs" value={f.organizacion} onChange={e => set("organizacion", e.target.value)} placeholder="OTB, junta vecinal, sindicato…" /><datalist id="agenda-orgs">{["OTB", "Junta vecinal", "Sindicato", "Cooperativa", "Comité de agua", "Asociación"].map(z => <option key={z} value={z} />)}</datalist></Campo>
      <Campo l="Ubicación o referencia"><input value={f.ubicacion} onChange={e => set("ubicacion", e.target.value)} placeholder="Calle, sede, cómo llegar…" />
        <div className="fila" style={{ marginTop: 6 }}><BotonGPS onPunto={t => { const [a, b] = t.split(",").map(x => parseFloat(x)); if (isFinite(a) && isFinite(b)) setF(x => ({ ...x, lat: a, lng: b })); }} />{tieneGps && <span className="pill ok">📍 GPS guardado</span>}{tieneGps && <button type="button" className="btn suave chico" onClick={() => setF(x => ({ ...x, lat: null, lng: null }))}>Quitar GPS</button>}</div></Campo>
      <Campo l="Otro teléfono"><input type="tel" inputMode="tel" value={f.telefono2} onChange={e => set("telefono2", e.target.value)} /></Campo>
      <Campo l="Cómo va"><select value={f.estado} onChange={e => set("estado", e.target.value)}>{ESTADOS.map(x => <option key={x}>{x}</option>)}</select></Campo>
      <Campo l="Notas"><textarea rows={3} value={f.notas} onChange={e => set("notas", e.target.value)} placeholder="Lo que conviene recordar de esta persona o de la zona" /></Campo>
    </div>
    <div className="fila" style={{ marginTop: 10 }}><button className="btn" disabled={ocup} onClick={() => guardar(false)}>{ocup ? "Guardando…" : "Guardar"}</button>{!contacto && <button className="btn suave" disabled={ocup} onClick={() => guardar(true)}>Guardar y agregar otro</button>}</div>
  </Drawer>;
}

/** Todo lo de un dirigente en un solo lugar: llamar, anotar la llamada, recordar y compartir. */
export function FichaContacto({ c, personas, comp, onClose, onCambio, zonasConocidas }: { c: any; personas: any[]; comp: any[]; onClose: () => void; onCambio: () => void; zonasConocidas: string[] }) {
  const { perfil } = useApp(), soyDueno = c.creado_por === perfil?.id, miAcceso = comp.find(x => x.contacto_id === c.id && x.usuario_id === perfil?.id), puedeEditar = soyDueno || !!miAcceso?.puede_editar;
  const nombreDe = (id: string) => personas.find(p => p.id === id)?.nombre || personas.find(p => p.id === id)?.email || "otra cuenta";
  const llam = useQuery(() => supabase.from("agenda_llamadas").select("*").eq("contacto_id", c.id).order("fecha", { ascending: false }).limit(100), [c.id]);
  const recs = useQuery(() => supabase.from("agenda_recordatorios").select("*").eq("contacto_id", c.id).order("fecha_hora", { ascending: true }).limit(100), [c.id]);
  const [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [editando, setEditando] = useState(false), [ocup, setOcup] = useState(false);
  const [res, setRes] = useState<string>("Contestó"), [nota, setNota] = useState(""), [tras, setTras] = useState(false);
  const [r, setR] = useState({ tipo: "Llamar", titulo: "", fecha: aLocalInput(fechaAtajo("manana")), lugar: c.ubicacion || "", nota: "" }), [verRec, setVerRec] = useState(false);
  const [per, setPer] = useState(""), [permiso, setPermiso] = useState("ver");
  const L: any[] = (llam.data as any[]) || [], R: any[] = (recs.data as any[]) || [], pend = R.filter(x => !x.hecho), hechos = R.filter(x => x.hecho);
  const recargar = () => { llam.recargar(); recs.recargar(); onCambio(); cambioAgenda(); };
  const err = (e: any) => setMsg(e?.message || String(e));

  const guardarLlamada = async () => { setMsg(""); setOk(""); setOcup(true); const { error } = await supabase.from("agenda_llamadas").insert({ contacto_id: c.id, resultado: res, nota: nota.trim() || null }); setOcup(false); if (error) return err(error); setOk("Llamada anotada."); setNota(""); setTras(true); recargar(); if (c.estado === "Nuevo" && res === "Contestó") supabase.from("agenda_contactos").update({ estado: "Contactado" }).eq("id", c.id).then(() => onCambio()); };
  const crearRec = async (fecha: string, titulo?: string, tipo?: string, extra: any = {}) => {
    setMsg(""); setOk(""); const t = (titulo ?? r.titulo).trim() || `${(tipo || r.tipo) === "Llamar" ? "Volver a llamar a" : (tipo || r.tipo) === "Viaje o reunión" ? "Reunión con" : "Recordar:"} ${c.nombre}`;
    if (!fecha) return setMsg("Elige la fecha y la hora."); setOcup(true);
    const { error } = await supabase.from("agenda_recordatorios").insert({ contacto_id: c.id, tipo: tipo || r.tipo, titulo: t, fecha_hora: fecha, lugar: (extra.lugar ?? r.lugar) || null, nota: (extra.nota ?? r.nota) || null }); setOcup(false);
    if (error) return err(error); setOk("Recordatorio guardado: " + etiquetaFecha(fecha)); setTras(false); setVerRec(false); setR({ ...r, titulo: "", nota: "" }); recargar();
  };
  const hecho = async (x: any, v: boolean) => { const { error } = await supabase.from("agenda_recordatorios").update({ hecho: v, hecho_en: v ? new Date().toISOString() : null }).eq("id", x.id); if (error) err(error); else recargar(); };
  const borrarRec = async (x: any) => { if (!confirm("¿Borrar este recordatorio?")) return; const { error } = await supabase.from("agenda_recordatorios").delete().eq("id", x.id); if (error) err(error); else recargar(); };
  const cambiarEstado = async (estado: string) => { const { error } = await supabase.from("agenda_contactos").update({ estado }).eq("id", c.id); if (error) err(error); else onCambio(); };
  const eliminar = async () => { if (!confirm(`¿Eliminar a "${c.nombre}" con todas sus llamadas y recordatorios? No se puede deshacer.`)) return; const { error } = await supabase.from("agenda_contactos").delete().eq("id", c.id); if (error) err(error); else { cambioAgenda(); onCambio(); onClose(); } };
  const compartidos = comp.filter(x => x.contacto_id === c.id), disponibles = personas.filter(p => !compartidos.some(x => x.usuario_id === p.id));
  const compartir = async () => { if (!per) return; setMsg(""); const { error } = await supabase.from("agenda_compartido").insert({ contacto_id: c.id, usuario_id: per, puede_editar: permiso === "editar" }); if (error) return err(error); setPer(""); setOk("Compartido."); onCambio(); };
  const cambiarPermiso = async (x: any, v: boolean) => { const { error } = await supabase.from("agenda_compartido").update({ puede_editar: v }).eq("contacto_id", x.contacto_id).eq("usuario_id", x.usuario_id); if (error) err(error); else onCambio(); };
  const quitarComp = async (x: any) => { const yo = x.usuario_id === perfil?.id; if (!confirm(yo ? "¿Dejar de ver este contacto?" : "¿Dejar de compartir con esta persona?")) return; const { error } = await supabase.from("agenda_compartido").delete().eq("contacto_id", x.contacto_id).eq("usuario_id", x.usuario_id); if (error) err(error); else { onCambio(); if (yo) onClose(); } };

  const tel = linkLlamar(c.telefono), wa = linkWhatsApp(c.telefono), mapa = linkMapa(c);
  if (editando) return <FormContacto contacto={c} zonasConocidas={zonasConocidas} onClose={() => setEditando(false)} onListo={() => { setEditando(false); onCambio(); }} />;
  return <Drawer titulo={c.nombre} ancho={520} onClose={onClose}>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="fila" style={{ marginBottom: 6 }}><span className="pill" style={{ background: COLOR_ESTADO[c.estado] + "22", color: COLOR_ESTADO[c.estado] }}>{c.estado}</span>{[c.cargo, c.organizacion].filter(Boolean).length > 0 && <span className="mute">{[c.cargo, c.organizacion].filter(Boolean).join(" · ")}</span>}</div>
    {!soyDueno && <Aviso>🔒 Compartido por <b>{nombreDe(c.creado_por)}</b> · {puedeEditar ? "puedes anotar llamadas y recordatorios" : "solo para ver"}.</Aviso>}
    <div className="fila" style={{ margin: "6px 0 10px" }}>{tel && <a className="btn" href={tel}>📞 Llamar {c.telefono}</a>}{wa && <a className="btn suave" href={wa} target="_blank" rel="noreferrer">💬 WhatsApp</a>}{mapa && <a className="btn suave" href={mapa} target="_blank" rel="noreferrer">📍 Cómo llegar</a>}{!tel && <span className="mute">Sin teléfono anotado</span>}</div>
    <dl className="ficha"><dt>Zona</dt><dd>{c.zona || "—"}</dd><dt>Ubicación</dt><dd>{c.ubicacion || "—"}{c.lat != null ? " · 📍 con GPS" : ""}</dd>{c.telefono2 && <><dt>Otro teléfono</dt><dd><a href={linkLlamar(c.telefono2)}>{c.telefono2}</a></dd></>}{c.notas && <><dt>Notas</dt><dd style={{ whiteSpace: "pre-wrap" }}>{c.notas}</dd></>}</dl>
    {puedeEditar && <div className="fila" style={{ margin: "6px 0" }}><select aria-label="Cómo va" value={c.estado} onChange={e => cambiarEstado(e.target.value)}>{ESTADOS.map(x => <option key={x}>{x}</option>)}</select><button className="btn suave chico" onClick={() => setEditando(true)}>✏️ Corregir datos</button></div>}

    {puedeEditar && <div className="card" style={{ margin: "10px 0" }}><h3 style={{ margin: "0 0 6px" }}>📞 Anotar una llamada</h3>
      <div className="fila" style={{ gap: 4 }}>{RESULTADOS.map(x => <button key={x} type="button" className={"btn chico " + (res === x ? "" : "suave")} onClick={() => setRes(x)}>{x}</button>)}</div>
      <input style={{ width: "100%", marginTop: 6 }} placeholder="¿Qué se habló? (opcional)" value={nota} onChange={e => setNota(e.target.value)} />
      <button className="btn" style={{ marginTop: 6 }} disabled={ocup} onClick={guardarLlamada}>Guardar llamada</button>
      {tras && <div style={{ marginTop: 8 }}><b>¿Cuándo vuelves a llamar?</b><div className="fila" style={{ marginTop: 4 }}>{ATAJOS.map(([k, t]) => <button key={k} className="btn suave chico" disabled={ocup} onClick={() => crearRec(fechaAtajo(k as Atajo).toISOString(), "", "Llamar")}>{t}</button>)}<button className="btn suave chico" onClick={() => { setTras(false); setVerRec(true); }}>Elegir fecha…</button><button className="btn suave chico" onClick={() => setTras(false)}>No hace falta</button></div></div>}</div>}

    <div className="card" style={{ margin: "10px 0" }}><div className="fila entre"><h3 style={{ margin: 0 }}>🔔 Recordatorios</h3>{puedeEditar && <button className="btn chico" onClick={() => setVerRec(v => !v)}>{verRec ? "Cerrar" : "➕ Nuevo"}</button>}</div>
      {verRec && puedeEditar && <div style={{ margin: "8px 0", padding: 8, background: "var(--lilb)", borderRadius: 10 }}>
        <div className="fila" style={{ gap: 4 }}>{TIPOS_REC.map(t => <button key={t} type="button" className={"btn chico " + (r.tipo === t ? "" : "suave")} onClick={() => setR({ ...r, tipo: t })}>{ICONO_REC[t]} {t}</button>)}</div>
        <input style={{ width: "100%", marginTop: 6 }} placeholder={r.tipo === "Llamar" ? `Volver a llamar a ${c.nombre}` : r.tipo === "Viaje o reunión" ? `Reunión con ${c.nombre}` : "¿Qué quieres recordar?"} value={r.titulo} onChange={e => setR({ ...r, titulo: e.target.value })} />
        <div className="fila" style={{ marginTop: 6 }}>{ATAJOS.map(([k, t]) => <button key={k} type="button" className="btn suave chico" onClick={() => setR({ ...r, fecha: aLocalInput(fechaAtajo(k as Atajo)) })}>{t}</button>)}</div>
        <input type="datetime-local" style={{ marginTop: 6 }} value={r.fecha} onChange={e => setR({ ...r, fecha: e.target.value })} />
        {r.tipo === "Viaje o reunión" && <input style={{ width: "100%", marginTop: 6 }} placeholder="Lugar de la reunión" value={r.lugar} onChange={e => setR({ ...r, lugar: e.target.value })} />}
        <button className="btn" style={{ marginTop: 8 }} disabled={ocup} onClick={() => crearRec(deLocalInput(r.fecha))}>Guardar recordatorio</button></div>}
      {recs.loading ? <Cargando /> : pend.length ? pend.map(x => <FilaRec key={x.id} x={x} puedeEditar={puedeEditar} onHecho={() => hecho(x, true)} onBorrar={() => borrarRec(x)} />) : <p className="mute" style={{ margin: "6px 0 0" }}>Sin recordatorios pendientes.</p>}
      {hechos.length > 0 && <details style={{ marginTop: 6 }}><summary className="mute" style={{ cursor: "pointer" }}>Hechos ({hechos.length})</summary>{hechos.map(x => <FilaRec key={x.id} x={x} hecho puedeEditar={puedeEditar} onHecho={() => hecho(x, false)} onBorrar={() => borrarRec(x)} />)}</details>}</div>

    <div className="card" style={{ margin: "10px 0" }}><h3 style={{ margin: "0 0 6px" }}>Historial de llamadas ({L.length})</h3>{llam.loading ? <Cargando /> : L.length ? L.map(x => <div key={x.id} style={{ borderTop: "1px solid var(--line)", padding: "5px 0" }}><b>{x.resultado}</b> <small className="mute">{etiquetaFecha(x.fecha)}{x.creado_por !== perfil?.id ? " · " + nombreDe(x.creado_por) : ""}</small>{x.nota && <div>{x.nota}</div>}</div>) : <p className="mute" style={{ margin: 0 }}>Todavía no hay llamadas anotadas.</p>}</div>

    <div className="card" style={{ margin: "10px 0" }}><h3 style={{ margin: "0 0 6px" }}>👥 Quién puede ver este dirigente</h3>
      <p className="mute" style={{ margin: "0 0 6px" }}>{soyDueno ? "Es privado: solo lo ves tú y las personas que elijas aquí. Nadie más, ni el administrador." : "No puedes cambiar quién lo ve: lo decide quien lo anotó."}</p>
      {soyDueno ? <>
        {compartidos.length ? compartidos.map(x => <div key={x.usuario_id} className="fila entre" style={{ borderTop: "1px solid var(--line)", padding: "5px 0" }}><span><b>{nombreDe(x.usuario_id)}</b></span><span className="fila"><label className="fila"><input type="checkbox" checked={!!x.puede_editar} onChange={e => cambiarPermiso(x, e.target.checked)} /> puede anotar</label><button className="btn suave chico" onClick={() => quitarComp(x)}>Quitar</button></span></div>) : <p className="mute" style={{ margin: 0 }}>Todavía no lo compartes con nadie.</p>}
        <div className="fila" style={{ marginTop: 8 }}><select aria-label="Persona" value={per} onChange={e => setPer(e.target.value)}><option value="">Elegir persona…</option>{disponibles.map(p => <option key={p.id} value={p.id}>{p.nombre || p.email}</option>)}</select>
          <select aria-label="Permiso" value={permiso} onChange={e => setPermiso(e.target.value)}><option value="ver">Solo ver</option><option value="editar">Ver y anotar</option></select><button className="btn chico" disabled={!per} onClick={compartir}>Compartir</button></div>
        {!personas.length && <p className="mute" style={{ margin: "6px 0 0" }}>No hay otras personas para compartir (deben tener cuenta activa en tus proyectos).</p>}</>
        : miAcceso && <button className="btn suave chico" onClick={() => quitarComp(miAcceso)}>Dejar de ver este dirigente</button>}</div>

    {soyDueno && <div style={{ marginTop: 14, paddingTop: 8, borderTop: "1px dashed var(--bad)" }}><button className="btn suave chico" style={{ color: "var(--bad)" }} onClick={eliminar}>🗑 Eliminar este dirigente</button></div>}
  </Drawer>;
}

function FilaRec({ x, hecho = false, puedeEditar, onHecho, onBorrar }: { x: any; hecho?: boolean; puedeEditar: boolean; onHecho: () => void; onBorrar: () => void }) {
  const vencido = !hecho && +new Date(x.fecha_hora) < Date.now();
  return <div style={{ borderTop: "1px solid var(--line)", padding: "6px 0", opacity: hecho ? 0.6 : 1 }}><div className="fila entre"><span><b>{ICONO_REC[x.tipo] || "🔔"} {x.titulo}</b><br /><small style={{ color: vencido ? "var(--bad)" : undefined }} className={vencido ? "" : "mute"}>{vencido ? "⏰ Atrasado · " : ""}{etiquetaFecha(x.fecha_hora)}{x.lugar ? " · " + x.lugar : ""}</small>{x.nota && <div className="mute">{x.nota}</div>}</span>
    <span className="fila">{!hecho && <a className="btn suave chico" href={linkCalendario(x)} target="_blank" rel="noreferrer" title="Agregar al calendario del celular, con alarma">📅</a>}{puedeEditar && <button className="btn chico" onClick={onHecho}>{hecho ? "Reabrir" : "Hecho ✓"}</button>}{puedeEditar && <button className="btn suave chico" onClick={onBorrar} aria-label="Borrar">✕</button>}</span></div></div>;
}
