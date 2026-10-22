import { ReactNode, useState } from "react";
import { supabase, urlArchivo } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Estado, Vacio, bs, hoy, useAlcance, useQuery } from "../lib/ui";
import { Drawer } from "../lib/drawer";
import { BarrasAgrupadas, Leyenda } from "../lib/graficos";
import { etiquetaMes, num, sumaDe, todas } from "../lib/datos";
import { rangoMes } from "../lib/reparto";
import { primeroDeMes } from "../lib/pagos";
import { FormPago, mesYear } from "./ClientesPagos";

const n = num;
const ESTADOS = ["PAGADO", "POR VENCER", "VENCIDO", "SUSPENDIDO", "BAJA"];
const clase = (e: string) => "e-" + e.replace(/[ ÑÓ]/g, "_");
const mesDesp = (d: string, k: number) => { let a = +d.slice(0, 4), m = +d.slice(5, 7) - 1 + k; a += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return `${a}-${String(m + 1).padStart(2, "0")}-01`; };
const dias = (a: string, b: string) => Math.round((+new Date(b + "T12:00:00") - +new Date(a + "T12:00:00")) / 86400000);

function Mini({ t, v, s, info, clase: cl }: { t: string; v: ReactNode; s?: ReactNode; info?: string; clase?: string }) {
  return <div className={"kmini " + (cl || "")}><span>{t} {info && <span title={info} style={{ cursor: "help", float: "right", opacity: 0.6 }}>ⓘ</span>}</span><b>{v}</b>{s && <small>{s}</small>}</div>;
}

