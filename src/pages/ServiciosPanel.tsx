import { ReactNode, useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Estado, Vacio, hoy, useAlcance, useQuery } from "../lib/ui";
import { useAlertas } from "../lib/alertas";
import { rangoMes } from "../lib/reparto";
import { mesDesp, num } from "../lib/datos";

const n = num;
const mesLargo = (m: string) => { const t = new Date(m + "-01T12:00:00").toLocaleDateString("es-BO", { month: "long", year: "numeric" }); return t.charAt(0).toUpperCase() + t.slice(1); };
const TIPOS = ["Instalación", "Mantenimiento", "Baja"], ESTADOS = ["PROGRAMADA", "EN PROCESO", "PAUSADA", "COMPLETADA", "CANCELADA"];

function Mini({ t, v, s, info, ver, clase }: { t: string; v: ReactNode; s?: ReactNode; info: string; ver?: () => void; clase?: string }) {
  return <div className={"kmini " + (clase || "")} style={{ minHeight: 118 }}><span>{t} <span title={info} style={{ cursor: "help", float: "right", opacity: 0.6 }}>ⓘ</span></span><b style={{ fontSize: 24 }}>{v}</b>{s && <small>{s}</small>}{ver && <><br /><a onClick={ver}>Ver detalle →</a></>}</div>;
}

