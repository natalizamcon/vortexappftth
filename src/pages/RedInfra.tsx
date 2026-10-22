import { useState } from "react";
import { supabase, subirArchivo, urlArchivo } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { aPapelera } from "../lib/papelera";
import { Aviso, Campo, Cargando, Kpi, Vacio, hoy, useAlcance, useQuery } from "../lib/ui";
import Crud from "../lib/crud";

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

/* ============================ PANEL DE RED ============================ */
export function PanelRed({ ir }: { ir: (tab: string) => void }) {
  const { proyectoId, zonaId, zonas } = useApp(), al = useAlcance(), dep = [proyectoId, zonaId];
  const tr = useQuery(() => al(supabase.from("v_troncales_resumen").select("*")), dep);
  const naps = useQuery(() => al(supabase.from("v_naps_ocupacion").select("*")), dep);
  const olts = useQuery(() => al(supabase.from("v_olts_resumen").select("*")), dep);
  const fus = useQuery(() => al(supabase.from("fusiones").select("perdida_db").limit(5000)), dep);
  const postes = useQuery(() => al(supabase.from("postes").select("id", { count: "exact", head: true })).then((r: any) => ({ data: r.count ?? 0, error: r.error })), dep);
  const mant = useQuery(() => al(supabase.from("mantenimientos").select("id", { count: "exact", head: true }).in("objeto", ["NAP", "Red troncal", "Equipo", "Cambio de antena"]).in("estado", ["PENDIENTE", "EN PROCESO", "PAUSADO"])).then((r: any) => ({ data: r.count ?? 0, error: r.error })), dep);
  const hist = useQuery(() => al(supabase.from("historial_red").select("fecha, tipo, descripcion, zona_id").order("fecha", { ascending: false }).limit(6)), dep);
  if ([tr, naps, olts, fus].some(q => q.loading)) return <Cargando />;

  const T: any[] = (tr.data as any[]) || [], N: any[] = (naps.data as any[]) || [], O: any[] = (olts.data as any[]) || [], F: any[] = ((fus.data as any[]) || []).filter(x => x.perdida_db != null), H: any[] = (hist.data as any[]) || [];
  const hilos = suma(T, "total"), usados = suma(T, "utilizados"), pn = suma(N, "total"), po = suma(N, "ocupados");
  const perdMedia = F.length ? F.reduce((s, x) => s + n(x.perdida_db), 0) / F.length : 0, altas = F.filter(x => n(x.perdida_db) > PERDIDA_ALTA).length;
  const sinLibres = T.filter(t => n(t.libres) <= 2), llenas = N.filter(x => n(x.libres) === 0 && n(x.total) > 0), ponDan = suma(O, "danados"), hiloDan = suma(T, "danados");
  const nz = (id: string) => zonas.find(z => z.id === id)?.nombre || "";

  return <>
    <div className="grid gk" style={{ marginBottom: 14 }}>
      <Kpi t="OLT" v={O.length} s={O.length ? `${suma(O, "en_uso")} de ${suma(O, "total")} puertos PON en uso` : "Aún sin registrar"} />
      <Kpi t="Troncales" v={T.length} s={`${suma(T, "longitud_km").toLocaleString("es-BO", { maximumFractionDigits: 2 })} km de fibra`} />
      <Kpi t="Hilos" v={hilos} s={`${usados} usados · ${suma(T, "libres")} libres · ${pct(usados, hilos)}% de uso`} />
      <Kpi t="NAP" v={N.length} s={`${po} de ${pn} puertos ocupados (${pct(po, pn)}%)`} />
      <Kpi t="Postes" v={postes.data ?? 0} />
      <Kpi t="Fusiones" v={F.length} s={F.length ? `Pérdida media ${perdMedia.toFixed(2)} dB` : "Sin mediciones"} />
      <Kpi t="Mantenimientos de red abiertos" v={mant.data ?? 0} c={n(mant.data) ? "var(--warn)" : undefined} />
    </div>
    <div className="grid g2">
      <div className="card"><h2>Lo que conviene revisar</h2>
        {!sinLibres.length && !llenas.length && !altas && !ponDan && !hiloDan ? <Vacio>Todo en orden en la red.</Vacio> : <ul style={{ margin: 0, paddingLeft: 18 }}>
          {llenas.map(x => <li key={x.nap_id}>La NAP <b>{x.codigo}</b> no tiene puertos libres.</li>)}
          {sinLibres.map(t => <li key={t.troncal_id}>La troncal <b>{t.codigo}</b> tiene solo {n(t.libres)} {n(t.libres) === 1 ? "hilo libre" : "hilos libres"}.</li>)}
          {hiloDan > 0 && <li>Hay <b>{hiloDan}</b> {hiloDan === 1 ? "hilo dañado" : "hilos dañados"} en las troncales.</li>}
          {altas > 0 && <li><b>{altas}</b> {altas === 1 ? "fusión tiene" : "fusiones tienen"} pérdida alta (más de {PERDIDA_ALTA} dB).</li>}
          {ponDan > 0 && <li>Hay <b>{ponDan}</b> {ponDan === 1 ? "puerto PON dañado" : "puertos PON dañados"}.</li>}
        </ul>}
        <div className="fila" style={{ marginTop: 10 }}><button className="btn suave chico" onClick={() => ir("troncales")}>Ver troncales</button><button className="btn suave chico" onClick={() => ir("naps")}>Ver NAP</button><button className="btn suave chico" onClick={() => ir("olt")}>Ver OLT y PON</button></div></div>
      <div className="card"><h2>Últimos cambios en la red</h2>
        {H.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{H.map((h, i) => <li key={i}><span className="mute">{h.fecha}</span> · <b>{h.tipo}</b>{h.descripcion ? ` · ${h.descripcion}` : ""}{!zonaId && zonas.length > 1 ? <span className="mute"> ({nz(h.zona_id)})</span> : null}</li>)}</ul> : <Vacio>Aún no hay cambios registrados.</Vacio>}
        <div className="fila" style={{ marginTop: 10 }}><button className="btn suave chico" onClick={() => ir("hist")}>Ver todo el historial</button></div></div>
    </div>
  </>;
}