export function Cobranzas({ estadoInicial }: { estadoInicial?: string }) {
  const { proyectoId, zonaId } = useApp(), al = useAlcance(), dep = [proyectoId, zonaId];
  const M0 = primeroDeMes(hoy()), [ini, fin] = rangoMes(M0.slice(0, 7)), mesesGrid = [-3, -2, -1, 0, 1, 2].map(k => mesDesp(M0, k)), mesesGraf = [-5, -4, -3, -2, -1, 0].map(k => mesDesp(M0, k));
  const cob = useQuery(() => al(supabase.from("v_cobranza").select("*").order("nombre").limit(1000)), dep);
  const cargos = useQuery(() => todas(() => al(supabase.from("v_cargos").select("cliente_id, periodo, monto, pagado, saldo, vence").gte("periodo", mesDesp(M0, -5)).lte("periodo", mesDesp(M0, 2)).order("periodo"))).then(data => ({ data, error: null })).catch(e => ({ data: null, error: { message: e.message } })), dep);
  const pagosMes = useQuery(() => todas(() => al(supabase.from("v_pagos").select("monto").eq("anulado", false).gte("fecha", ini).lte("fecha", fin))).then(data => ({ data, error: null })).catch(() => ({ data: [], error: null })), dep);
  const apl = useQuery(() => todas(() => al(supabase.from("v_aplicaciones").select("monto, fecha_pago, periodo_cargo").eq("anulado", false).or(`and(fecha_pago.gte.${ini},fecha_pago.lte.${fin}),periodo_cargo.gt.${M0}`))).then(data => ({ data, error: null })).catch(() => ({ data: [], error: null })), dep);
  const insts = useQuery(() => todas(() => al(supabase.from("clientes").select("precio_instalacion").gte("fecha_instalacion", ini).lte("fecha_instalacion", fin).order("id"))).then(data => ({ data, error: null })).catch(() => ({ data: [], error: null })), dep);
  const [q, setQ] = useState(""), [fe, setFe] = useState(estadoInicial || ""), [panel, setPanel] = useState<any>(null), [msg, setMsg] = useState("");

  const F: any[] = (cob.data as any[]) || [], G: any[] = (cargos.data as any[]) || [];
  const vis = F.filter(c => (!fe || c.estado_cuenta === fe) && (c.nombre + " " + c.codigo).toLowerCase().includes(q.toLowerCase()));
  const hoyS = hoy(), cuenta = (e: string) => F.filter(c => c.estado_cuenta === e).length;

  /* indicadores del mes */
  const cobrado = sumaDe((pagosMes.data as any[]) || [], "monto");
  const venc = F.filter(c => c.estado_cuenta === "VENCIDO"), pv = F.filter(c => c.estado_cuenta === "POR VENCER"), susp = F.filter(c => c.estado_cuenta === "SUSPENDIDO");
  const sinVencer = G.filter(x => x.periodo <= M0 && x.vence >= hoyS && n(x.saldo) > 0), parciales = G.filter(x => x.periodo <= M0 && n(x.pagado) > 0 && n(x.saldo) > 0);
  const pendiente = sumaDe(F, "deuda") + sumaDe(sinVencer, "saldo"), clientesPend = new Set([...F.filter(c => n(c.deuda) > 0).map(c => c.cliente_id), ...sinVencer.map(x => x.cliente_id)]).size;
  const anticipado = ((apl.data as any[]) || []).filter(x => x.periodo_cargo > M0).reduce((s, x) => s + n(x.monto), 0);
  const delMes = G.filter(x => x.periodo.slice(0, 7) === M0.slice(0, 7)), factMes = sumaDe(delMes, "monto"), cobMes = sumaDe(delMes, "pagado"), pct = factMes ? Math.round((cobMes / factMes) * 100) : 0;
  const porMes = mesesGraf.map(m => { const x = G.filter(g => g.periodo.slice(0, 7) === m.slice(0, 7)); return { f: sumaDe(x, "monto"), c: sumaDe(x, "pagado"), p: sumaDe(x, "saldo") }; });
  const antig = [0, 0, 0]; G.filter(x => x.vence < hoyS && n(x.saldo) > 0).forEach(x => { const d = dias(x.vence, hoyS); antig[d <= 30 ? 0 : d <= 60 ? 1 : 2] += n(x.saldo); });
  const comp = { normal: 0, atrasado: 0, adelantado: 0 }; ((apl.data as any[]) || []).filter(x => x.fecha_pago >= ini && x.fecha_pago <= fin).forEach(x => { const pm = String(x.periodo_cargo).slice(0, 7), fm = M0.slice(0, 7); if (pm === fm) comp.normal += n(x.monto); else if (pm < fm) comp.atrasado += n(x.monto); else comp.adelantado += n(x.monto); });
  const instal = sumaDe((insts.data as any[]) || [], "precio_instalacion"), totalComp = comp.normal + comp.atrasado + comp.adelantado + instal;

  const celda = (c: any, m: string) => { const g = G.find(x => x.cliente_id === c.cliente_id && x.periodo.slice(0, 7) === m.slice(0, 7)); if (!g) return <span className="mute">{m <= M0 ? "Sin registro" : "—"}</span>;
    return n(g.saldo) <= 0 ? <span className="pill ok">Pagó</span> : n(g.pagado) > 0 ? <span className="pill warn">Parcial {bs(g.pagado)}</span> : g.vence < hoyS ? <span className="pill bad">Vencido</span> : <span className="pill warn">Por vencer</span>; };
  const acciones = (c: any) => <div className="fila" style={{ gap: 4 }}>
    {c.estado_cuenta !== "BAJA" && <button className="btn chico" onClick={() => setPanel({ t: "pago", c })}>Pago</button>}
    {c.estado_servicio === "SUSPENDIDO" ? <button className="btn chico mor" onClick={() => setPanel({ t: "estado", c, accion: "RECONECTAR" })}>Reconectar</button> : c.estado_servicio === "ACTIVO" && <>
      {c.no_cortar ? <button className="btn suave chico" onClick={() => setPanel({ t: "estado", c, accion: "QUITAR_NO_CORTAR" })}>Quitar no cortar</button> : <button className="btn suave chico" onClick={() => setPanel({ t: "estado", c, accion: "NO_CORTAR" })}>No cortar</button>}
      <button className="btn suave chico" onClick={() => setPanel({ t: "estado", c, accion: "SUSPENDER" })}>Suspender</button>
      <button className="btn suave chico" onClick={() => setPanel({ t: "estado", c, accion: "SUSPENDER", corte: true })}>Cortar por falta de pago</button></>}</div>;
  const generar = async () => { setMsg(""); const { data, error } = await supabase.rpc("generar_cargos", { p_periodo: hoy() }); setMsg(error ? error.message : `Se generaron ${data} cargos del mes.`); cob.recargar(); cargos.recargar(); };
  const recargar = () => { cob.recargar(); cargos.recargar(); pagosMes.recargar(); apl.recargar(); };

  return <>
    <div className="fila entre" style={{ marginBottom: 10 }}><input placeholder="Buscar cliente por nombre o apellido" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 220, fontSize: 15, padding: 10 }} /><button className="btn suave" onClick={generar}>Generar cargos del mes</button></div>
    {msg && <Aviso>{msg}</Aviso>}
    <div className="card"><h2 style={{ marginBottom: 8 }}>Clientes por estado <small className="mute" style={{ fontWeight: 400 }}>(clic en un estado para filtrar)</small></h2>
      <div className="estados-barra">{ESTADOS.map(e => <button key={e} className={"tag " + clase(e) + (fe === e ? " sel" : "")} onClick={() => setFe(fe === e ? "" : e)}>{e.charAt(0) + e.slice(1).toLowerCase()} {cuenta(e)}</button>)}</div></div>

    <div className="card tw"><h2>Pagos mes a mes por cliente</h2>
      {cob.loading || cargos.loading ? <Cargando /> : cob.error ? <Aviso tipo="mal">{cob.error}</Aviso> : vis.length ? <table><thead><tr><th>Cliente</th>{mesesGrid.map(m => <th key={m}><span className="mesx">{etiquetaMes(m.slice(0, 7))}</span></th>)}<th>Acciones</th></tr></thead>
        <tbody>{vis.map(c => <tr key={c.cliente_id} style={c.estado_cuenta === "BAJA" ? { opacity: 0.55 } : undefined}>
          <td><a style={{ cursor: "pointer" }} onClick={() => setPanel({ t: "hist", c })}><b>{c.nombre}</b></a><br /><small className="mute">Mensual: {bs(c.precio_mensual)}{c.no_cortar ? " · No cortar" + (c.no_cortar_hasta ? " hasta " + c.no_cortar_hasta : "") : ""}</small></td>
          {mesesGrid.map(m => <td key={m}>{celda(c, m)}</td>)}<td>{acciones(c)}</td></tr>)}</tbody></table> : <Vacio>No hay clientes con estos filtros.</Vacio>}
      <p className="mute" style={{ margin: "8px 0 0" }}>Toca el nombre de un cliente para ver su historial y comprobantes. "Sin registro" en un mes ya pasado significa que ese mes no tiene cargo ni pago anotado.</p></div>

    <div className="kpis-mini" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(124px,1fr))" }}>
      <Mini t="Total cobrado del mes" v={cobrado ? bs(cobrado) : "—"} s={cobrado ? "Pagos recibidos este mes" : "Aún no hay pagos registrados."} info="Suma de los pagos recibidos en el mes actual (sin anulados)." />
      <Mini t="Pendiente de cobro" v={bs(pendiente)} s={`${clientesPend} cliente${clientesPend === 1 ? "" : "s"}`} clase={pendiente ? "warn" : "ok"} info="Lo que falta cobrar: deuda vencida más lo del mes que aún no vence." />
      <Mini t="Cobros parciales" v={parciales.length} s={`Saldo restante ${bs(sumaDe(parciales, "saldo"))}`} info="Meses que se pagaron solo en parte." />
      <Mini t="Pagos anticipados" v={bs(anticipado)} s="Cubiertos con crédito" clase="acc" info="Dinero ya pagado para meses que todavía no llegan." />
      <Mini t="Por vencer" v={pv.length} s={bs(sumaDe(sinVencer, "saldo"))} clase="warn" info="Clientes cuyo vencimiento llega en los próximos 5 días." />
      <Mini t="Vencidos" v={venc.length} s={bs(sumaDe(venc, "deuda"))} clase={venc.length ? "bad" : ""} info="Clientes con al menos un mes vencido sin pagar." />
      <Mini t="Suspendidos" v={susp.length} s={`Deuda ${bs(sumaDe(susp, "deuda"))}`} info="Clientes con el servicio cortado o suspendido." />
      <Mini t="Cobranza del período" v={pct + "%"} s={`${bs(cobMes)} de ${bs(factMes)}`} clase={pct >= 80 ? "ok" : pct >= 50 ? "warn" : "bad"} info="De lo facturado este mes, cuánto ya se cobró." /></div>

    <div className="mitades">
      <div className="card"><h2>Cobranza por mes</h2><BarrasAgrupadas alto={230} etiquetas={mesesGraf.map(m => etiquetaMes(m.slice(0, 7)))} series={[{ nombre: "Facturado", color: "var(--lil)", datos: porMes.map(x => x.f) }, { nombre: "Cobrado", color: "var(--ok)", datos: porMes.map(x => x.c) }, { nombre: "Pendiente", color: "#c4651a", datos: porMes.map(x => x.p) }]} />
        <Leyenda items={[{ nombre: "Facturado", color: "var(--lil)" }, { nombre: "Cobrado", color: "var(--ok)" }, { nombre: "Pendiente", color: "#c4651a" }]} /><p className="mute" style={{ margin: "4px 0 0" }}>Solo cuentan los cargos registrados en cada mes.</p></div>
      <div className="card"><h2>Antigüedad de la deuda</h2><BarrasAgrupadas alto={230} etiquetas={["1–30 días", "31–60 días", "Más de 60"]} series={[{ nombre: "Deuda", color: "#c4651a", datos: antig }]} totales={antig} />
        <h3 style={{ margin: "10px 0 4px" }}>Composición de lo cobrado</h3>
        <div className="barra-estados" style={{ maxWidth: "none" }}>{[[comp.normal, "var(--ok)"], [comp.atrasado, "#c4651a"], [comp.adelantado, "var(--lil)"], [instal, "var(--acc)"]].map(([v, c], i) => <i key={i} style={{ width: (totalComp ? (v as number) / totalComp : 0) * 100 + "%", background: c as string }} />)}</div>
        <div className="leyenda-puertos"><span><span style={{ color: "var(--ok)" }}>●</span> Pago normal {bs(comp.normal)}</span><span><span style={{ color: "#c4651a" }}>●</span> Meses atrasados {bs(comp.atrasado)}</span><span><span style={{ color: "var(--lil)" }}>●</span> Adelantado {bs(comp.adelantado)}</span><span><span style={{ color: "var(--acc)" }}>●</span> Instalaciones {bs(instal)}</span></div></div>
    </div>

    {panel?.t === "pago" && <Drawer titulo={"Registrar pago · " + panel.c.nombre} ancho={520} onClose={() => setPanel(null)}><FormPago clientes={F} clienteId={panel.c.cliente_id} onListo={recargar} /></Drawer>}
    {panel?.t === "estado" && <PanelEstado m={panel} onClose={() => setPanel(null)} onListo={() => { setPanel(null); recargar(); }} />}
    {panel?.t === "hist" && <PanelHistorial c={panel.c} onClose={() => setPanel(null)} onCambio={recargar} />}
  </>;
}

