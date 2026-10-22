import { useState } from "react";
import { supabase, subirArchivo, urlArchivo } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { aPapelera } from "../lib/papelera";
import { Aviso, Campo, Cargando, Kpi, Vacio, hoy, useAlcance, useQuery } from "../lib/ui";
import Crud from "../lib/crud";
import { FormModal } from "../lib/formmodal";

const n = (x: any) => Number(x) || 0;
const nada = Promise.resolve({ data: [], error: null });
const suma = (a: any[], k: string) => a.reduce((s, x) => s + n(x[k]), 0);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const msgUnico = (m: string, que: string) => (/duplicate key|unique/i.test(m) ? `Ya existe ${que} con ese código en esta zona. Si lo mandaste a la papelera, restáuralo desde el menú Papelera o usa otro código.` : m);

/** Código de colores estándar de 12 hilos (se repite cada 12). */
const COLOR_NOMBRE = ["Azul", "Naranja", "Verde", "Marrón", "Gris", "Blanco", "Rojo", "Negro", "Amarillo", "Violeta", "Rosa", "Celeste"];
const COLOR_HEX = ["#1f5fd8", "#f08a1c", "#2e9e4f", "#7b4a2a", "#808890", "#d8d8d8", "#d33", "#222", "#e8c81c", "#8a4fd0", "#f08ab0", "#4cc3e0"];
export const colorHilo = (num: number) => ({ nombre: COLOR_NOMBRE[(num - 1) % 12], hex: COLOR_HEX[(num - 1) % 12] });
export const PERDIDA_ALTA = 0.3; // dB: una fusión con más pérdida que esto se marca como alta

