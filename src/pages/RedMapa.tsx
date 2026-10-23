import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { aPapelera } from "../lib/papelera";
import { Aviso, Cargando, Vacio, useAlcance, useQuery } from "../lib/ui";
import { todas } from "../lib/datos";
import { MapaBase, LineaMapa, PuntoMapa } from "../lib/mapa";
import { Geo, aKML, fmtLong, leerArchivoGeo, longitudMetros } from "../lib/geo";

const n = (x: any) => Number(x) || 0;
const aDatos = (p: Promise<any[]>) => p.then(data => ({ data, error: null })).catch(e => ({ data: [] as any[], error: { message: e.message } }));
const COLOR_TRAZADO: Record<string, string> = { Troncal: "#7c2bc9", Ruta: "#0bb5bd", Otro: "#7a8190" };
const COLOR_ESTADO: Record<string, string> = { "PAGADO": "#1d9a5d", "POR VENCER": "#c9a017", "VENCIDO": "#e07b1a", "SUSPENDIDO": "#d23c3c", "BAJA": "#8a909c", "ACTIVO": "#1d9a5d" };
const simplificar = (c: [number, number][], max = 2000) => (c.length <= max ? c : [...c.filter((_, i) => i % Math.ceil(c.length / max) === 0), c[c.length - 1]]);
const descargar = (nombre: string, texto: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([texto], { type: "application/vnd.google-earth.kml+xml" })); a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
const verEnClientes = (q: string) => { sessionStorage.setItem("vx_q", q); sessionStorage.setItem("vx_tab_clientes", "lista"); location.hash = "#/clientes"; };

type Item = Geo & { sel: boolean };

