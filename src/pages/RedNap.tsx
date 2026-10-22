import { useState } from "react";
import { supabase, subirArchivo, urlArchivo } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { aPapelera } from "../lib/papelera";
import { Aviso, Campo, Cargando, Modal, Vacio, hoy, useAlcance, useQuery } from "../lib/ui";
import { FormModal } from "../lib/formmodal";

const n = (x: any) => Number(x) || 0;
const SPLITTERS: [string, string][] = [["", "Sin splitter"], ["1:2", "1:2"], ["1:4", "1:4"], ["1:8", "1:8"], ["1:16", "1:16"], ["1:32", "1:32"], ["1:64", "1:64"]];
const fechaCorta = (d?: string) => (d ? d.split("-").reverse().join("/") : "");

export default function RedNap() {
  const { zonaId, proyectoId, zonas } = useApp(), al = useAlcance(), zona = zonas.find(z => z.id === zonaId);
  const naps = useQuery(() => al(supabase.from("naps").select("*, zonas(nombre)").order("codigo")), [proyectoId, zonaId]);
  const occ = useQuery(() => al(supabase.from("v_naps_ocupacion").select("nap_id, ocupados, libres, reservados, danados, total")), [proyectoId, zonaId, naps.data]);
  const trs = useQuery(() => al(supabase.from("v_troncales_resumen").select("troncal_id, codigo, zona_id")), [proyectoId, zonaId, naps.data]);
  const [sel, setSel] = useState(""), [pt, setPt] = useState<any>(null), [msg, setMsg] = useState(""), [editNap, setEditNap] = useState<any>(null), [nueva, setNueva] = useState(false), [subiendo, setSubiendo] = useState("");
  const lista: any[] = (naps.data as any[]) || [], O: any[] = (occ.data as any[]) || [], nap = lista.find(x => x.id === sel) || lista[0];
  const puertos = useQuery(() => nap ? supabase.from("puertos").select("*, clientes!puertos_cliente_fk(nombre)").eq("nap_id", nap.id).order("numero") : Promise.resolve({ data: [], error: null }), [nap?.id]);
  const P: any[] = (puertos.data as any[]) || [], cuenta = (e: string) => P.filter(p => p.estado === e).length, utilizacion = P.length ? Math.round((cuenta("OCUPADO") / P.length) * 100) : 0;
  const ocupDe = (id: string) => O.find(x => x.nap_id === id);
  const troncalDe = (t?: string) => ((trs.data as any[]) || []).find(x => x.troncal_id === t)?.codigo;
  const alimenta = (x: any) => [x.troncal_id && "Troncal " + (troncalDe(x.troncal_id) || ""), x.padre_id && "NAP " + (lista.find(y => y.id === x.padre_id)?.codigo || "")].filter(Boolean).join(" · ") || "—";

  const quitar = async (x: any) => { setMsg(""); if (!confirm(`¿Mandar la NAP "${x.codigo}" a la papelera?\n\nSus puertos se ocultan con ella. Si tiene clientes conectados, no se podrá. Podrás restaurarla desde Configuración → Papelera.`)) return; try { await aPapelera("naps", [x.id]); if (sel === x.id) setSel(""); naps.recargar(); } catch (e: any) { setMsg(e.message); } };
  const subir = async (campo: "foto_path" | "esquema_path", file?: File | null) => {
    if (!file || !nap) return; setMsg(""); setSubiendo(campo);
    try { const ruta = await subirArchivo("fotos", nap.proyecto_id, file); const { error } = await supabase.from("naps").update({ [campo]: ruta }).eq("id", nap.id); if (error) throw new Error(error.message); naps.recargar(); } catch (e: any) { setMsg(e.message); }
    setSubiendo("");
  };
  const ver = async (ruta: string) => { const u = await urlArchivo("fotos", ruta); if (u) window.open(u, "_blank"); else setMsg("No se pudo abrir el archivo."); };
  const estadosPuerto = [["OCUPADO", "var(--lil)"], ["RESERVADO", "var(--warn)"], ["DAÑADO", "var(--bad)"], ["LIBRE", "var(--ok)"]] as const;

  return <>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}
    <div className="card tw"><div className="fila entre"><h2>NAP {zona ? "de la zona " + zona.nombre : "de todas las zonas"}</h2>
      <button className="btn" disabled={!zona} onClick={() => setNueva(true)} title={zona ? "" : "Elige una zona arriba"}>+ Nueva NAP{zona ? " en zona " + zona.nombre : ""}</button></div>
      {naps.loading ? <Cargando /> : lista.length ? <><table><thead><tr><th>NAP</th>{!zona && <th>Zona</th>}<th>Tipo</th><th>Puertos</th><th>Ocupados</th><th>Libres</th><th>Se alimenta de</th><th>Utilización</th><th /></tr></thead>
        <tbody>{lista.map(x => { const o = ocupDe(x.id), u = o && n(o.total) ? Math.round((n(o.ocupados) / n(o.total)) * 100) : 0; return <tr key={x.id} className="click" onClick={() => setSel(x.id)} style={nap?.id === x.id ? { background: "var(--lilb)" } : undefined}>
          <td><b>{x.codigo}</b></td>{!zona && <td>{x.zonas?.nombre}</td>}<td>{x.tipo}</td><td>{x.puertos}</td><td>{o ? n(o.ocupados) : "—"}</td><td>{o ? n(o.libres) : "—"}</td><td>{alimenta(x)}</td>
          <td style={{ minWidth: 110 }}><div className="barra-estados" style={{ width: 90, display: "inline-flex", verticalAlign: "middle" }}><i style={{ width: u + "%", background: u >= 90 ? "var(--bad)" : u >= 70 ? "var(--warn)" : "var(--lil)" }} /></div> <small className="mute">{u}%</small></td>
          <td><div className="fila"><button className="btn suave chico" onClick={e => { e.stopPropagation(); setEditNap(x); }}>Editar</button><button className="btn suave chico" onClick={e => { e.stopPropagation(); quitar(x); }}>A la papelera</button></div></td></tr>; })}</tbody></table>
        <p className="mute" style={{ margin: "8px 0 0" }}>Total {zona ? "de la zona" : "mostrado"}: <b>{lista.length} NAP</b></p></> : <Vacio>Aún no hay NAP{zona ? " en esta zona" : ""}.</Vacio>}</div>

    {nap && <>
      <div className="fila" style={{ margin: "4px 0 10px" }}><select value={nap.id} onChange={e => setSel(e.target.value)}>{lista.map(x => <option key={x.id} value={x.id}>{x.codigo}</option>)}</select>
        <span className="mute">Zona {nap.zonas?.nombre}{nap.troncal_id ? " · Troncal " + (troncalDe(nap.troncal_id) || "") : ""} · {nap.puertos} puertos</span></div>
      <div className="card"><h2>Puertos de {nap.codigo}</h2>{puertos.loading ? <Cargando /> : <>
        <div className="puertos">{P.map(p => <div key={p.id} className={"puerto " + p.estado} title={p.clientes?.nombre || p.reservado_para || p.estado} onClick={() => setPt(p)}>{p.numero}</div>)}</div>
        <div className="leyenda-puertos">{estadosPuerto.map(([e, c]) => <span key={e}><span style={{ color: c }}>●</span> {e.charAt(0) + e.slice(1).toLowerCase()} <b>{cuenta(e)}</b></span>)}</div>
        <div className="barra-estados">{estadosPuerto.map(([e, c]) => <i key={e} style={{ width: (P.length ? (cuenta(e) / P.length) * 100 : 0) + "%", background: c }} />)}</div>
        <p className="mute" style={{ margin: "8px 0 0" }}>Toca un puerto para ver su historial y cambiar su estado. Utilización: <b>{utilizacion}%</b>.</p></>}</div>

      <div className="card"><h2>Ficha de {nap.codigo}</h2>
        <dl className="ficha">
          <dt>Tipo de NAP</dt><dd>{nap.tipo}</dd>
          <dt>Zona / troncal</dt><dd>{nap.zonas?.nombre}{nap.troncal_id ? " / " + (troncalDe(nap.troncal_id) || "") : ""}{nap.padre_id ? " · conectada a " + (lista.find(y => y.id === nap.padre_id)?.codigo || "otra NAP") : ""}</dd>
          <dt>Capacidad</dt><dd>{nap.puertos} puertos{nap.splitter ? " · splitter " + nap.splitter : ""}</dd>
          <dt>Instalada por</dt><dd>{nap.instalada_por || nap.fecha_instalacion ? [nap.instalada_por, fechaCorta(nap.fecha_instalacion)].filter(Boolean).join(", ") : "—"}</dd>
          <dt>Ferretería</dt><dd>{nap.ferreteria || "—"}</dd>
          <dt>Ubicación</dt><dd>{nap.ubicacion || "—"}</dd>
          <dt>GPS</dt><dd>{nap.lat != null && nap.lng != null ? <>{nap.lat}, {nap.lng} · <a href={`https://www.google.com/maps?q=${nap.lat},${nap.lng}`} target="_blank" rel="noreferrer">Abrir en Google Maps</a></> : "—"}</dd>
          <dt>Observaciones</dt><dd>{nap.observaciones || "—"}</dd></dl>
        <div className="grid g2" style={{ marginTop: 12 }}>
          <div><b>Fotos de la NAP</b><div className="fila" style={{ marginTop: 4 }}><input type="file" accept="image/*" disabled={subiendo === "foto_path"} onChange={e => subir("foto_path", e.target.files?.[0])} />{nap.foto_path && <button className="btn suave chico" onClick={() => ver(nap.foto_path)}>Ver foto</button>}</div></div>
          <div><b>Esquema de fusiones</b><div className="fila" style={{ marginTop: 4 }}><input type="file" accept="image/*,application/pdf" disabled={subiendo === "esquema_path"} onChange={e => subir("esquema_path", e.target.files?.[0])} />{nap.esquema_path && <button className="btn suave chico" onClick={() => ver(nap.esquema_path)}>Ver esquema</button>}</div></div></div>
        <p className="mute" style={{ margin: "8px 0 0" }}>{subiendo ? "Subiendo…" : "Al elegir un archivo se guarda solo. Para cambiarlo, elige otro."}</p></div></>}

    {nueva && zona && <FormModal titulo={"Nueva NAP en zona " + zona.nombre} ancho={640} onClose={() => setNueva(false)} valores={{ tipo: "Secundaria", puertos: "16", splitter: "", fecha_instalacion: hoy() }}
      campos={[{ k: "codigo", l: "Código (ej. NAP-A1-01)", req: true }, { k: "tipo", l: "Tipo", t: "select", opts: [["Principal", "Principal"], ["Secundaria", "Secundaria"]] }, { k: "puertos", l: "Puertos", t: "select", opts: [["8", "8"], ["16", "16"], ["32", "32"], ["64", "64"]] }, { k: "splitter", l: "Splitter", t: "select", opts: SPLITTERS },
        { k: "instalada_por", l: "Instalada por" }, { k: "fecha_instalacion", l: "Fecha de instalación", t: "date" }, { k: "lat", l: "Latitud", t: "number", paso: 0.000001 }, { k: "lng", l: "Longitud", t: "number", paso: 0.000001 }]}
      extra={<p className="mute">Al crearla se generan sus puertos solos. La ferretería, las fotos y el esquema los completas después en su ficha.</p>}
      onGuardar={async f => { const { error } = await supabase.from("naps").insert({ proyecto_id: zona.proyecto_id, zona_id: zona.id, codigo: String(f.codigo).trim(), tipo: f.tipo, puertos: +f.puertos, splitter: f.splitter, instalada_por: f.instalada_por, fecha_instalacion: f.fecha_instalacion, lat: f.lat, lng: f.lng });
        if (error) return /duplicate key|unique/i.test(error.message) ? "Ya existe una NAP con ese código en esta zona. Si la mandaste a la papelera, restáurala desde Configuración → Papelera o usa otro código." : error.message; naps.recargar(); }} />}
    {editNap && <EditarNap nap={editNap} lista={lista} troncales={((trs.data as any[]) || []).filter(t => t.zona_id === editNap.zona_id)} onClose={() => setEditNap(null)} onListo={() => { setEditNap(null); naps.recargar(); puertos.recargar(); }} />}
    {pt && <Puerto p={pt} onClose={() => setPt(null)} onListo={() => { setPt(null); puertos.recargar(); occ.recargar(); }} />}
  </>;
}