export function PanelOperativo({ ir, filtroInicial }: { ir: (tab: string, a?: any, f?: string) => void; filtroInicial?: string }) {
  const { zonas, zonaId, proyectos, proyectoId, perfil } = useApp(), al = useAlcance(), dep = [proyectoId, zonaId], actual = hoy().slice(0, 7), zona = zonas.find(z => z.id === zonaId);
  const { alertas } = useAlertas();
  const [mes, setMes] = useState(actual), [fe, setFe] = useState(filtroInicial || ""), [ft, setFt] = useState(""), [ftec, setFtec] = useState(""), [q, setQ] = useState(""), [msg, setMsg] = useState(""), [ok, setOk] = useState("");
  const [ini, fin] = rangoMes(mes);
  const ordenes = useQuery(() => al(supabase.from("ordenes_trabajo").select("*").order("creado_en", { ascending: false }).limit(1000)), dep);
  const insts = useQuery(() => al(supabase.from("instalaciones").select("id").gte("fecha", ini).lte("fecha", fin).limit(2000)), [...dep, mes]);
  const mants = useQuery(() => al(supabase.from("mantenimientos").select("estado, fecha_cierre").limit(3000)), dep);
  const equipos = useQuery(() => al(supabase.from("equipos_serie").select("id").eq("estado", "PENDIENTE").limit(2000), false), [proyectoId]);
  const acts = useQuery(() => al(supabase.from("v_actividades").select("*").gte("fecha", ini).lte("fecha", fin).order("fecha", { ascending: false }).limit(1000)), [...dep, mes]);
  const tecnicos = useQuery(() => al(supabase.from("instaladores").select("nombre, pago_dia").eq("activo", true).order("nombre")), dep);
  const clientes = useQuery(() => zonaId ? supabase.from("clientes").select("id, nombre, codigo").eq("zona_id", zonaId).neq("estado", "BAJA").order("nombre").limit(1000) : Promise.resolve({ data: [], error: null }), [zonaId]);
  const naps = useQuery(() => zonaId ? supabase.from("naps").select("codigo").eq("zona_id", zonaId).order("codigo") : Promise.resolve({ data: [], error: null }), [zonaId]);
  const vacio = { tipo: "Instalación", referencia: "", tecnico: "", fecha: hoy() }, [f, setF] = useState(vacio), [ocup, setOcup] = useState(false);
  if (ordenes.loading || acts.loading) return <Cargando />;

  const O: any[] = (ordenes.data as any[]) || [], M: any[] = (mants.data as any[]) || [], A: any[] = (acts.data as any[]) || [], T: any[] = (tecnicos.data as any[]) || [];
  const abiertas = O.filter(o => ["PROGRAMADA", "EN PROCESO"].includes(o.estado)), cerradas = O.filter(o => o.estado === "COMPLETADA" && o.cerrado_en);
  const instProg = abiertas.filter(o => o.tipo === "Instalación" && o.tecnico), instPend = abiertas.filter(o => o.tipo === "Instalación" && !o.tecnico), bajasPend = abiertas.filter(o => o.tipo === "Baja");
  const mantPend = M.filter(m => m.estado === "PENDIENTE").length, mantProc = M.filter(m => m.estado === "EN PROCESO").length, mantComp = M.filter(m => m.estado === "COMPLETADA" && m.fecha_cierre >= ini && m.fecha_cierre <= fin).length;
  const horas = cerradas.map(o => (+new Date(o.cerrado_en) - +new Date(o.creado_en)) / 3600000), prom = horas.length >= 3 ? horas.reduce((a, b) => a + b, 0) / horas.length : null;
  const dur = (h: number) => (h < 24 ? `${Math.round(h)} h` : `${(h / 24).toFixed(1)} días`);
  const operativas = alertas.filter(a => a.area === "Operación");
  const tecnicosFiltro = Array.from(new Set([...T.map(x => x.nombre), ...A.map(x => x.tecnico).filter(Boolean)])).sort();
  const nzona = (id: string) => zonas.find(z => z.id === id)?.nombre || "", nproy = (id: string) => proyectos.find(p => p.id === id)?.nombre || "";
  const visibles = A.filter(a => (!fe || a.estado === fe) && (!ft || a.trabajo === ft) && (!ftec || a.tecnico === ftec) && (a.cliente || "").toLowerCase().includes(q.toLowerCase()));

  const crear = async () => {
    setMsg(""); setOk(""); if (!zona) return setMsg("Elige una zona arriba."); if (!f.referencia.trim()) return setMsg("Escribe el cliente o la NAP.");
    const cli = ((clientes.data as any[]) || []).find(c => c.nombre.toLowerCase() === f.referencia.trim().toLowerCase() || c.codigo === f.referencia.trim());
    setOcup(true);
    const { error } = await supabase.from("ordenes_trabajo").insert({ proyecto_id: zona.proyecto_id, zona_id: zona.id, tipo: f.tipo, cliente_id: cli?.id || null, referencia: f.referencia.trim(), tecnico: f.tecnico || null, fecha_programada: f.fecha || null });
    setOcup(false); if (error) return setMsg(error.message);
    setF(vacio); setOk(f.tecnico ? "Orden creada y programada." : "Orden creada: queda pendiente hasta que le asignes un técnico."); ordenes.recargar(); acts.recargar();
  };
  const cambiar = async (o: any, estado: string) => {
    setMsg(""); if (estado === "CANCELADA" && !confirm("¿Cancelar esta orden de trabajo?")) return;
    const { error } = await supabase.from("ordenes_trabajo").update({ estado, cerrado_en: estado === "CANCELADA" ? new Date().toISOString() : null }).eq("id", o.id); if (error) setMsg(error.message); else { ordenes.recargar(); acts.recargar(); }
  };
  const asignar = async (o: any, tecnico: string) => { const { error } = await supabase.from("ordenes_trabajo").update({ tecnico: tecnico || null }).eq("id", o.id); if (error) setMsg(error.message); else { ordenes.recargar(); acts.recargar(); } };
  const completar = async (o: any) => { await cambiar(o, "EN PROCESO"); ir(o.tipo === "Instalación" ? "instalaciones" : o.tipo === "Baja" ? "bajas" : "mantenimientos", { orden: o }); };
  const ordenDe = (id: string) => O.find(o => o.id === id);

  return <>
    <div className="kpis-mini" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
      <Mini t="Instalaciones programadas" v={instProg.length} s="Por realizar" info="Órdenes de instalación con técnico asignado, aún sin hacer." ver={() => ir("panel", undefined, "PROGRAMADA")} />
      <Mini t="Instalaciones pendientes" v={instPend.length} s="Esperando programación" info="Órdenes de instalación a las que todavía no se les asigna técnico." clase={instPend.length ? "warn" : ""} ver={() => ir("panel", undefined, "PROGRAMADA")} />
      <Mini t="Instalaciones completadas" v={insts.data ? (insts.data as any[]).length : 0} s="En el período" clase="ok" info="Instalaciones registradas dentro del mes elegido." ver={() => ir("instalaciones")} />
      <Mini t="Mantenimientos pendientes" v={mantPend} s="Por atender" info="Mantenimientos programados que aún no empiezan." clase={mantPend ? "warn" : ""} ver={() => ir("mantenimientos")} />
      <Mini t="Mantenimientos en proceso" v={mantProc} s="En curso" info="Mantenimientos que ya se están atendiendo." ver={() => ir("mantenimientos")} />
      <Mini t="Mantenimientos completados" v={mantComp} s="En el período" clase="ok" info="Mantenimientos cerrados dentro del mes elegido." ver={() => ir("mantenimientos")} />
      <Mini t="Bajas pendientes de procesar" v={bajasPend.length} s="Por procesar" info="Órdenes de baja que todavía no se completan." clase={bajasPend.length ? "warn" : ""} ver={() => ir("bajas")} />
      <Mini t="Equipos por recuperar" v={(equipos.data as any[] || []).length} s={(equipos.data as any[] || []).length ? "Aún no recuperados" : "Ninguno pendiente"} info="Equipos de clientes dados de baja que todavía no regresan." clase={(equipos.data as any[] || []).length ? "warn" : ""} ver={() => ir("bajas")} />
      <Mini t="Órdenes de trabajo abiertas" v={abiertas.length} s="Abiertas" info="Órdenes programadas o en proceso." />
      <Mini t="Tiempo promedio de resolución" v={prom === null ? "—" : dur(prom)} s={prom === null ? `Datos insuficientes: se necesitan 3 órdenes cerradas (hay ${cerradas.length}).` : `Promedio de ${cerradas.length} órdenes cerradas`} info="Cuánto tarda en cerrarse una orden, desde que se crea." /></div>

    <div className="grid g2" style={{ alignItems: "start" }}>
      <div className="card"><h2>Alertas</h2>{operativas.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{operativas.slice(0, 5).map(a => <li key={a.id}><b>{a.titulo}</b> <small className="mute">{a.detalle[0]}</small></li>)}</ul> : <p className="mute" style={{ margin: 0 }}>Sin alertas operativas.</p>}
        <h2 style={{ marginTop: 14 }}>Accesos rápidos</h2><div className="fila"><button className="btn suave" onClick={() => ir("instalaciones", { nueva: true })}>Nueva instalación</button><button className="btn suave" onClick={() => ir("mantenimientos", { nueva: true })}>Registrar mantenimiento</button><button className="btn suave" onClick={() => ir("bajas")}>Procesar baja</button><button className="btn suave" onClick={() => { setFe("PROGRAMADA"); document.getElementById("tabla-actividades")?.scrollIntoView({ behavior: "smooth" }); }}>Ver pendientes</button></div></div>
      <div className="card"><h2>Programar trabajo</h2>{msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
        <div className="form" style={{ gridTemplateColumns: "1fr" }}>
          <select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>{TIPOS.map(t => <option key={t}>{t}</option>)}</select>
          <input list="refs-orden" placeholder="Cliente o NAP" value={f.referencia} onChange={e => setF({ ...f, referencia: e.target.value })} />
          <datalist id="refs-orden">{((clientes.data as any[]) || []).map(c => <option key={c.id} value={c.nombre} />)}{((naps.data as any[]) || []).map(x => <option key={x.codigo} value={x.codigo} />)}</datalist>
          <select value={f.tecnico} onChange={e => setF({ ...f, tecnico: e.target.value })}><option value="">Sin técnico (queda pendiente)</option>{T.map(x => <option key={x.nombre}>{x.nombre}</option>)}</select>
          <input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></div>
        <button className="btn" style={{ width: "100%", marginTop: 8 }} disabled={ocup} onClick={crear}>{ocup ? "Creando…" : "Crear orden"}</button>{!zona && <p className="mute">Elige una zona arriba para crear la orden.</p>}</div></div>

    <div className="card tw" id="tabla-actividades"><div className="fila" style={{ marginBottom: 10 }}><span className="mute">Período</span>
      <select value={mes} onChange={e => setMes(e.target.value)}>{Array.from({ length: 24 }, (_, i) => mesDesp(actual, -i)).map(m => <option key={m} value={m}>{mesLargo(m)}{m === actual ? " (en curso)" : ""}</option>)}</select>
      <select value={fe} onChange={e => setFe(e.target.value)}><option value="">Todos los estados</option>{ESTADOS.map(e => <option key={e} value={e}>{e.charAt(0) + e.slice(1).toLowerCase()}</option>)}</select>
      <select value={ft} onChange={e => setFt(e.target.value)}><option value="">Todos los tipos</option>{TIPOS.map(t => <option key={t}>{t}</option>)}</select>
      <select value={ftec} onChange={e => setFtec(e.target.value)}><option value="">Todos los técnicos</option>{tecnicosFiltro.map(t => <option key={t}>{t}</option>)}</select>
      <input placeholder="Buscar cliente" value={q} onChange={e => setQ(e.target.value)} /></div>
      {visibles.length ? <table><thead><tr><th>Cliente</th><th>Proyecto</th><th>Zona</th><th>Técnico</th><th>Trabajo</th><th>Fecha</th><th>Estado</th><th /></tr></thead>
        <tbody>{visibles.map(a => { const o = a.fuente === "orden" ? ordenDe(a.id) : null; return <tr key={a.fuente + a.id}><td><b>{a.cliente}</b></td><td>{nproy(a.proyecto_id)}</td><td>{nzona(a.zona_id)}</td>
          <td>{o && !["COMPLETADA", "CANCELADA"].includes(o.estado) ? <select value={o.tecnico || ""} onChange={e => asignar(o, e.target.value)}><option value="">Sin técnico</option>{T.map(x => <option key={x.nombre}>{x.nombre}</option>)}</select> : a.tecnico || "—"}</td><td>{a.trabajo}</td><td>{a.fecha || "—"}</td><td><Estado e={a.estado} /></td>
          <td>{o && !["COMPLETADA", "CANCELADA"].includes(o.estado) && <div className="fila">{o.estado === "PROGRAMADA" && <button className="btn suave chico" onClick={() => cambiar(o, "EN PROCESO")}>Iniciar</button>}<button className="btn chico" onClick={() => completar(o)}>Completar</button><button className="btn suave chico" onClick={() => cambiar(o, "CANCELADA")}>Cancelar</button></div>}</td></tr>; })}</tbody></table> : <Vacio>Sin actividades con estos filtros.</Vacio>}
      <p className="mute" style={{ margin: "10px 0 0" }}>Estados: Programada → En proceso → Completada (o Cancelada). Las completadas se leen de instalaciones, mantenimientos y bajas ya registrados.</p></div>
  </>;
}