/* ============================ TRONCALES ============================ */
export function Troncales({ ir }: { ir: (tab: string, troncal?: string) => void }) {
  const { zonas, zonaId, proyectoId } = useApp(), al = useAlcance();
  const res = useQuery(() => al(supabase.from("v_troncales_resumen").select("*").order("codigo")), [proyectoId, zonaId]);
  const pons = useQuery(() => zonaId ? supabase.from("v_puertos_pon").select("id, olt_nombre, numero").eq("zona_id", zonaId).eq("estado", "LIBRE").order("olt_nombre").order("numero") : nada, [zonaId, res.data]);
  const vacio = { codigo: "", desde: "", hasta: "", tipo_fibra: "G.652D", longitud_km: "", hilos: "12", pon_id: "", observaciones: "" };
  const [f, setF] = useState(vacio), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false);
  const nz = (id: string) => zonas.find(z => z.id === id)?.nombre || "";
  const crear = async () => {
    setMsg(""); setOk(""); const zona = zonas.find(z => z.id === zonaId);
    if (!zona) return setMsg("Elige una zona arriba.");
    if (!f.codigo.trim()) return setMsg("Escribe el código de la troncal (por ejemplo TR-N-01).");
    if (n(f.hilos) < 1 || n(f.hilos) > 288) return setMsg("La cantidad de hilos va de 1 a 288.");
    setOcup(true);
    const { error } = await supabase.from("troncales").insert({ proyecto_id: zona.proyecto_id, zona_id: zona.id, codigo: f.codigo.trim(), desde: f.desde || null, hasta: f.hasta || null, tipo_fibra: f.tipo_fibra, longitud_km: n(f.longitud_km), hilos: Math.round(n(f.hilos)), pon_id: f.pon_id || null, observaciones: f.observaciones || null });
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
        <Campo l="Puerto PON de origen (opcional)"><select value={f.pon_id} onChange={e => setF({ ...f, pon_id: e.target.value })}><option value="">Ninguno</option>{((pons.data as any[]) || []).map(p => <option key={p.id} value={p.id}>{p.olt_nombre} · PON {p.numero}</option>)}</select></Campo>
        <Campo l="Observaciones"><input value={f.observaciones} onChange={e => setF({ ...f, observaciones: e.target.value })} /></Campo>
      </div>
      <button className="btn" disabled={ocup} onClick={crear}>{ocup ? "Creando…" : "Crear troncal"}</button>
      {!zonaId && <p className="mute">Elige una zona arriba para poder crear.</p>}</div>
    <div className="card tw"><h2>Troncales</h2>{res.loading ? <Cargando /> : R.length ? <table><thead><tr><th>Código</th><th>Zona</th><th>Recorrido</th><th>Fibra</th><th>Km</th><th>Hilos</th><th>Libres</th><th>Usados</th><th>Reservados</th><th>Dañados</th><th /></tr></thead>
      <tbody>{R.map(t => <tr key={t.troncal_id}><td><b>{t.codigo}</b></td><td>{nz(t.zona_id)}</td><td>{[t.desde, t.hasta].filter(Boolean).join(" → ") || "—"}</td><td>{t.tipo_fibra}</td><td>{n(t.longitud_km)}</td><td>{t.total}</td>
        <td>{t.libres}</td><td>{t.utilizados}</td><td>{t.reservados}</td><td style={{ color: n(t.danados) ? "var(--bad)" : undefined }}>{t.danados}</td>
        <td><div className="fila"><button className="btn suave chico" onClick={() => ir("hilos", t.troncal_id)}>Hilos y fusiones</button><button className="btn suave chico" onClick={() => quitar(t)}>A la papelera</button></div></td></tr>)}</tbody></table> : <Vacio>Aún no hay troncales.</Vacio>}</div>
  </>;
}

