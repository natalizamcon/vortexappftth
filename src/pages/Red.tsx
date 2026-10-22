import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Modal, Tabs, Vacio, useAlcance, useQuery, hoy } from "../lib/ui";
import Crud from "../lib/crud";
import { HilosFusiones, OltPon, PanelRed, Postes, Troncales } from "./RedInfra";
import { aPapelera } from "../lib/papelera";
import { FormModal } from "../lib/formmodal";

export default function Red() {
  const { zonaId, proyectoId, zonas } = useApp(), al = useAlcance();
  const [tab, setTab] = useState("panel"), [troncalSel, setTroncalSel] = useState(""), [sel, setSel] = useState(""), [pt, setPt] = useState<any>(null), [msg, setMsg] = useState(""), [editNap, setEditNap] = useState<any>(null), [f, setF] = useState({ codigo: "", tipo: "Secundaria", puertos: "16", lat: "", lng: "" });
  const naps = useQuery(() => al(supabase.from("naps").select("*, zonas(nombre)").order("codigo")), [proyectoId, zonaId]);
  const puertos = useQuery(() => sel ? supabase.from("puertos").select("*, clientes!puertos_cliente_fk(nombre)").eq("nap_id", sel).order("numero") : Promise.resolve({ data: [], error: null }), [sel]);
  const trs = useQuery(() => al(supabase.from("v_troncales_resumen").select("troncal_id, codigo, zona_id")), [proyectoId, zonaId, naps.data]);
  const resumen = useQuery(() => al(supabase.from("v_puertos_resumen").select("*")), [proyectoId, zonaId, naps.data]);
  const ir = (t: string, troncal?: string) => { if (troncal) setTroncalSel(troncal); setTab(t); };
  const crear = async () => {
    setMsg(""); const zona = zonas.find(z => z.id === zonaId); if (!zona) return setMsg("Elige una zona arriba.");
    const { error } = await supabase.from("naps").insert({ proyecto_id: zona.proyecto_id, zona_id: zona.id, codigo: f.codigo.trim(), tipo: f.tipo, puertos: +f.puertos, lat: f.lat || null, lng: f.lng || null });
    if (error) setMsg(/duplicate key|unique/i.test(error.message) ? "Ya existe una NAP con ese código en esta zona. Si la mandaste a la papelera, restáurala desde el menú Papelera o usa otro código." : error.message); else { setF({ ...f, codigo: "" }); naps.recargar(); }
  };
  const quitarNap = async (x: any) => { setMsg(""); if (!confirm(`¿Mandar la NAP "${x.codigo}" a la papelera?\n\nSus puertos se ocultan con ella. Si tiene clientes conectados, no se podrá. Podrás restaurarla desde el menú Papelera.`)) return; try { await aPapelera("naps", [x.id]); if (sel === x.id) setSel(""); naps.recargar(); } catch (e: any) { setMsg(e.message); } };
  const R: any[] = (resumen.data as any[]) || [], tot = R.reduce((s, x) => s + x.puertos, 0), n = (e: string) => R.filter(x => x.estado === e).reduce((s, x) => s + x.puertos, 0);
  const lista: any[] = (naps.data as any[]) || [], nap = lista.find(x => x.id === sel);
  return <>
    <h1>Red FTTH</h1>
    {tab === "naps" && <div className="grid gk" style={{ marginBottom: 14 }}>{[["NAP", lista.length], ["Puertos", tot], ["Ocupados", n("OCUPADO")], ["Libres", n("LIBRE")], ["Reservados", n("RESERVADO")], ["Dañados", n("DAÑADO")], ["Ocupación", tot ? Math.round(n("OCUPADO") / tot * 100) + "%" : "—"]].map(([t, v]) => <div key={t as string} className="card kpi"><span>{t}</span><b>{v}</b></div>)}</div>}
    <Tabs items={[["panel", "Panel de red"], ["naps", "NAP y puertos"], ["troncales", "Troncales"], ["hilos", "Hilos y fusiones"], ["postes", "Postes"], ["olt", "OLT y PON"], ["hist", "Historial de la red"]]} valor={tab} onChange={setTab} />
    {tab === "panel" && <PanelRed ir={ir} />}
    {tab === "troncales" && <Troncales ir={ir} />}
    {tab === "hilos" && <HilosFusiones troncalId={troncalSel} setTroncalId={setTroncalSel} />}
    {tab === "postes" && <Postes />}
    {tab === "olt" && <OltPon />}
    {tab === "naps" && <><div className="card"><h2>Nueva NAP</h2>{msg && <Aviso tipo="mal">{msg}</Aviso>}<div className="form"><Campo l="Código (ej. NAP-A1-01)"><input value={f.codigo} onChange={e => setF({ ...f, codigo: e.target.value })} /></Campo><Campo l="Tipo"><select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}><option>Principal</option><option>Secundaria</option></select></Campo><Campo l="Puertos"><select value={f.puertos} onChange={e => setF({ ...f, puertos: e.target.value })}>{[8, 16, 32, 64].map(x => <option key={x}>{x}</option>)}</select></Campo><Campo l="Latitud"><input value={f.lat} onChange={e => setF({ ...f, lat: e.target.value })} /></Campo><Campo l="Longitud"><input value={f.lng} onChange={e => setF({ ...f, lng: e.target.value })} /></Campo></div><button className="btn" disabled={!f.codigo.trim()} onClick={crear}>Crear NAP (se crean sus puertos solos)</button></div>
      <div className="card tw"><h2>NAP</h2>{naps.loading ? <Cargando /> : lista.length ? <table><thead><tr><th>Código</th><th>Tipo</th><th>Zona</th><th>Puertos</th><th>Ubicación</th><th>Se alimenta de</th><th /></tr></thead><tbody>{lista.map(x => <tr key={x.id} className="click" onClick={() => setSel(x.id)} style={sel === x.id ? { background: "var(--lilb)" } : undefined}><td><b>{x.codigo}</b></td><td>{x.tipo}</td><td>{x.zonas?.nombre}</td><td>{x.puertos}</td><td>{x.ubicacion || (x.lat ? x.lat + ", " + x.lng : "—")}</td><td>{[x.troncal_id && "Troncal " + (((trs.data as any[]) || []).find(t => t.troncal_id === x.troncal_id)?.codigo || ""), x.padre_id && "NAP " + (lista.find(y => y.id === x.padre_id)?.codigo || "")].filter(Boolean).join(" · ") || "—"}</td>
        <td><div className="fila"><button className="btn suave chico" onClick={e => { e.stopPropagation(); setEditNap(x); }}>Editar</button><button className="btn suave chico" onClick={e => { e.stopPropagation(); quitarNap(x); }}>A la papelera</button></div></td></tr>)}</tbody></table> : <Vacio>Aún no hay NAP.</Vacio>}</div>
      {nap && <div className="card"><h2>Puertos de {nap.codigo}</h2>{puertos.loading ? <Cargando /> : <div className="puertos">{((puertos.data as any[]) || []).map(p => <div key={p.id} className={"puerto " + p.estado} title={p.clientes?.nombre || p.reservado_para || p.estado} onClick={() => setPt(p)}>{p.numero}</div>)}</div>}<p className="mute">Toca un puerto para ver su estado o cambiarlo. Un puerto ocupado o dañado nunca se asigna a un cliente nuevo.</p></div>}</>}
    {tab === "hist" && <Crud titulo="Cambios de la red (Starlink, OLT, troncales…)" tabla="historial_red" conZona orden="fecha" campos={[{ k: "fecha", l: "Fecha", t: "date" }, { k: "tipo", l: "Qué se hizo", t: "select", opts: ["Starlink agregada", "OLT cambiada o mejorada", "Troncal nueva", "NAP nueva", "Ampliación de red", "Instalación", "Baja", "Mantenimiento", "Otro"], req: true }, { k: "descripcion", l: "Descripción" }, { k: "monto", l: "Costo (Bs)", t: "number", def: 0 }, { k: "proveedor", l: "Proveedor", def: "Digicorp" }]} />}
    {editNap && <EditarNap nap={editNap} lista={lista} troncales={((trs.data as any[]) || []).filter(t => t.zona_id === editNap.zona_id)} onClose={() => setEditNap(null)} onListo={() => { setEditNap(null); naps.recargar(); resumen.recargar(); puertos.recargar(); }} />}
    {pt && <Puerto p={pt} onClose={() => setPt(null)} onListo={() => { setPt(null); puertos.recargar(); resumen.recargar(); }} />}
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
  return <FormModal titulo={"Editar " + nap.codigo} ancho={640} valores={nap} onClose={onClose}
    campos={[{ k: "codigo", l: "Código", req: true }, { k: "tipo", l: "Tipo", t: "select", opts: [["Principal", "Principal"], ["Secundaria", "Secundaria"]] }, { k: "ubicacion", l: "Ubicación o referencia" }, { k: "lat", l: "Latitud", t: "number", paso: 0.000001 }, { k: "lng", l: "Longitud", t: "number", paso: 0.000001 },
      { k: "troncal_id", l: "Recibe la fibra de la troncal", t: "select", opts: [["", "Ninguna"], ...troncales.map((t: any) => [t.troncal_id, t.codigo] as [string, string])] }, { k: "padre_id", l: "Se conecta a la NAP", t: "select", opts: [["", "Ninguna"], ...otras.map((x: any) => [x.id, x.codigo] as [string, string])] }, { k: "observaciones", l: "Observaciones" }]}
    onGuardar={async f => { const { error } = await supabase.from("naps").update(f).eq("id", nap.id); if (error) return /duplicate key|unique/i.test(error.message) ? "Ya existe una NAP con ese código en esta zona." : error.message; onListo(); }}
    extra={<div className="card" style={{ marginTop: 14 }}><h2>Ampliar puertos</h2>{msg && <Aviso tipo="mal">{msg}</Aviso>}
      {opciones.length ? <><p className="mute" style={{ marginTop: 0 }}>Hoy tiene <b>{nap.puertos}</b> puertos. Los puertos solo se pueden aumentar, nunca quitar. Los nuevos nacen libres.</p><div className="fila"><select value={nuevo} onChange={e => setNuevo(e.target.value)}><option value="">Nuevo total…</option>{opciones.map(x => <option key={x}>{x}</option>)}</select><button className="btn" disabled={!nuevo || ocup} onClick={ampliar}>Ampliar</button></div></> : <p className="mute">Esta NAP ya tiene el máximo de 128 puertos.</p>}</div>} />;
}