/* ============================ TRONCALES ============================ */
export function Troncales({ ir }: { ir: (tab: string, troncal?: string) => void }) {
  const { zonas, zonaId, proyectoId } = useApp(), al = useAlcance();
  const res = useQuery(() => al(supabase.from("v_troncales_resumen").select("*").order("codigo")), [proyectoId, zonaId]);
  const vacio = { codigo: "", desde: "", hasta: "", tipo_fibra: "G.652D", longitud_km: "", hilos: "12", observaciones: "" };
  const [f, setF] = useState(vacio), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false), [edT, setEdT] = useState<any>(null);
  const nz = (id: string) => zonas.find(z => z.id === id)?.nombre || "";
  const crear = async () => {
    setMsg(""); setOk(""); const zona = zonas.find(z => z.id === zonaId);
    if (!zona) return setMsg("Elige una zona arriba.");
    if (!f.codigo.trim()) return setMsg("Escribe el código de la troncal (por ejemplo TR-N-01).");
    if (n(f.hilos) < 1 || n(f.hilos) > 288) return setMsg("La cantidad de hilos va de 1 a 288.");
    setOcup(true);
    const { error } = await supabase.from("troncales").insert({ proyecto_id: zona.proyecto_id, zona_id: zona.id, codigo: f.codigo.trim(), desde: f.desde || null, hasta: f.hasta || null, tipo_fibra: f.tipo_fibra, longitud_km: n(f.longitud_km), hilos: Math.round(n(f.hilos)), observaciones: f.observaciones || null });
    setOcup(false);
    if (error) return setMsg(msgUnico(error.message, "una troncal"));
    setF(vacio); setOk("Troncal creada con sus hilos."); res.recargar();
  };
  const quitar = async (t: any) => {
    if (!confirm(`¿Mandar la troncal "${t.codigo}" a la papelera?\n\nSus hilos y fusiones se ocultan con ella. Podrás restaurarla desde el menú Papelera.`)) return;
    try { await aPapelera("troncales", [t.troncal_id]); res.recargar(); } catch (e: any) { setMsg(e.message); }
  };
  const R: any[] = (res.data as any[]) || [];
  return <>
    <div className="card"><h2>Nueva troncal</h2>{msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
      <div className="form">
        <Campo l="Código *"><input value={f.codigo} placeholder="TR-N-01" onChange={e => setF({ ...f, codigo: e.target.value })} /></Campo>
        <Campo l="Desde"><input value={f.desde} placeholder="Central" onChange={e => setF({ ...f, desde: e.target.value })} /></Campo>
        <Campo l="Hasta"><input value={f.hasta} placeholder="Barrio Norte" onChange={e => setF({ ...f, hasta: e.target.value })} /></Campo>
        <Campo l="Tipo de fibra"><select value={f.tipo_fibra} onChange={e => setF({ ...f, tipo_fibra: e.target.value })}>{["G.652D", "G.657A1", "G.657A2", "G.655", "Otro"].map(x => <option key={x}>{x}</option>)}</select></Campo>
        <Campo l="Longitud (km)"><input type="number" min={0} step={0.01} value={f.longitud_km} onChange={e => setF({ ...f, longitud_km: e.target.value })} /></Campo>
        <Campo l="Cantidad de hilos *"><input type="number" min={1} max={288} list="hilos-comunes" value={f.hilos} onChange={e => setF({ ...f, hilos: e.target.value })} /><datalist id="hilos-comunes">{[2, 4, 6, 8, 12, 24, 36, 48, 72, 96, 144].map(x => <option key={x} value={x} />)}</datalist></Campo>
        <Campo l="Observaciones"><input value={f.observaciones} onChange={e => setF({ ...f, observaciones: e.target.value })} /></Campo>
      </div>
      <button className="btn" disabled={ocup} onClick={crear}>{ocup ? "Creando…" : "Crear troncal"}</button>
      {!zonaId && <p className="mute">Elige una zona arriba para poder crear.</p>}</div>
    <div className="card tw"><h2>Troncales</h2>{res.loading ? <Cargando /> : R.length ? <table><thead><tr><th>Código</th><th>Zona</th><th>Recorrido</th><th>Fibra</th><th>Km</th><th>Hilos</th><th>Libres</th><th>Usados</th><th>Reservados</th><th>Dañados</th><th /></tr></thead>
      <tbody>{R.map(t => <tr key={t.troncal_id}><td><b>{t.codigo}</b></td><td>{nz(t.zona_id)}</td><td>{[t.desde, t.hasta].filter(Boolean).join(" → ") || "—"}</td><td>{t.tipo_fibra}</td><td>{n(t.longitud_km)}</td><td>{t.total}</td>
        <td>{t.libres}</td><td>{t.utilizados}</td><td>{t.reservados}</td><td style={{ color: n(t.danados) ? "var(--bad)" : undefined }}>{t.danados}</td>
        <td><div className="fila"><button className="btn suave chico" onClick={() => ir("hilos", t.troncal_id)}>Hilos y fusiones</button><button className="btn suave chico" onClick={() => setEdT(t)}>Editar</button><button className="btn suave chico" onClick={() => quitar(t)}>A la papelera</button></div></td></tr>)}</tbody></table> : <Vacio>Aún no hay troncales.</Vacio>}</div>
    {edT && <EditarTroncal t={edT} onClose={() => setEdT(null)} onListo={() => { setEdT(null); res.recargar(); }} />}
  </>;
}

/* ============================ HILOS Y FUSIONES ============================ */
const SIGUIENTE: Record<string, string> = { LIBRE: "UTILIZADO", UTILIZADO: "RESERVADO", RESERVADO: "DAÑADO", "DAÑADO": "LIBRE" };