/* ============================ HILOS Y FUSIONES ============================ */
const SIGUIENTE: Record<string, string> = { LIBRE: "UTILIZADO", UTILIZADO: "RESERVADO", RESERVADO: "DAÑADO", "DAÑADO": "LIBRE" };

export function HilosFusiones({ troncalId, setTroncalId }: { troncalId: string; setTroncalId: (id: string) => void }) {
  const { zonaId, proyectoId } = useApp(), al = useAlcance();
  const lista = useQuery(() => al(supabase.from("v_troncales_resumen").select("*").order("codigo")), [proyectoId, zonaId]);
  const L: any[] = (lista.data as any[]) || [], t: any = L.find(x => x.troncal_id === troncalId) || L[0];
  const hilos = useQuery(() => t ? supabase.from("hilos").select("id, numero, estado").eq("troncal_id", t.troncal_id).order("numero") : nada, [t?.troncal_id]);
  const fus = useQuery(() => t ? supabase.from("v_fusiones").select("*").eq("troncal_id", t.troncal_id).order("fecha", { ascending: false }) : nada, [t?.troncal_id]);
  const naps = useQuery(() => t ? supabase.from("naps").select("id, codigo").eq("zona_id", t.zona_id).order("codigo") : nada, [t?.zona_id]);
  const [ov, setOv] = useState<Record<string, string>>({}), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false), [arch, setArch] = useState<File | null>(null);
  const vacio = { hilo_entrada: "", caja_empalme: "", splitter: "Sin splitter", hilo_salida: "", nap_id: "", perdida_db: "", fecha: hoy(), tecnico: "", observaciones: "" };
  const [f, setF] = useState(vacio);

  const cambiar = async (h: any) => {
    const nuevo = SIGUIENTE[ov[h.id] || h.estado]; setOv({ ...ov, [h.id]: nuevo }); setMsg("");
    const { error } = await supabase.from("hilos").update({ estado: nuevo }).eq("id", h.id);
    if (error) { setOv(o => { const c = { ...o }; delete c[h.id]; return c; }); setMsg(error.message); } else lista.recargar();
  };
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
      {hilos.loading ? <Cargando /> : <div className="hilos-grid">{H.map(h => { const c = colorHilo(h.numero); return <button key={h.id} className={"hilo " + est(h)} style={{ borderLeftColor: c.hex }} onClick={() => cambiar(h)}><b>Hilo {h.numero}</b><small>{c.nombre} · {est(h).toLowerCase()}</small></button>; })}</div>}</div>

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
        <td><div className="fila">{x.foto_path && <button className="btn suave chico" onClick={() => verFoto(x.foto_path)}>Ver foto</button>}<button className="btn suave chico" onClick={() => quitar(x)}>A la papelera</button></div></td></tr>)}</tbody></table> : <Vacio>Aún no hay fusiones registradas en esta troncal.</Vacio>}
      <p className="mute">La pérdida de una fusión suele estar por debajo de 0,1 dB. Desde {PERDIDA_ALTA} dB se marca en rojo como pérdida alta.</p></div>
  </>;
}