const TEXTOS: Record<string, [string, string]> = {
  NO_CORTAR: ["No cortar", "El cliente no se corta aunque tenga deuda, hasta la fecha que indiques."],
  QUITAR_NO_CORTAR: ["Quitar “no cortar”", "Vuelve a aplicarse la regla normal de corte."],
  SUSPENDER: ["Suspender el servicio", "El cliente pasa a Suspendido. Puedes reconectarlo cuando quieras."],
  RECONECTAR: ["Reconectar el servicio", "El cliente vuelve a estar activo."],
};

function PanelEstado({ m, onClose, onListo }: any) {
  const [mot, setMot] = useState(m.corte ? "Falta de pago" : m.motivo || ""), [hasta, setHasta] = useState(""), [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false);
  const [t, ayuda] = m.corte ? ["Cortar por falta de pago", "Se corta el servicio por deuda. El cliente queda Suspendido y se reconecta al registrar su pago."] : TEXTOS[m.accion];
  const pide = m.accion === "NO_CORTAR" || m.accion === "SUSPENDER";
  const ir = async () => {
    setMsg(""); if (pide && !mot.trim()) return setMsg("Escribe la razón.");
    setOcup(true); const { error } = await supabase.rpc("cambiar_estado_cliente", { p_cliente: m.c.cliente_id, p_accion: m.accion, p_motivo: mot.trim() || null, p_hasta: hasta || null }); setOcup(false);
    if (error) setMsg(error.message); else onListo();
  };
  return <Drawer titulo={t + " · " + m.c.nombre} onClose={onClose}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    <p className="mute" style={{ marginTop: 0 }}>{ayuda} Queda registrado con tu nombre y la fecha.</p>
    <p>Mensualidad <b>{bs(m.c.precio_mensual)}</b> · Debe <b>{bs(m.c.deuda)}</b>{n(m.c.meses_deuda) ? ` (${m.c.meses_deuda} mes${n(m.c.meses_deuda) === 1 ? "" : "es"})` : ""} · Estado <Estado e={m.c.estado_cuenta} /></p>
    {pide && <Campo l="Razón (obligatoria)"><input autoFocus value={mot} onChange={e => setMot(e.target.value)} placeholder={m.accion === "NO_CORTAR" ? "Ej. paga el viernes" : "Ej. viaje, a pedido del cliente"} /></Campo>}
    {m.accion === "NO_CORTAR" && <Campo l="No cortar hasta"><input type="date" min={hoy()} value={hasta} onChange={e => setHasta(e.target.value)} /></Campo>}
    {m.accion === "RECONECTAR" && <Campo l="Nota (opcional)"><input value={mot} onChange={e => setMot(e.target.value)} /></Campo>}
    <button className="btn" style={{ width: "100%", marginTop: 10 }} disabled={ocup} onClick={ir}>{ocup ? "Guardando…" : "Confirmar"}</button></Drawer>;
}