/** Mapa de la red: NAP, postes, clientes y trazados de fibra. Se pueden importar archivos KML, KMZ y GPX y exportar a KML. */
export function MapaRed({ ir }: { ir: (tab: string) => void }) {
  const { zonas, zonaId, proyectoId, puede } = useApp(), al = useAlcance(), zona = zonas.find(z => z.id === zonaId), dep = [proyectoId, zonaId];
  const naps = useQuery(() => aDatos(todas(() => al(supabase.from("naps").select("id, codigo, tipo, puertos, lat, lng, zona_id").not("lat", "is", null).not("lng", "is", null).order("id")))), dep);
  const occ = useQuery(() => al(supabase.from("v_naps_ocupacion").select("nap_id, ocupados, total, danados").limit(1000)), dep);
  const postes = useQuery(() => aDatos(todas(() => al(supabase.from("postes").select("id, codigo, tipo, lat, lng, zona_id").not("lat", "is", null).not("lng", "is", null).order("id")))), dep);
  const clientes = useQuery(() => aDatos(todas(() => al(supabase.from("clientes").select("id, codigo, nombre, lat, lng, estado, plan_nombre, zona_id").not("lat", "is", null).not("lng", "is", null).order("id")))), dep);
  const cobr = useQuery(() => (puede("cobranzas", "ver") ? aDatos(todas(() => al(supabase.from("v_cobranza").select("cliente_id, estado_cuenta").order("cliente_id")))) : Promise.resolve({ data: [] as any[], error: null })), dep);
  const trz = useQuery(() => aDatos(todas(() => al(supabase.from("trazados_gps").select("id, nombre, tipo, coords, longitud_m, troncal_id, zona_id, origen").order("creado_en")))), dep);
  const trs = useQuery(() => zonaId ? supabase.from("v_troncales_resumen").select("troncal_id, codigo").eq("zona_id", zonaId) : Promise.resolve({ data: [], error: null }), [zonaId]);

  const [capas, setCapas] = useState({ nap: true, poste: true, cliente: true, trazado: true, importado: true }), [base, setBase] = useState<"calle" | "satelite">("calle"), [ajustar, setAjustar] = useState(0);
  const [imp, setImp] = useState<{ archivo: string; items: Item[] } | null>(null), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [usuario, setUsuario] = useState<{ lat: number; lng: number } | null>(null), [irA, setIrA] = useState<any>(null), [marca, setMarca] = useState<{ lat: number; lng: number } | null>(null), [codPoste, setCodPoste] = useState("");
  const [opt, setOpt] = useState({ tipo: "Troncal", troncal: "", actualizar: false }), [ocup, setOcup] = useState(false);

  const N: any[] = (naps.data as any[]) || [], P: any[] = (postes.data as any[]) || [], C: any[] = (clientes.data as any[]) || [], Z: any[] = (trz.data as any[]) || [], O: any[] = (occ.data as any[]) || [], K: any[] = (cobr.data as any[]) || [], TR: any[] = (trs.data as any[]) || [];
  const cargado = !naps.loading && !postes.loading && !clientes.loading && !trz.loading;
  useEffect(() => { if (cargado) setAjustar(a => a + 1); }, [cargado, zonaId, proyectoId]);
  const nz = (id: string) => zonas.find(z => z.id === id)?.nombre || "";

  const { puntos, lineas } = useMemo(() => {
    const pts: PuntoMapa[] = [], lns: LineaMapa[] = [];
    if (capas.nap) N.forEach(x => { const o = O.find(y => y.nap_id === x.id), p = o && n(o.total) ? Math.round((n(o.ocupados) / n(o.total)) * 100) : 0; pts.push({ id: "nap" + x.id, capa: "nap", lat: n(x.lat), lng: n(x.lng), radio: 10, color: n(o?.danados) > 0 ? "#d23c3c" : p >= 90 ? "#d23c3c" : p >= 70 ? "#e07b1a" : "#7c2bc9", titulo: "NAP " + x.codigo,
      detalle: <div><div>{x.tipo} · {x.puertos} puertos{o ? ` · ${n(o.ocupados)} ocupados (${p}%)` : ""}{n(o?.danados) ? ` · ${o.danados} dañado(s)` : ""}</div><div className="mute">Zona {nz(x.zona_id)}</div><button className="btn suave chico" style={{ marginTop: 6 }} onClick={() => ir("naps")}>Abrir en Red y NAP</button></div> }); });
    if (capas.poste) P.forEach(x => pts.push({ id: "poste" + x.id, capa: "poste", lat: n(x.lat), lng: n(x.lng), radio: 6, color: "#2b6cb0", titulo: "Poste " + x.codigo, detalle: <div>{x.tipo || "Poste"} · Zona {nz(x.zona_id)}</div> }));
    if (capas.cliente) C.forEach(x => { const est = K.find(k => k.cliente_id === x.id)?.estado_cuenta || x.estado; pts.push({ id: "cli" + x.id, capa: "cliente", lat: n(x.lat), lng: n(x.lng), radio: 5, color: COLOR_ESTADO[est] || "#1d9a5d", titulo: x.nombre, detalle: <div><div>{x.codigo} · {x.plan_nombre || ""}</div><div className="mute">{String(est).charAt(0) + String(est).slice(1).toLowerCase()} · Zona {nz(x.zona_id)}</div>{puede("clientes", "ver") && <button className="btn suave chico" style={{ marginTop: 6 }} onClick={() => verEnClientes(x.nombre)}>Ver en Clientes</button>}</div> }); });
    if (capas.trazado) Z.forEach(x => lns.push({ id: "trz" + x.id, capa: "trazado", coords: x.coords as [number, number][], color: COLOR_TRAZADO[x.tipo] || "#7a8190", ancho: 4, titulo: x.nombre,
      detalle: <div><div>{x.tipo} · {fmtLong(n(x.longitud_m))}{x.troncal_id ? " · Troncal " + (TR.find(t => t.troncal_id === x.troncal_id)?.codigo || "") : ""}</div>{x.origen && <div className="mute">Archivo: {x.origen}</div>}{puede("red", "eliminar") && <button className="btn suave chico" style={{ marginTop: 6 }} onClick={() => quitarTrazado(x)}>Quitar trazado</button>}</div> }));
    if (capas.importado && imp) imp.items.forEach((it, i) => { if (!it.sel) return; if (it.tipo === "punto") pts.push({ id: "imp" + i, capa: "importado", lat: it.coords[0][0], lng: it.coords[0][1], radio: 7, color: "#f59e0b", titulo: it.nombre, detalle: <div>{it.descripcion || "Punto importado"}</div> });
      else lns.push({ id: "imp" + i, capa: "importado", coords: it.coords, color: "#f59e0b", ancho: 4, poligono: it.tipo === "poligono", titulo: it.nombre, detalle: <div>{it.tipo === "linea" ? "Línea · " + fmtLong(longitudMetros(it.coords)) : "Área"}{it.descripcion ? <div className="mute">{it.descripcion}</div> : null}</div> }); });
    return { puntos: pts, lineas: lns };
  }, [N.length, P.length, C.length, Z.length, O.length, K.length, capas, imp, TR.length, zonaId]);

  const quitarTrazado = async (x: any) => { if (!confirm(`¿Mandar el trazado "${x.nombre}" a la papelera?`)) return; try { await aPapelera("trazados_gps", [x.id]); setOk("Trazado enviado a la papelera."); trz.recargar(); } catch (e: any) { setMsg(e.message); } };
  const abrir = async (f?: File | null) => {
    setMsg(""); setOk(""); if (!f) return;
    try { const g = await leerArchivoGeo(f); setImp({ archivo: f.name, items: g.map(x => ({ ...x, sel: true })) }); setAjustar(a => a + 1); setOpt({ tipo: g.some(x => x.tipo === "linea") ? "Troncal" : "Otro", troncal: "", actualizar: false }); } catch (e: any) { setImp(null); setMsg(e.message); }
  };
  const selItems = imp?.items.filter(i => i.sel) || [], lineasSel = selItems.filter(i => i.tipo === "linea"), puntosSel = selItems.filter(i => i.tipo === "punto");
  const puedeGuardar = !!zona && puede("red", "crear");
  const guardarTrazados = async () => {
    setMsg(""); setOk(""); if (!zona) return setMsg("Elige una zona arriba para guardar los trazados."); if (!lineasSel.length) return setMsg("No hay líneas marcadas.");
    setOcup(true);
    try {
      const filas = lineasSel.map(l => ({ proyecto_id: zona.proyecto_id, zona_id: zona.id, nombre: l.nombre, tipo: opt.tipo, troncal_id: opt.troncal || null, coords: simplificar(l.coords), longitud_m: Math.round(longitudMetros(l.coords) * 10) / 10, origen: imp?.archivo || null }));
      const { error } = await supabase.from("trazados_gps").insert(filas); if (error) throw new Error(error.message);
      if (opt.troncal && opt.actualizar) { const km = Math.round((filas.reduce((s, f) => s + f.longitud_m, 0) / 1000) * 1000) / 1000; const r = await supabase.from("troncales").update({ longitud_km: km }).eq("id", opt.troncal); if (r.error) throw new Error("Los trazados se guardaron, pero no se pudo actualizar la troncal: " + r.error.message); }
      setOk(`${filas.length} trazado(s) guardado(s)${opt.troncal && opt.actualizar ? " y largo de la troncal actualizado" : ""}.`); setImp(x => (x ? { ...x, items: x.items.map(i => (i.tipo === "linea" ? { ...i, sel: false } : i)) } : x)); trz.recargar();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  const crearPostes = async () => {
    setMsg(""); setOk(""); if (!zona) return setMsg("Elige una zona arriba para crear los postes."); if (!puntosSel.length) return setMsg("No hay puntos marcados.");
    setOcup(true);
    try {
      const ya = await todas(() => supabase.from("postes").select("codigo").eq("zona_id", zona.id).order("id")), usados = new Set(ya.map((x: any) => String(x.codigo).toLowerCase()));
      let k = ya.length, omitidos = 0; const filas: any[] = [];
      puntosSel.forEach(p => { let cod = (p.nombre && p.nombre !== "Sin nombre" ? p.nombre : "").trim(); if (!cod) { do { k++; cod = "P-" + String(k).padStart(3, "0"); } while (usados.has(cod.toLowerCase())); } if (usados.has(cod.toLowerCase())) { omitidos++; return; } usados.add(cod.toLowerCase()); filas.push({ proyecto_id: zona.proyecto_id, zona_id: zona.id, codigo: cod, lat: p.coords[0][0], lng: p.coords[0][1], observaciones: p.descripcion || null }); });
      if (filas.length) { const { error } = await supabase.from("postes").insert(filas); if (error) throw new Error(error.message); }
      setOk(`${filas.length} poste(s) creado(s)${omitidos ? `; ${omitidos} omitido(s) porque ya existe un poste con ese código` : ""}.`); setImp(x => (x ? { ...x, items: x.items.map(i => (i.tipo === "punto" ? { ...i, sel: false } : i)) } : x)); postes.recargar();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  const crearPosteAqui = async () => {
    setMsg(""); setOk(""); if (!zona || !marca) return; if (!codPoste.trim()) return setMsg("Escribe el código del poste.");
    const { error } = await supabase.from("postes").insert({ proyecto_id: zona.proyecto_id, zona_id: zona.id, codigo: codPoste.trim(), lat: Math.round(marca.lat * 1e6) / 1e6, lng: Math.round(marca.lng * 1e6) / 1e6 });
    if (error) return setMsg(/duplicate key|unique/i.test(error.message) ? "Ya existe un poste con ese código en esta zona." : error.message); setOk(`Poste ${codPoste.trim()} creado.`); setCodPoste(""); setMarca(null); postes.recargar();
  };
  const ubicarme = () => { setMsg(""); if (!navigator.geolocation) return setMsg("Tu navegador no puede dar la ubicación."); navigator.geolocation.getCurrentPosition(p => { const u = { lat: p.coords.latitude, lng: p.coords.longitude }; setUsuario(u); setIrA({ ...u, k: Date.now() }); }, () => setMsg("No se pudo obtener tu ubicación. Revisa que el navegador tenga permiso para usarla."), { enableHighAccuracy: true, timeout: 15000 }); };
  const exportar = () => {
    const kml = aKML("Red Vortex", [
      { nombre: "NAP", puntos: capas.nap ? N.map(x => ({ nombre: x.codigo, descripcion: `${x.tipo} · ${x.puertos} puertos`, lat: n(x.lat), lng: n(x.lng) })) : [] },
      { nombre: "Postes", puntos: capas.poste ? P.map(x => ({ nombre: x.codigo, lat: n(x.lat), lng: n(x.lng) })) : [] },
      { nombre: "Clientes", puntos: capas.cliente ? C.map(x => ({ nombre: `${x.codigo} ${x.nombre}`, lat: n(x.lat), lng: n(x.lng) })) : [] },
      { nombre: "Trazados", lineas: capas.trazado ? Z.map(x => ({ nombre: `${x.nombre} (${x.tipo})`, coords: x.coords })) : [] }]);
    descargar(`red-vortex-${new Date().toISOString().slice(0, 10)}.kml`, kml);
  };
  const copiar = async () => { if (!marca) return; const t = `${marca.lat.toFixed(6)}, ${marca.lng.toFixed(6)}`; try { await navigator.clipboard.writeText(t); setOk("Coordenadas copiadas: " + t); } catch { setMsg("No se pudo copiar. Las coordenadas son: " + t); } };

  const conteos: [keyof typeof capas, string, number, string][] = [["nap", "NAP", N.length, "#7c2bc9"], ["poste", "Postes", P.length, "#2b6cb0"], ["cliente", "Clientes", C.length, "#1d9a5d"], ["trazado", "Trazados de fibra", Z.length, "#7c2bc9"], ["importado", "Archivo importado", imp ? imp.items.length : 0, "#f59e0b"]];
  if (!cargado) return <Cargando />;
  return <>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="grid" style={{ gridTemplateColumns: "minmax(0, 3fr) minmax(250px, 1fr)", alignItems: "start" }}>
      <div className="card" style={{ padding: 8 }}>
        <MapaBase puntos={puntos} lineas={lineas} base={base} alto={560} ajustar={ajustar} usuario={usuario} marca={marca} irA={irA} onClickMapa={(lat, lng) => setMarca({ lat, lng })} />
        {marca && <div className="fila" style={{ marginTop: 8 }}><b>{marca.lat.toFixed(6)}, {marca.lng.toFixed(6)}</b><button className="btn suave chico" onClick={copiar}>Copiar</button>
          {zona && puede("red", "crear") && <><input placeholder="Código del poste" value={codPoste} onChange={e => setCodPoste(e.target.value)} style={{ width: 150 }} /><button className="btn chico" onClick={crearPosteAqui}>Crear poste aquí</button></>}<button className="btn suave chico" onClick={() => setMarca(null)}>Quitar marca</button></div>}
        {!puntos.length && !lineas.length && <p className="mute" style={{ margin: "8px 0 0" }}>Todavía no hay puntos con coordenadas. Agrega el GPS a las NAP, los postes y los clientes, o importa un archivo KML, KMZ o GPX.</p>}
      </div>
      <div>
        <div className="card"><h2>Capas</h2>{conteos.map(([k, l, c, col]) => <label key={k} className="fila" style={{ padding: "2px 0" }}><input type="checkbox" checked={capas[k]} onChange={e => setCapas({ ...capas, [k]: e.target.checked })} /><span style={{ width: 11, height: 11, borderRadius: "50%", background: col, display: "inline-block" }} /> {l} <small className="mute">({c})</small></label>)}
          <div className="fila" style={{ marginTop: 8 }}><button className={"btn chico " + (base === "calle" ? "" : "suave")} onClick={() => setBase("calle")}>Calle</button><button className={"btn chico " + (base === "satelite" ? "" : "suave")} onClick={() => setBase("satelite")}>Satélite</button></div>
          <p className="mute" style={{ margin: "8px 0 0" }}>NAP: morado normal, naranja desde 70% de ocupación, rojo desde 90% o con puertos dañados. Clientes: según su estado de cuenta.</p></div>
        <div className="card"><h2>Herramientas</h2><div className="fila">
          <label className="btn" style={{ cursor: "pointer" }}>Importar KML, KMZ o GPX<input type="file" accept=".kml,.kmz,.gpx" style={{ display: "none" }} onChange={e => { abrir(e.target.files?.[0]); e.target.value = ""; }} /></label>
          <button className="btn suave" onClick={exportar}>Exportar a KML</button><button className="btn suave" onClick={ubicarme}>📍 Ubicarme</button></div>
          <p className="mute" style={{ margin: "8px 0 0" }}>Toca un punto del mapa para ver su información. Toca un lugar vacío para ver sus coordenadas.</p></div>
        {imp && <div className="card"><div className="fila entre"><h2 style={{ margin: 0 }}>Archivo importado</h2><button className="btn suave chico" onClick={() => setImp(null)}>Quitar</button></div><p className="mute" style={{ margin: "4px 0 8px" }}>{imp.archivo} · {imp.items.filter(i => i.tipo === "punto").length} puntos, {imp.items.filter(i => i.tipo === "linea").length} líneas, {imp.items.filter(i => i.tipo === "poligono").length} áreas. Solo se ven en el mapa; para guardarlos usa los botones de abajo.</p>
          <div style={{ maxHeight: 190, overflow: "auto", marginBottom: 8 }}>{imp.items.map((it, i) => <label key={i} className="fila" style={{ padding: "2px 0", alignItems: "flex-start" }}><input type="checkbox" checked={it.sel} onChange={e => setImp({ ...imp, items: imp.items.map((x, j) => (j === i ? { ...x, sel: e.target.checked } : x)) })} /><span>{it.nombre} <small className="mute">{it.tipo === "punto" ? "punto" : it.tipo === "linea" ? "línea " + fmtLong(longitudMetros(it.coords)) : "área"}</small></span></label>)}</div>
          {!puedeGuardar && <p className="mute">Para guardar, elige una zona arriba y que tu rol pueda crear en Red.</p>}
          {lineasSel.length > 0 && <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}><b>Guardar {lineasSel.length} línea(s) como trazado</b><div className="form" style={{ gridTemplateColumns: "1fr", marginTop: 4 }}>
            <select value={opt.tipo} onChange={e => setOpt({ ...opt, tipo: e.target.value })}><option>Troncal</option><option>Ruta</option><option>Otro</option></select>
            <select value={opt.troncal} onChange={e => setOpt({ ...opt, troncal: e.target.value })}><option value="">Sin ligar a una troncal</option>{TR.map(t => <option key={t.troncal_id} value={t.troncal_id}>Troncal {t.codigo}</option>)}</select>
            {opt.troncal && <label className="fila"><input type="checkbox" checked={opt.actualizar} onChange={e => setOpt({ ...opt, actualizar: e.target.checked })} /> Actualizar el largo (km) de la troncal con el del trazado</label>}</div>
            <button className="btn" style={{ width: "100%", marginTop: 6 }} disabled={ocup || !puedeGuardar} onClick={guardarTrazados}>Guardar trazado(s)</button></div>}
          {puntosSel.length > 0 && <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 8 }}><b>{puntosSel.length} punto(s) marcados</b><button className="btn" style={{ width: "100%", marginTop: 6 }} disabled={ocup || !puedeGuardar} onClick={crearPostes}>Crear postes con estos puntos</button><p className="mute" style={{ margin: "4px 0 0" }}>El nombre del punto pasa a ser el código del poste.</p></div>}</div>}
      </div></div>
  </>;
}