function Puerto({ p, onClose, onListo }: any) {
  const hist = useQuery(() => supabase.from("puertos_historial").select("*").eq("puerto_id", p.id).order("fecha", { ascending: false }).limit(15), [p.id]);
  const [e, setE] = useState(p.estado), [r, setR] = useState({ para: p.reservado_para || "", tel: p.reservado_tel || "", hasta: p.reservado_hasta || "" }), [msg, setMsg] = useState("");
  const guardar = async () => {
    const cambios: any = { estado: e }; if (e === "RESERVADO") { if (!r.para.trim()) return setMsg("Escribe para quién se reserva."); Object.assign(cambios, { reservado_para: r.para, reservado_tel: r.tel, reservado_hasta: r.hasta || null }); } else Object.assign(cambios, { reservado_para: null, reservado_tel: null, reservado_hasta: null });
    const { error } = await supabase.from("puertos").update(cambios).eq("id", p.id); if (error) setMsg(error.message); else onListo();
  };
  return <Modal titulo={"Puerto " + p.numero} onClose={onClose}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    {p.estado === "OCUPADO" ? <p>Ocupado por <b>{p.clientes?.nombre}</b>. Para liberarlo, da de baja al cliente en Clientes.</p> : <>
      <Campo l="Estado"><select value={e} onChange={x => setE(x.target.value)}><option>LIBRE</option><option>RESERVADO</option><option>DAÑADO</option></select></Campo>
      {e === "RESERVADO" && <div className="form"><Campo l="¿Para quién?"><input value={r.para} onChange={x => setR({ ...r, para: x.target.value })} /></Campo><Campo l="Teléfono"><input value={r.tel} onChange={x => setR({ ...r, tel: x.target.value })} /></Campo><Campo l="Reservado hasta"><input type="date" min={hoy()} value={r.hasta} onChange={x => setR({ ...r, hasta: x.target.value })} /></Campo></div>}
      <button className="btn" onClick={guardar}>Guardar</button></>}
    <h3 style={{ marginTop: 16 }}>Historial de este puerto</h3>{hist.loading ? <Cargando /> : ((hist.data as any[]) || []).length ? <table style={{ minWidth: 0 }}><tbody>{((hist.data as any[]) || []).map(h => <tr key={h.id}><td style={{ whiteSpace: "nowrap" }}>{String(h.fecha).slice(0, 10)}</td><td><b>{h.estado_anterior} → {h.estado_nuevo}</b><br /><span className="mute">{h.detalle} · {h.usuario}</span></td></tr>)}</tbody></table> : <p className="mute">Todavía no hubo cambios en este puerto.</p>}</Modal>;
}

