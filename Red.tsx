import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Modal, Tabs, Vacio, useAlcance, useQuery, hoy } from "../lib/ui";
import Crud from "../lib/crud";

export default function Red() {
  const { zonaId, proyectoId, zonas } = useApp(), al = useAlcance();
  const [tab, setTab] = useState("naps"), [sel, setSel] = useState(""), [pt, setPt] = useState<any>(null), [msg, setMsg] = useState(""), [f, setF] = useState({ codigo: "", tipo: "Secundaria", puertos: "16", lat: "", lng: "" });
  const naps = useQuery(() => al(supabase.from("naps").select("*, zonas(nombre)").order("codigo")), [proyectoId, zonaId]);
  const puertos = useQuery(() => sel ? supabase.from("puertos").select("*, clientes!puertos_cliente_fk(nombre)").eq("nap_id", sel).order("numero") : Promise.resolve({ data: [], error: null }), [sel]);
  const resumen = useQuery(() => al(supabase.from("v_puertos_resumen").select("*")), [proyectoId, zonaId, naps.data]);
  const crear = async () => {
    setMsg(""); const zona = zonas.find(z => z.id === zonaId); if (!zona) return setMsg("Elige una zona arriba.");
    const { error } = await supabase.from("naps").insert({ proyecto_id: zona.proyecto_id, zona_id: zona.id, codigo: f.codigo.trim(), tipo: f.tipo, puertos: +f.puertos, lat: f.lat || null, lng: f.lng || null });
    if (error) setMsg(error.message); else { setF({ ...f, codigo: "" }); naps.recargar(); }
  };
  const R: any[] = (resumen.data as any[]) || [], tot = R.reduce((s, x) => s + x.puertos, 0), n = (e: string) => R.filter(x => x.estado === e).reduce((s, x) => s + x.puertos, 0);
  const lista: any[] = (naps.data as any[]) || [], nap = lista.find(x => x.id === sel);
  return <>
    <h1>Red FTTH</h1>
    <div className="grid gk" style={{ marginBottom: 14 }}>{[["NAP", lista.length], ["Puertos", tot], ["Ocupados", n("OCUPADO")], ["Libres", n("LIBRE")], ["Reservados", n("RESERVADO")], ["Dañados", n("DAÑADO")], ["Ocupación", tot ? Math.round(n("OCUPADO") / tot * 100) + "%" : "—"]].map(([t, v]) => <div key={t as string} className="card kpi"><span>{t}</span><b>{v}</b></div>)}</div>
    <Tabs items={[["naps", "NAP y puertos"], ["hist", "Historial de la red"]]} valor={tab} onChange={setTab} />
    {tab === "naps" && <><div className="card"><h2>Nueva NAP</h2>{msg && <Aviso tipo="mal">{msg}</Aviso>}<div className="form"><Campo l="Código (ej. NAP-A1-01)"><input value={f.codigo} onChange={e => setF({ ...f, codigo: e.target.value })} /></Campo><Campo l="Tipo"><select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}><option>Principal</option><option>Secundaria</option></select></Campo><Campo l="Puertos"><select value={f.puertos} onChange={e => setF({ ...f, puertos: e.target.value })}>{[8, 16, 32, 64].map(x => <option key={x}>{x}</option>)}</select></Campo><Campo l="Latitud"><input value={f.lat} onChange={e => setF({ ...f, lat: e.target.value })} /></Campo><Campo l="Longitud"><input value={f.lng} onChange={e => setF({ ...f, lng: e.target.value })} /></Campo></div><button className="btn" disabled={!f.codigo.trim()} onClick={crear}>Crear NAP (se crean sus puertos solos)</button></div>
      <div className="card tw"><h2>NAP</h2>{naps.loading ? <Cargando /> : lista.length ? <table><thead><tr><th>Código</th><th>Tipo</th><th>Zona</th><th>Puertos</th><th>Ubicación</th></tr></thead><tbody>{lista.map(x => <tr key={x.id} className="click" onClick={() => setSel(x.id)} style={sel === x.id ? { background: "var(--lilb)" } : undefined}><td><b>{x.codigo}</b></td><td>{x.tipo}</td><td>{x.zonas?.nombre}</td><td>{x.puertos}</td><td>{x.lat ? x.lat + ", " + x.lng : "—"}</td></tr>)}</tbody></table> : <Vacio>Aún no hay NAP.</Vacio>}</div>
      {nap && <div className="card"><h2>Puertos de {nap.codigo}</h2>{puertos.loading ? <Cargando /> : <div className="puertos">{((puertos.data as any[]) || []).map(p => <div key={p.id} className={"puerto " + p.estado} title={p.clientes?.nombre || p.reservado_para || p.estado} onClick={() => setPt(p)}>{p.numero}</div>)}</div>}<p className="mute">Toca un puerto para ver su estado o cambiarlo. Un puerto ocupado o dañado nunca se asigna a un cliente nuevo.</p></div>}</>}
    {tab === "hist" && <Crud titulo="Cambios de la red (Starlink, OLT, troncales…)" tabla="historial_red" conZona orden="fecha" campos={[{ k: "fecha", l: "Fecha", t: "date" }, { k: "tipo", l: "Qué se hizo", t: "select", opts: ["Starlink agregada", "OLT cambiada o mejorada", "Troncal nueva", "NAP nueva", "Ampliación de red", "Instalación", "Baja", "Mantenimiento", "Otro"], req: true }, { k: "descripcion", l: "Descripción" }, { k: "monto", l: "Costo (Bs)", t: "number", def: 0 }, { k: "proveedor", l: "Proveedor", def: "Digicorp" }]} />}
    {pt && <Puerto p={pt} onClose={() => setPt(null)} onListo={() => { setPt(null); puertos.recargar(); resumen.recargar(); }} />}
  </>;
}

function Puerto({ p, onClose, onListo }: any) {
  const [e, setE] = useState(p.estado), [r, setR] = useState({ para: p.reservado_para || "", tel: p.reservado_tel || "", hasta: p.reservado_hasta || "" }), [msg, setMsg] = useState("");
  const guardar = async () => {
    const cambios: any = { estado: e }; if (e === "RESERVADO") { if (!r.para.trim()) return setMsg("Escribe para quién se reserva."); Object.assign(cambios, { reservado_para: r.para, reservado_tel: r.tel, reservado_hasta: r.hasta || null }); } else Object.assign(cambios, { reservado_para: null, reservado_tel: null, reservado_hasta: null });
    const { error } = await supabase.from("puertos").update(cambios).eq("id", p.id); if (error) setMsg(error.message); else onListo();
  };
  return <Modal titulo={"Puerto " + p.numero} onClose={onClose}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    {p.estado === "OCUPADO" ? <p>Ocupado por <b>{p.clientes?.nombre}</b>. Para liberarlo, da de baja al cliente en Clientes.</p> : <>
      <Campo l="Estado"><select value={e} onChange={x => setE(x.target.value)}><option>LIBRE</option><option>RESERVADO</option><option>DAÑADO</option></select></Campo>
      {e === "RESERVADO" && <div className="form"><Campo l="¿Para quién?"><input value={r.para} onChange={x => setR({ ...r, para: x.target.value })} /></Campo><Campo l="Teléfono"><input value={r.tel} onChange={x => setR({ ...r, tel: x.target.value })} /></Campo><Campo l="Reservado hasta"><input type="date" min={hoy()} value={r.hasta} onChange={x => setR({ ...r, hasta: x.target.value })} /></Campo></div>}
      <button className="btn" onClick={guardar}>Guardar</button></>}</Modal>;
}
