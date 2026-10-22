import { useState } from "react";
import { supabase, urlArchivo } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Cargando, Kpi, Vacio, bs, hoy, useAlcance, useQuery } from "../lib/ui";
import { Drawer } from "../lib/drawer";
import { mesDesp } from "../lib/datos";
import { rangoMes } from "../lib/reparto";
import { MEDIOS, mesYear } from "./ClientesPagos";

const n = (x: any) => Number(x) || 0;
const mesLargo = (m: string) => { const t = new Date(m + "-01T12:00:00").toLocaleDateString("es-BO", { month: "long", year: "numeric" }); return t.charAt(0).toUpperCase() + t.slice(1); };

/** Historial de todos los pagos, con su comprobante y la posibilidad de anularlos. */
export function RegistroPagos() {
  const { proyectoId, zonaId } = useApp(), al = useAlcance();
  const [q, setQ] = useState(""), [mes, setMes] = useState(""), [medio, setMedio] = useState(""), [est, setEst] = useState(""), [anular, setAnular] = useState<any>(null), [motivo, setMotivo] = useState(""), [msg, setMsg] = useState("");
  const p = useQuery(() => { let x = al(supabase.from("v_pagos_registro").select("*").order("fecha", { ascending: false }).order("creado_en", { ascending: false }).limit(1000)); if (mes) { const [a, b] = rangoMes(mes); x = x.gte("fecha", a).lte("fecha", b); } return x; }, [proyectoId, zonaId, mes]);
  const L: any[] = ((p.data as any[]) || []).filter(x => (!medio || x.medio === medio) && (!est || (est === "anulado" ? x.anulado : !x.anulado)) && (x.cliente_nombre + " " + x.cliente_codigo).toLowerCase().includes(q.toLowerCase()));
  const vigentes = L.filter(x => !x.anulado), total = vigentes.reduce((s, x) => s + n(x.monto), 0);
  const ver = async (ruta: string) => { const u = await urlArchivo("comprobantes", ruta); if (u) window.open(u, "_blank"); else setMsg("No se pudo abrir el comprobante."); };
  const confirmarAnular = async () => { if (!motivo.trim()) return setMsg("Escribe el motivo de la anulación."); const { error } = await supabase.rpc("anular_pago", { p_pago: anular.id, p_motivo: motivo.trim() }); if (error) setMsg(error.message); else { setAnular(null); setMotivo(""); setMsg(""); p.recargar(); } };
  return <>
    {msg && !anular && <Aviso tipo="mal">{msg}</Aviso>}
    <div className="grid gk" style={{ marginBottom: 14 }}><Kpi t="Pagos registrados" v={vigentes.length} /><Kpi t="Total cobrado" v={bs(total)} s={mes ? mesLargo(mes) : "Todo el historial mostrado"} /><Kpi t="Anulados" v={L.filter(x => x.anulado).length} s={L.some(x => x.anulado) ? bs(L.filter(x => x.anulado).reduce((s, x) => s + n(x.monto), 0)) : "Ninguno"} /></div>
    <div className="fila" style={{ marginBottom: 10 }}><input placeholder="Buscar por cliente o código" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
      <select value={mes} onChange={e => setMes(e.target.value)}><option value="">Todos los meses</option>{Array.from({ length: 24 }, (_, i) => mesDesp(hoy().slice(0, 7), -i)).map(m => <option key={m} value={m}>{mesLargo(m)}</option>)}</select>
      <select value={medio} onChange={e => setMedio(e.target.value)}><option value="">Todos los medios</option>{MEDIOS.map(m => <option key={m}>{m}</option>)}</select>
      <select value={est} onChange={e => setEst(e.target.value)}><option value="">Vigentes y anulados</option><option value="vigente">Solo vigentes</option><option value="anulado">Solo anulados</option></select></div>
    <div className="card tw"><h2>Registro de pagos</h2>{p.loading ? <Cargando /> : p.error ? <Aviso tipo="mal">{p.error}</Aviso> : L.length ? <table><thead><tr><th>Fecha</th><th>Cliente</th><th>Monto</th><th>Medio</th><th>Tipo</th><th>Desde</th><th>Cubre hasta</th><th>Observaciones</th><th>Registró</th><th>Comprobante</th><th /></tr></thead>
      <tbody>{L.map(x => <tr key={x.id} style={x.anulado ? { opacity: 0.5 } : undefined}><td style={{ whiteSpace: "nowrap" }}>{x.fecha}</td><td><b>{x.cliente_nombre}</b><br /><small className="mute">{x.cliente_codigo}</small></td><td><b style={x.anulado ? { textDecoration: "line-through" } : undefined}>{bs(x.monto)}</b></td><td>{x.medio || "—"}</td>
        <td>{x.anulado ? <span className="pill bad">Anulado</span> : <span className={"pill " + (x.tipo === "Anticipado" ? "acc" : x.tipo === "Parcial" ? "warn" : "ok")}>{x.tipo}</span>}</td><td>{x.periodo_inicio ? mesYear(String(x.periodo_inicio)) : "—"}</td><td>{x.cubre_hasta ? mesYear(String(x.cubre_hasta)) : "—"}</td>
        <td>{x.observaciones || (x.anulado && x.motivo_anulacion ? "Anulado: " + x.motivo_anulacion : "—")}</td><td>{x.registrado_por || "—"}</td><td>{x.comprobante_path ? <button className="btn suave chico" onClick={() => ver(x.comprobante_path)}>Ver comprobante</button> : "—"}</td>
        <td>{!x.anulado && <button className="btn suave chico" onClick={() => { setAnular(x); setMotivo(""); setMsg(""); }}>Anular</button>}</td></tr>)}</tbody></table> : <Vacio>No hay pagos con estos filtros.</Vacio>}
      <p className="mute" style={{ margin: "8px 0 0" }}>Un pago anulado deja de contar y los meses que cubría vuelven a quedar pendientes. Queda guardado como constancia.</p></div>
    {anular && <Drawer titulo="Anular pago" onClose={() => setAnular(null)}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
      <p>Pago de <b>{bs(anular.monto)}</b> de <b>{anular.cliente_nombre}</b> del {anular.fecha}.</p><p className="mute">Los meses que cubría vuelven a quedar pendientes de cobro.</p>
      <input autoFocus placeholder="Motivo de la anulación (obligatorio)" value={motivo} onChange={e => setMotivo(e.target.value)} style={{ width: "100%", marginBottom: 10 }} /><button className="btn" style={{ width: "100%" }} onClick={confirmarAnular}>Anular este pago</button></Drawer>}
  </>;
}