function EditarNap({ nap, lista, troncales, onClose, onListo }: any) {
  const [msg, setMsg] = useState(""), [nuevo, setNuevo] = useState(""), [ocup, setOcup] = useState(false);
  const opciones = [8, 16, 24, 32, 48, 64, 96, 128].filter(x => x > nap.puertos);
  const ampliar = async () => { setMsg(""); setOcup(true); const { error } = await supabase.rpc("ampliar_nap", { p_nap: nap.id, p_total: +nuevo }); setOcup(false); if (error) return setMsg(error.message); onListo(); };
  const otras = lista.filter((x: any) => x.zona_id === nap.zona_id && x.id !== nap.id);
  return <FormModal titulo={"Editar " + nap.codigo} ancho={680} valores={nap} onClose={onClose}
    campos={[{ k: "codigo", l: "Código", req: true }, { k: "tipo", l: "Tipo", t: "select", opts: [["Principal", "Principal"], ["Secundaria", "Secundaria"]] }, { k: "splitter", l: "Splitter", t: "select", opts: SPLITTERS },
      { k: "instalada_por", l: "Instalada por" }, { k: "fecha_instalacion", l: "Fecha de instalación", t: "date" }, { k: "ferreteria", l: "Ferretería (tensores, grampas, herrajes…)" },
      { k: "ubicacion", l: "Ubicación o referencia" }, { k: "lat", l: "Latitud", t: "number", paso: 0.000001 }, { k: "lng", l: "Longitud", t: "number", paso: 0.000001 },
      { k: "troncal_id", l: "Recibe la fibra de la troncal", t: "select", opts: [["", "Ninguna"], ...troncales.map((t: any) => [t.troncal_id, t.codigo] as [string, string])] },
      { k: "padre_id", l: "Se conecta a la NAP", t: "select", opts: [["", "Ninguna"], ...otras.map((x: any) => [x.id, x.codigo] as [string, string])] }, { k: "observaciones", l: "Observaciones" }]}
    onGuardar={async f => { const { error } = await supabase.from("naps").update(f).eq("id", nap.id); if (error) return /duplicate key|unique/i.test(error.message) ? "Ya existe una NAP con ese código en esta zona." : error.message; onListo(); }}
    extra={<div className="card" style={{ marginTop: 14 }}><h2>Ampliar puertos</h2>{msg && <Aviso tipo="mal">{msg}</Aviso>}
      {opciones.length ? <><p className="mute" style={{ marginTop: 0 }}>Hoy tiene <b>{nap.puertos}</b> puertos. Los puertos solo se pueden aumentar, nunca quitar. Los nuevos nacen libres.</p>
        <div className="fila"><select value={nuevo} onChange={e => setNuevo(e.target.value)}><option value="">Nuevo total…</option>{opciones.map(x => <option key={x} value={x}>{x} puertos</option>)}</select><button className="btn suave" disabled={!nuevo || ocup} onClick={ampliar}>{ocup ? "Ampliando…" : "Ampliar"}</button></div></> : <p className="mute" style={{ margin: 0 }}>Ya tiene el máximo de 128 puertos.</p>}</div>} />;
}