/* ============================ POSTES ============================ */
export function Postes() {
  return <Crud titulo="Postes y ferretería instalada" tabla="postes" conZona orden="creado_en"
    campos={[
      { k: "codigo", l: "Código del poste", req: true }, { k: "tipo", l: "Tipo", t: "select", opts: ["Madera 7 m", "Madera 9 m", "Concreto 9 m", "Concreto 12 m", "Metálico", "Otro"] },
      { k: "ferreteria", l: "Ferretería instalada (tensores, grampas…)" }, { k: "fecha_instalacion", l: "Fecha de instalación", t: "date" }, { k: "tecnico", l: "Técnico" },
      { k: "lat", l: "Latitud", t: "number" }, { k: "lng", l: "Longitud", t: "number" }, { k: "foto_path", l: "Foto", t: "archivo", bucket: "fotos" },
    ]}
    columnas={["codigo", "tipo", "ferreteria", "fecha_instalacion", "tecnico", "lat", "lng"]} />;
}

/* ============================ OLT Y PON ============================ */
export function OltPon() {
  const { zonas, zonaId, proyectoId } = useApp(), al = useAlcance();
  const olts = useQuery(() => al(supabase.from("v_olts_resumen").select("*").order("nombre")), [proyectoId, zonaId]);
  const [sel, setSel] = useState(""), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false);
  const O: any[] = (olts.data as any[]) || [], o: any = O.find(x => x.olt_id === sel) || O[0];
  const pon = useQuery(() => o ? supabase.from("v_puertos_pon").select("*").eq("olt_id", o.olt_id).order("numero") : nada, [o?.olt_id]);
  const vacio = { nombre: "", marca: "", modelo: "", serie: "", ip_gestion: "", ubicacion: "", puertos_pon: "8", fecha_instalacion: hoy(), estado: "ACTIVA", observaciones: "" };
  const [f, setF] = useState(vacio);
  const nz = (id: string) => zonas.find(z => z.id === id)?.nombre || "";

  const crear = async () => {
    setMsg(""); setOk(""); const zona = zonas.find(z => z.id === zonaId);
    if (!zona) return setMsg("Elige una zona arriba.");
    if (!f.nombre.trim()) return setMsg("Escribe el nombre de la OLT (por ejemplo OLT-Central).");
    if (n(f.puertos_pon) < 1 || n(f.puertos_pon) > 64) return setMsg("Los puertos PON van de 1 a 64.");
    setOcup(true);
    const { error } = await supabase.from("olts").insert({ proyecto_id: zona.proyecto_id, zona_id: zona.id, nombre: f.nombre.trim(), marca: f.marca || null, modelo: f.modelo || null, serie: f.serie || null, ip_gestion: f.ip_gestion || null, ubicacion: f.ubicacion || null, puertos_pon: Math.round(n(f.puertos_pon)), fecha_instalacion: f.fecha_instalacion || null, estado: f.estado, observaciones: f.observaciones || null });
    setOcup(false);
    if (error) return setMsg(msgUnico(error.message, "una OLT"));
    setF(vacio); setOk("OLT registrada con sus puertos PON."); olts.recargar();
  };
  const quitar = async (x: any) => { if (!confirm(`¿Mandar la OLT "${x.nombre}" a la papelera?\n\nSus puertos PON se ocultan con ella. Podrás restaurarla desde el menú Papelera.`)) return; try { await aPapelera("olts", [x.olt_id]); setSel(""); olts.recargar(); } catch (e: any) { setMsg(e.message); } };
  const guardarPon = async (p: any, cambios: any) => { setMsg(""); const { error } = await supabase.from("puertos_pon").update(cambios).eq("id", p.id); if (error) setMsg(error.message); else { pon.recargar(); olts.recargar(); } };

  const P: any[] = (pon.data as any[]) || [];
  return <>
    <Aviso>La <b>OLT</b> es el equipo central de la red. Cada OLT tiene <b>puertos PON</b>, y de cada puerto PON sale una troncal. Al registrar la OLT se crean sus puertos solos.</Aviso>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="card"><h2>Nueva OLT</h2><div className="form">
      <Campo l="Nombre *"><input value={f.nombre} placeholder="OLT-Central" onChange={e => setF({ ...f, nombre: e.target.value })} /></Campo>
      <Campo l="Marca"><input value={f.marca} onChange={e => setF({ ...f, marca: e.target.value })} /></Campo>
      <Campo l="Modelo"><input value={f.modelo} onChange={e => setF({ ...f, modelo: e.target.value })} /></Campo>
      <Campo l="N° de serie"><input value={f.serie} onChange={e => setF({ ...f, serie: e.target.value })} /></Campo>
      <Campo l="IP de gestión"><input value={f.ip_gestion} onChange={e => setF({ ...f, ip_gestion: e.target.value })} /></Campo>
      <Campo l="Ubicación"><input value={f.ubicacion} onChange={e => setF({ ...f, ubicacion: e.target.value })} /></Campo>
      <Campo l="Puertos PON *"><input type="number" min={1} max={64} list="pon-comunes" value={f.puertos_pon} onChange={e => setF({ ...f, puertos_pon: e.target.value })} /><datalist id="pon-comunes">{[2, 4, 8, 16].map(x => <option key={x} value={x} />)}</datalist></Campo>
      <Campo l="Fecha de instalación"><input type="date" value={f.fecha_instalacion} onChange={e => setF({ ...f, fecha_instalacion: e.target.value })} /></Campo>
      <Campo l="Estado"><select value={f.estado} onChange={e => setF({ ...f, estado: e.target.value })}>{["ACTIVA", "MANTENIMIENTO", "BAJA"].map(x => <option key={x}>{x}</option>)}</select></Campo>
      <Campo l="Observaciones"><input value={f.observaciones} onChange={e => setF({ ...f, observaciones: e.target.value })} /></Campo>
    </div><button className="btn" disabled={ocup} onClick={crear}>{ocup ? "Guardando…" : "Registrar OLT"}</button>{!zonaId && <p className="mute">Elige una zona arriba para poder registrar.</p>}</div>

    <div className="card tw"><h2>OLT</h2>{olts.loading ? <Cargando /> : O.length ? <table><thead><tr><th>Nombre</th><th>Zona</th><th>Equipo</th><th>IP</th><th>Estado</th><th>Puertos PON</th><th>En uso</th><th>Libres</th><th>Dañados</th><th /></tr></thead>
      <tbody>{O.map(x => <tr key={x.olt_id} className="clic" style={{ background: o?.olt_id === x.olt_id ? "var(--lilb)" : undefined }} onClick={() => setSel(x.olt_id)}><td><b>{x.nombre}</b></td><td>{nz(x.zona_id)}</td><td>{[x.marca, x.modelo].filter(Boolean).join(" ") || "—"}</td><td>{x.ip_gestion || "—"}</td><td>{x.estado}</td><td>{x.total}</td><td>{x.en_uso}</td><td>{x.libres}</td><td>{x.danados}</td>
        <td><button className="btn suave chico" onClick={e => { e.stopPropagation(); quitar(x); }}>A la papelera</button></td></tr>)}</tbody></table> : <Vacio>Aún no hay OLT registradas.</Vacio>}</div>

    {o && <div className="card tw"><h2>Puertos PON de {o.nombre}</h2>{pon.loading ? <Cargando /> : <table><thead><tr><th>PON</th><th>Estado</th><th>Potencia (dBm)</th><th>Nota</th></tr></thead>
      <tbody>{P.map(p => <tr key={p.id}><td><b>{p.numero}</b></td>
        <td><select value={p.estado} onChange={e => guardarPon(p, { estado: e.target.value })}>{["LIBRE", "EN USO", "DAÑADO"].map(x => <option key={x}>{x}</option>)}</select></td>
        <td><input type="number" step={0.01} style={{ width: 100 }} defaultValue={p.potencia_dbm ?? ""} onBlur={e => (e.target.value === "" ? p.potencia_dbm != null : n(e.target.value) !== n(p.potencia_dbm)) && guardarPon(p, { potencia_dbm: e.target.value === "" ? null : n(e.target.value) })} /></td>
        <td><input style={{ width: 220 }} defaultValue={p.nota ?? ""} onBlur={e => e.target.value !== (p.nota ?? "") && guardarPon(p, { nota: e.target.value || null })} /></td></tr>)}</tbody></table>}</div>}
  </>;
}