export function PanelHistorial({ c, onClose, onCambio }: { c: any; onClose: () => void; onCambio?: () => void }) {
  const p = useQuery(() => supabase.from("v_pagos_registro").select("*").eq("cliente_id", c.cliente_id).order("fecha", { ascending: false }).limit(200), [c.cliente_id]);
  const [msg, setMsg] = useState(""), [anulando, setAnulando] = useState(""), [motivo, setMotivo] = useState("");
  const ver = async (ruta: string) => { const u = await urlArchivo("comprobantes", ruta); if (u) window.open(u, "_blank"); else setMsg("No se pudo abrir el comprobante."); };
  const anular = async () => { if (!motivo.trim()) return setMsg("Escribe el motivo de la anulación."); const { error } = await supabase.rpc("anular_pago", { p_pago: anulando, p_motivo: motivo.trim() }); if (error) setMsg(error.message); else { setAnulando(""); setMotivo(""); p.recargar(); onCambio?.(); } };
  const L: any[] = (p.data as any[]) || [];
  return <Drawer titulo={"Historial de pagos · " + c.nombre} ancho={520} onClose={onClose}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    <p className="mute" style={{ marginTop: 0 }}>{c.codigo} · Mensualidad {bs(c.precio_mensual)} · Debe {bs(c.deuda)}</p>
    {p.loading ? <Cargando /> : L.length ? L.map(x => <div key={x.id} className="card" style={{ margin: "0 0 8px", opacity: x.anulado ? 0.55 : 1 }}>
      <div className="fila entre"><b>{bs(x.monto)}</b><span className="mute">{x.fecha}</span></div>
      <div className="mute">{x.anulado ? "ANULADO" : x.tipo} · {x.medio || "—"}{x.periodo_inicio ? " · desde " + mesYear(String(x.periodo_inicio)) : ""}{x.cubre_hasta ? " · hasta " + mesYear(String(x.cubre_hasta)) : ""}</div>
      {x.observaciones && <div className="mute">“{x.observaciones}”</div>}{x.anulado && x.motivo_anulacion && <div style={{ color: "var(--bad)" }}>Motivo: {x.motivo_anulacion}</div>}
      <div className="fila" style={{ marginTop: 6 }}>{x.comprobante_path && <button className="btn suave chico" onClick={() => ver(x.comprobante_path)}>Ver comprobante</button>}{!x.anulado && anulando !== x.id && <button className="btn suave chico" onClick={() => setAnulando(x.id)}>Anular</button>}</div>
      {anulando === x.id && <div className="fila" style={{ marginTop: 6 }}><input autoFocus placeholder="Motivo de la anulación" value={motivo} onChange={e => setMotivo(e.target.value)} style={{ flex: 1 }} /><button className="btn chico" onClick={anular}>Confirmar</button><button className="btn suave chico" onClick={() => setAnulando("")}>Cancelar</button></div>}</div>) : <Vacio>Este cliente aún no tiene pagos registrados.</Vacio>}
  </Drawer>;
}