export function HilosFusiones({ troncalId, setTroncalId }: { troncalId: string; setTroncalId: (id: string) => void }) {
  const { zonaId, proyectoId } = useApp(), al = useAlcance();
  const lista = useQuery(() => al(supabase.from("v_troncales_resumen").select("*").order("codigo")), [proyectoId, zonaId]);
  const L: any[] = (lista.data as any[]) || [], t: any = L.find(x => x.troncal_id === troncalId) || L[0];
  const hilos = useQuery(() => t ? supabase.from("hilos").select("id, numero, estado, nota").eq("troncal_id", t.troncal_id).order("numero") : nada, [t?.troncal_id]);
  const fus = useQuery(() => t ? supabase.from("v_fusiones").select("*").eq("troncal_id", t.troncal_id).order("fecha", { ascending: false }) : nada, [t?.troncal_id]);
  const naps = useQuery(() => t ? supabase.from("naps").select("id, codigo").eq("zona_id", t.zona_id).order("codigo") : nada, [t?.zona_id]);
  const [ov, setOv] = useState<Record<string, string>>({}), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false), [arch, setArch] = useState<File | null>(null), [edF, setEdF] = useState<any>(null);
  const vacio = { hilo_entrada: "", caja_empalme: "", splitter: "Sin splitter", hilo_salida: "", nap_id: "", perdida_db: "", fecha: hoy(), tecnico: "", observaciones: "" };
  const [f, setF] = useState(vacio);

  const cambiar = async (h: any) => {
    const nuevo = SIGUIENTE[ov[h.id] || h.estado]; setOv({ ...ov, [h.id]: nuevo }); setMsg("");
    const { error } = await supabase.from("hilos").update({ estado: nuevo }).eq("id", h.id);
    if (error) { setOv(o => { const c = { ...o }; delete c[h.id]; return c; }); setMsg(error.message); } else lista.recargar();
  };
  const editarNota = async (h: any) => { const nota = prompt(`Nota para el hilo ${h.numero} (déjala vacía para borrarla):`, h.nota || ""); if (nota === null) return; const { error } = await supabase.from("hilos").update({ nota: nota.trim() || null }).eq("id", h.id); if (error) setMsg(error.message); else hilos.recargar(); };
  const agregar = async () => {
    setMsg(""); setOk("");
    if (!t) return;
    if (!(n(f.hilo_entrada) >= 1 && n(f.hilo_entrada) <= t.total)) return setMsg(`El hilo de entrada debe estar entre 1 y ${t.total}.`);
    setOcup(true);
    try {
      const foto = arch ? await subirArchivo("fotos", t.proyecto_id, arch) : null;
      const { error } = await supabase.from("fusiones").insert({ proyecto_id: t.proyecto_id, zona_id: t.zona_id, troncal_id: t.troncal_id, hilo_entrada: Math.round(n(f.hilo_entrada)), caja_empalme: f.caja_empalme || null, splitter: f.splitter === "Sin splitter" ? null : f.splitter, hilo_salida: f.hilo_salida || null, nap_id: f.nap_id || null, perdida_db: f.perdida_db === "" ? null : n(f.perdida_db), fecha: f.fecha, tecnico: f.tecnico || null, observaciones: f.observaciones || null, foto_path: foto });
      if (error) throw new Error(error.message);
      setF(vacio); setArch(null); setOk("Fusión registrada."); fus.recargar();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  const quitar = async (x: any) => { if (!confirm("¿Mandar esta fusión a la papelera? Podrás recuperarla desde el menú Papelera.")) return; try { await aPapelera("fusiones", [x.id]); fus.recargar(); } catch (e: any) { setMsg(e.message); } };
  const verFoto = async (ruta: string) => { const u = await urlArchivo("fotos", ruta); if (u) window.open(u, "_blank"); else setMsg("No se pudo abrir la foto."); };

  if (lista.loading) return <Cargando />;
  if (!t) return <Aviso>Aún no hay troncales{zonaId ? " en esta zona" : ""}. Créalas en la pestaña <b>Troncales</b>.</Aviso>;
  const H: any[] = (hilos.data as any[]) || [], F: any[] = (fus.data as any[]) || [], est = (h: any) => ov[h.id] || h.estado;
  const cuenta = (e: string) => H.filter(h => est(h) === e).length;
  return <>
    <div className="fila" style={{ marginBottom: 12 }}>
      <select value={t.troncal_id} onChange={e => setTroncalId(e.target.value)}>{L.map(x => <option key={x.troncal_id} value={x.troncal_id}>{x.codigo} · {[x.desde, x.hasta].filter(Boolean).join(" → ")}</option>)}</select>
      <span className="mute">{t.total} hilos · {t.tipo_fibra} · {n(t.longitud_km)} km</span></div>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="card"><h2>Hilos</h2>
      <p className="mute">Toca un hilo para cambiar su estado: libre → utilizado → reservado → dañado. El color de la izquierda es el código estándar de colores.</p>
      <div className="fila" style={{ marginBottom: 8 }}><span className="tag">Libres {cuenta("LIBRE")}</span><span className="tag">Utilizados {cuenta("UTILIZADO")}</span><span className="tag">Reservados {cuenta("RESERVADO")}</span><span className="tag">Dañados {cuenta("DAÑADO")}</span></div>
      {hilos.loading ? <Cargando /> : <div className="hilos-grid">{H.map(h => { const c = colorHilo(h.numero), fu = F.filter(x => n(x.hilo_entrada) === h.numero), dest = fu.map(x => [x.caja_empalme, x.nap_codigo && "→ " + x.nap_codigo].filter(Boolean).join(" ")).filter(Boolean).join(" · "); return <div key={h.id} role="button" tabIndex={0} className={"hilo " + est(h)} style={{ borderLeftColor: c.hex }} onClick={() => cambiar(h)}><b>Hilo {h.numero} <span title="Escribir una nota" style={{ float: "right", cursor: "pointer" }} onClick={e => { e.stopPropagation(); editarNota(h); }}>✎</span></b><small>{c.nombre} · {est(h).toLowerCase()}</small>{dest && <small style={{ color: "var(--lil)" }}>{dest}</small>}{h.nota && <small>📝 {h.nota}</small>}</div>; })}</div>}</div>

    <div className="card"><h2>Registrar una fusión</h2>
      <div className="form">
        <Campo l={`Hilo de entrada (1 a ${t.total}) *`}><input type="number" min={1} max={t.total} value={f.hilo_entrada} onChange={e => setF({ ...f, hilo_entrada: e.target.value })} /></Campo>
        <Campo l="Caja de empalme"><input value={f.caja_empalme} placeholder="CE-N-01" onChange={e => setF({ ...f, caja_empalme: e.target.value })} /></Campo>
        <Campo l="Splitter"><select value={f.splitter} onChange={e => setF({ ...f, splitter: e.target.value })}>{["Sin splitter", "1:2", "1:4", "1:8", "1:16", "1:32"].map(x => <option key={x}>{x}</option>)}</select></Campo>
        <Campo l="Hilo de salida"><input value={f.hilo_salida} onChange={e => setF({ ...f, hilo_salida: e.target.value })} /></Campo>
        <Campo l="NAP de destino"><select value={f.nap_id} onChange={e => setF({ ...f, nap_id: e.target.value })}><option value="">Ninguna</option>{((naps.data as any[]) || []).map(x => <option key={x.id} value={x.id}>{x.codigo}</option>)}</select></Campo>
        <Campo l="Pérdida medida (dB)"><input type="number" step={0.01} min={0} value={f.perdida_db} onChange={e => setF({ ...f, perdida_db: e.target.value })} /></Campo>
        <Campo l="Fecha"><input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></Campo>
        <Campo l="Técnico"><input value={f.tecnico} onChange={e => setF({ ...f, tecnico: e.target.value })} /></Campo>
        <Campo l="Observaciones"><input value={f.observaciones} onChange={e => setF({ ...f, observaciones: e.target.value })} /></Campo>
        <Campo l="Foto (opcional)"><input type="file" accept="image/*" key={String(ok)} onChange={e => setArch(e.target.files?.[0] || null)} /></Campo>
      </div><button className="btn" disabled={ocup} onClick={agregar}>{ocup ? "Guardando…" : "Agregar fusión"}</button></div>

    <div className="card tw"><h2>Fusiones de {t.codigo}</h2>{fus.loading ? <Cargando /> : F.length ? <table><thead><tr><th>Fecha</th><th>Hilo de entrada</th><th>Caja</th><th>Splitter</th><th>Hilo de salida</th><th>NAP</th><th>Pérdida</th><th>Técnico</th><th /></tr></thead>
      <tbody>{F.map(x => <tr key={x.id}><td>{x.fecha}</td><td><span className="punto-hilo" style={{ background: colorHilo(n(x.hilo_entrada)).hex }} /> Hilo {x.hilo_entrada} ({colorHilo(n(x.hilo_entrada)).nombre})</td><td>{x.caja_empalme || "—"}</td><td>{x.splitter || "—"}</td><td>{x.hilo_salida || "—"}</td><td>{x.nap_codigo || "—"}</td>
        <td style={{ color: n(x.perdida_db) > PERDIDA_ALTA ? "var(--bad)" : undefined, fontWeight: n(x.perdida_db) > PERDIDA_ALTA ? 700 : undefined }}>{x.perdida_db == null ? "—" : n(x.perdida_db).toFixed(2) + " dB"}</td><td>{x.tecnico || "—"}</td>
        <td><div className="fila">{x.foto_path && <button className="btn suave chico" onClick={() => verFoto(x.foto_path)}>Ver foto</button>}<button className="btn suave chico" onClick={() => setEdF(x)}>Editar</button><button className="btn suave chico" onClick={() => quitar(x)}>A la papelera</button></div></td></tr>)}</tbody></table> : <Vacio>Aún no hay fusiones registradas en esta troncal.</Vacio>}
      <p className="mute">La pérdida de una fusión suele estar por debajo de 0,1 dB. Desde {PERDIDA_ALTA} dB se marca en rojo como pérdida alta.</p></div>
    {edF && <EditarFusion x={edF} naps={(naps.data as any[]) || []} total={t.total} onClose={() => setEdF(null)} onListo={() => { setEdF(null); fus.recargar(); lista.recargar(); }} />}
  </>;
}

/* ============================ POSTES ============================ */
export function Postes() {
  return <Crud titulo="Postes y ferretería instalada" tabla="postes" conZona orden="creado_en" editar
    campos={[
      { k: "codigo", l: "Código del poste", req: true }, { k: "tipo", l: "Tipo", t: "select", opts: ["Madera 7 m", "Madera 9 m", "Concreto 9 m", "Concreto 12 m", "Metálico", "Otro"] },
      { k: "ferreteria", l: "Ferretería instalada (tensores, grampas…)" }, { k: "fecha_instalacion", l: "Fecha de instalación", t: "date" }, { k: "tecnico", l: "Técnico" },
      { k: "lat", l: "Latitud", t: "number" }, { k: "lng", l: "Longitud", t: "number" }, { k: "foto_path", l: "Foto", t: "archivo", bucket: "fotos" },
    ]}
    columnas={["codigo", "tipo", "ferreteria", "fecha_instalacion", "tecnico", "lat", "lng"]} />;
}

/* ============================ VENTANAS DE EDICIÓN ============================ */
function EditarTroncal({ t, onClose, onListo }: { t: any; onClose: () => void; onListo: () => void }) {
  const fila = useQuery(() => supabase.from("troncales").select("*").eq("id", t.troncal_id).maybeSingle(), [t.troncal_id]);
  if (fila.loading) return <Cargando />;
  return <FormModal titulo={"Editar " + t.codigo} valores={fila.data || t} onClose={onClose}
    campos={[{ k: "codigo", l: "Código", req: true }, { k: "desde", l: "Desde" }, { k: "hasta", l: "Hasta" }, { k: "tipo_fibra", l: "Tipo de fibra", t: "select", opts: ["G.652D", "G.657A1", "G.657A2", "G.655", "Otro"].map(x => [x, x] as [string, string]) }, { k: "longitud_km", l: "Longitud (km)", t: "number", paso: 0.01 }, { k: "observaciones", l: "Observaciones" }]}
    onGuardar={async f => { const { error } = await supabase.from("troncales").update({ ...f, longitud_km: f.longitud_km ?? 0 }).eq("id", t.troncal_id); if (error) return msgUnico(error.message, "una troncal"); onListo(); }}
    extra={<p className="mute">La cantidad de hilos ({t.total}) no se cambia aquí: si necesitas otra cantidad, crea una troncal nueva.</p>} />;
}
function EditarFusion({ x, naps, total, onClose, onListo }: { x: any; naps: any[]; total: number; onClose: () => void; onListo: () => void }) {
  return <FormModal titulo="Editar fusión" valores={x} onClose={onClose} ancho={640}
    campos={[{ k: "hilo_entrada", l: `Hilo de entrada (1 a ${total})`, t: "number", req: true }, { k: "caja_empalme", l: "Caja de empalme" }, { k: "splitter", l: "Splitter", t: "select", opts: [["", "Sin splitter"], ...["1:2", "1:4", "1:8", "1:16", "1:32"].map(s => [s, s] as [string, string])] }, { k: "hilo_salida", l: "Hilo de salida" },
      { k: "nap_id", l: "NAP de destino", t: "select", opts: [["", "Ninguna"], ...naps.map(n2 => [n2.id, n2.codigo] as [string, string])] }, { k: "perdida_db", l: "Pérdida medida (dB)", t: "number", paso: 0.01 }, { k: "fecha", l: "Fecha", t: "date" }, { k: "tecnico", l: "Técnico" }, { k: "observaciones", l: "Observaciones" }]}
    onGuardar={async f => { if (!(f.hilo_entrada >= 1 && f.hilo_entrada <= total)) return `El hilo de entrada debe estar entre 1 y ${total}.`; const { error } = await supabase.from("fusiones").update(f).eq("id", x.id); if (error) return error.message; onListo(); }} />;
}
