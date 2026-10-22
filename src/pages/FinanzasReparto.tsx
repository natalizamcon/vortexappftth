import { useEffect, useState } from "react";
import { supabase, subirArchivo, urlArchivo } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { aPapelera } from "../lib/papelera";
import { Aviso, Campo, Cargando, Kpi, Modal, Vacio, bs, hoy, useQuery } from "../lib/ui";
import { FONDOS, METODOS, CostoComp, Metodo, calcular, cuotaCostoCompartido, mesAnterior, r2, rangoMes } from "../lib/reparto";

const n = (x: any) => Number(x) || 0;
const nada = Promise.resolve({ data: [], error: null });
const suma = (a: any[], k: string) => a.reduce((s, x) => s + n(x[k]), 0);
const nombreDe = (p: any) => p?.nombre || p?.email || "Sin nombre";
const mesLargo = (m: string) => { const t = new Date(m + "-01T12:00:00").toLocaleDateString("es-BO", { month: "long", year: "numeric" }); return t.charAt(0).toUpperCase() + t.slice(1); };
/** Los últimos 24 meses, del más reciente al más antiguo. */
const opcionesMes = () => { const out: string[] = []; let a = +hoy().slice(0, 4), m = +hoy().slice(5, 7); for (let i = 0; i < 24; i++) { out.push(`${a}-${String(m).padStart(2, "0")}`); m--; if (m === 0) { m = 12; a--; } } return out; };
const SelMes = ({ v, set, todos }: { v: string; set: (x: string) => void; todos?: boolean }) => <select value={v} onChange={e => set(e.target.value)}>{todos && <option value="">Todos los meses</option>}{opcionesMes().map(m => <option key={m} value={m}>{mesLargo(m)}</option>)}</select>;

/** Trae todas las filas, de 1.000 en 1.000. */
async function todas(fabrica: () => any, max = 20000): Promise<any[]> {
  const out: any[] = [];
  for (let desde = 0; desde < max; desde += 1000) {
    const r = await fabrica().range(desde, desde + 999);
    if (r.error) throw new Error(r.error.message);
    const d = r.data || []; out.push(...d);
    if (d.length < 1000) break;
  }
  return out;
}
async function clientesActivos(): Promise<Record<string, number>> {
  const R = await todas(() => supabase.from("v_cobranza_resumen").select("zona_id, estado_cuenta, clientes")), out: Record<string, number> = {};
  R.filter(x => x.estado_cuenta !== "BAJA").forEach(x => { out[x.zona_id] = (out[x.zona_id] || 0) + n(x.clientes); });
  return out;
}
const Pct = ({ v, set, ancho = 80 }: { v: any; set: (x: string) => void; ancho?: number }) => <span className="fila" style={{ gap: 4, flexWrap: "nowrap" }}><input type="number" min={0} max={100} step={0.5} value={v} style={{ width: ancho }} onChange={e => set(e.target.value)} />%</span>;
const Monto = ({ v, set }: { v: any; set: (x: string) => void }) => <input type="number" min={0} step={0.01} value={v} style={{ width: 120 }} onChange={e => set(e.target.value)} />;

/* ======================================================================= */
/*  REPARTO DE UTILIDADES                                                   */
/* ======================================================================= */
async function cargarReparto(zona: any, mes: string) {
  try {
    const [ini, fin] = rangoMes(mes);
    const [pagos, movs, sinZona, invs, costos, czonas, cmeses, cli, perfiles, zsocios, zfondos, liqR] = await Promise.all([
      todas(() => supabase.from("v_pagos").select("monto").eq("zona_id", zona.id).eq("anulado", false).gte("fecha", ini).lte("fecha", fin)),
      todas(() => supabase.from("fin_movimientos").select("tipo, categoria, descripcion, monto, fecha").eq("zona_id", zona.id).in("tipo", ["INGRESO", "GASTO_OPERATIVO"]).gte("fecha", ini).lte("fecha", fin).order("fecha")),
      todas(() => supabase.from("fin_movimientos").select("monto").eq("proyecto_id", zona.proyecto_id).is("zona_id", null).eq("tipo", "GASTO_OPERATIVO").gte("fecha", ini).lte("fecha", fin)),
      todas(() => supabase.from("inversores").select("id, nombre").eq("zona_id", zona.id)),
      todas(() => supabase.from("costos_compartidos").select("*").eq("activo", true).lte("desde", fin)),
      todas(() => supabase.from("costos_compartidos_zonas").select("*").eq("incluida", true)),
      todas(() => supabase.from("costos_compartidos_meses").select("*").eq("periodo", ini).eq("activo", true)),
      clientesActivos(),
      todas(() => supabase.from("profiles").select("id, nombre, email").eq("rol", "socio")),
      todas(() => supabase.from("zona_socios").select("user_id, porcentaje").eq("zona_id", zona.id)),
      todas(() => supabase.from("zona_fondos_pct").select("fondo, porcentaje").eq("zona_id", zona.id)),
      supabase.from("v_liquidaciones").select("*").eq("zona_id", zona.id).eq("periodo", ini).eq("estado", "CONFIRMADA").maybeSingle(),
    ]);
    if (liqR.error) throw new Error(liqR.error.message);
    const ids = invs.map((x: any) => x.id);
    const pinv = ids.length ? await todas(() => supabase.from("pagos_inversores").select("monto, fecha, inversor_id").in("inversor_id", ids).gte("fecha", ini).lte("fecha", fin)) : [];

    const lineasGasto = movs.filter((x: any) => x.tipo === "GASTO_OPERATIVO"), otros = movs.filter((x: any) => x.tipo === "INGRESO");
    const compartidos = costos.filter((c: any) => !c.hasta || c.hasta >= ini).map((c: any) => {
      const zs = czonas.filter((z: any) => z.costo_id === c.id).map((z: any) => ({ zona_id: z.zona_id, porcentaje: n(z.porcentaje) }));
      const ov = cmeses.find((m: any) => m.costo_id === c.id), monto = ov ? n(ov.monto) : n(c.monto_mensual);
      const costo: CostoComp = { id: c.id, nombre: c.nombre, metodo: c.metodo as Metodo, monto, zonas: zs };
      return { costo, ...cuotaCostoCompartido(costo, zona.id, cli), participa: zs.some((z: any) => z.zona_id === zona.id) };
    }).filter((x: any) => x.participa);
    const nombres: Record<string, string> = {}; perfiles.forEach((p: any) => { nombres[p.id] = nombreDe(p); });
    const sociosCfg = zsocios.map((s: any) => ({ user_id: s.user_id, nombre: nombres[s.user_id] || "Socio", porcentaje: n(s.porcentaje) })).sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));
    const fondosCfg = FONDOS.map(f => ({ fondo: f as string, porcentaje: n(zfondos.find((x: any) => x.fondo === f)?.porcentaje) }));

    let liq: any = liqR.data, liqSocios: any[] = [], liqFondos: any[] = [];
    if (liq) {
      const [ls, lf] = await Promise.all([
        todas(() => supabase.from("v_reparto_socios").select("*").eq("liquidacion_id", liq.id).order("socio_nombre")),
        todas(() => supabase.from("liquidacion_fondos").select("*").eq("liquidacion_id", liq.id)),
      ]);
      liqSocios = ls; liqFondos = lf;
    }
    return { data: { cobrado: r2(suma(pagos, "monto")), otros: r2(suma(otros, "monto")), gastos: r2(suma(lineasGasto, "monto")), lineasGasto, lineasOtros: otros, sinZona: r2(suma(sinZona, "monto")),
      inversores: r2(suma(pinv, "monto")), nPagosInv: pinv.length, compartidos, totalCompartidos: r2(compartidos.reduce((s: number, x: any) => s + x.cuota, 0)), sociosCfg, fondosCfg, liq, liqSocios, liqFondos }, error: null };
  } catch (e: any) { return { data: null, error: { message: e.message } }; }
}

type Ed = { cobrado: string; otros: string; gastos: string; compartidos: string; inversores: string; socios: Record<string, string>; fondos: Record<string, string>; monto: string; fecha: string; notas: string };
const edInicial = (d: any): Ed => ({ cobrado: String(d.cobrado), otros: String(d.otros), gastos: String(d.gastos), compartidos: String(d.totalCompartidos), inversores: String(d.inversores),
  socios: Object.fromEntries(d.sociosCfg.map((s: any) => [s.user_id, String(s.porcentaje)])), fondos: Object.fromEntries(d.fondosCfg.map((f: any) => [f.fondo, String(f.porcentaje)])), monto: "", fecha: hoy(), notas: "" });

export function RepartoUtilidades() {
  const { zonas, zonaId, setZonaId, setProyectoId } = useApp(), zona = zonas.find(z => z.id === zonaId);
  const [mes, setMes] = useState(mesAnterior(hoy())), [v, setV] = useState(0), [ed, setEd] = useState<Ed | null>(null), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false), [pago, setPago] = useState<any>(null), [detalle, setDetalle] = useState(false);
  const datos = useQuery(() => zona ? cargarReparto(zona, mes) : Promise.resolve({ data: null, error: null }), [zonaId, mes, v]);
  const hist = useQuery(() => { let q = supabase.from("v_liquidaciones").select("id, zona_id, zona_nombre, periodo, fecha_reparto, utilidad, monto_repartido, total_socios, parte_dueno, estado").order("periodo", { ascending: false }).limit(60); if (zonaId) q = q.eq("zona_id", zonaId); return q; }, [zonaId, v]);
  const d: any = datos.data;
  useEffect(() => { if (d && !d.liq) setEd(edInicial(d)); else setEd(null); }, [datos.data]);
  const res = d && ed ? calcular({ cobrado: n(ed.cobrado), otros: n(ed.otros), gastos: n(ed.gastos), compartidos: n(ed.compartidos), inversores: n(ed.inversores),
    socios: d.sociosCfg.map((s: any) => ({ ...s, porcentaje: n(ed.socios[s.user_id]) })), fondos: FONDOS.map(f => ({ fondo: f as string, porcentaje: n(ed.fondos[f]) })), montoManual: ed.monto === "" ? null : n(ed.monto) }) : null;
  const up = (k: keyof Ed, val: any) => ed && setEd({ ...ed, [k]: val });

  const confirmar = async () => {
    if (!zona || !d || !ed || !res) return; setMsg(""); setOk("");
    if (!res.valido) return setMsg(res.avisos[0]);
    if (!confirm(`¿Confirmar el reparto de la zona ${zona.nombre} de ${mesLargo(mes)}?\n\nSe repartirán ${bs(res.monto)}: ${bs(res.totalSocios)} para socios y ${bs(res.parteDueno)} para ti. Los aportes a los fondos se registran solos.`)) return;
    setOcup(true);
    const payload = { zona_id: zona.id, periodo: rangoMes(mes)[0], fecha_reparto: ed.fecha, cobrado: n(ed.cobrado), otros_ingresos: n(ed.otros), gastos_operativos: n(ed.gastos), costos_compartidos: n(ed.compartidos), pagos_inversores: n(ed.inversores),
      utilidad: res.utilidad, monto_repartido: res.monto, socios: res.socios.map(s => ({ user_id: s.user_id, porcentaje: s.porcentaje, monto: s.monto })), fondos: res.fondos.map(f => ({ fondo: f.fondo, porcentaje: f.porcentaje, monto: f.monto })), notas: ed.notas,
      detalle: { gastos: d.lineasGasto.slice(0, 60).map((g: any) => ({ fecha: g.fecha, categoria: g.categoria, descripcion: g.descripcion, monto: n(g.monto) })), compartidos: d.compartidos.map((c: any) => ({ nombre: c.costo.nombre, metodo: c.costo.metodo, monto_total: c.costo.monto, cuota: c.cuota })), pagos_inversores: d.nPagosInv } };
    const { error } = await supabase.rpc("confirmar_liquidacion", { p: payload });
    setOcup(false);
    if (error) return setMsg(error.message);
    setOk("Reparto confirmado. Los aportes a los fondos ya están en Caja y fondos."); setV(x => x + 1);
  };
  const anular = async () => {
    if (!d?.liq) return; const motivo = prompt("Escribe el motivo para anular este reparto (se guarda como constancia):"); if (motivo === null) return;
    const { error } = await supabase.rpc("anular_liquidacion", { p_id: d.liq.id, p_motivo: motivo }); if (error) return setMsg(error.message); setOk("Reparto anulado. Ya puedes calcularlo de nuevo."); setV(x => x + 1);
  };
  const verComprobante = async (ruta: string) => { const u = await urlArchivo("comprobantes", ruta); if (u) window.open(u, "_blank"); else setMsg("No se pudo abrir el comprobante."); };
  const desmarcar = async (s: any) => { if (!confirm("¿Quitar la marca de pagado a " + s.socio_nombre + "?")) return; const { error } = await supabase.rpc("marcar_pago_socio", { p_id: s.id, p_fecha: null, p_comprobante: null }); if (error) setMsg(error.message); else setV(x => x + 1); };

  return <>
    <Aviso>La <b>utilidad</b> de una zona es lo <b>cobrado − gastos operativos − costos compartidos − pagos a inversores</b>. Primero se pagan los <b>socios</b> según su porcentaje; lo que queda es tu parte, y se divide en <b>Caja chica, Ahorro, Inversión y Retiro</b>. Todo se puede corregir a mano antes de confirmar.</Aviso>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="fila" style={{ marginBottom: 12 }}><b>Mes:</b><SelMes v={mes} set={setMes} /><span className="mute">{zona ? <>Zona: <b>{zona.nombre}</b></> : "Elige una zona arriba para calcular su reparto."}</span></div>
    {zona && (datos.loading ? <Cargando /> : datos.error ? <Aviso tipo="mal">{datos.error}</Aviso> : d && <>

      {d.liq ? <>
        <Aviso tipo="ok">Este mes ya tiene un reparto <b>confirmado</b> el {d.liq.fecha_reparto}.</Aviso>
        <div className="grid gk" style={{ marginBottom: 14 }}><Kpi t="Cobrado" v={bs(d.liq.cobrado)} /><Kpi t="Gastos operativos" v={bs(d.liq.gastos_operativos)} /><Kpi t="Costos compartidos" v={bs(d.liq.costos_compartidos)} /><Kpi t="Pagos a inversores" v={bs(d.liq.pagos_inversores)} />
          <Kpi t="Utilidad" v={bs(d.liq.utilidad)} c={n(d.liq.utilidad) >= 0 ? "var(--ok)" : "var(--bad)"} s={d.liq.otros_ingresos > 0 ? `incluye ${bs(d.liq.otros_ingresos)} de otros ingresos` : undefined} /><Kpi t="Repartido" v={bs(d.liq.monto_repartido)} /></div>
        <div className="card tw"><h2>Socios</h2>{d.liqSocios.length ? <table><thead><tr><th>Socio</th><th>%</th><th>Le corresponde</th><th>Pago</th><th /></tr></thead>
          <tbody>{d.liqSocios.map((s: any) => <tr key={s.id}><td><b>{s.socio_nombre}</b></td><td>{n(s.porcentaje)}%</td><td>{bs(s.monto)}</td><td>{s.pagado_en ? <span className="tag" style={{ background: "var(--okb)", color: "var(--ok)" }}>Pagado el {s.pagado_en}</span> : <span className="tag" style={{ background: "var(--warnb)", color: "var(--warn)" }}>Pendiente</span>}</td>
            <td><div className="fila">{s.pagado_en ? <>{s.comprobante_path && <button className="btn suave chico" onClick={() => verComprobante(s.comprobante_path)}>Ver comprobante</button>}<button className="btn suave chico" onClick={() => desmarcar(s)}>Quitar marca</button></> : <button className="btn chico" onClick={() => setPago(s)}>Marcar como pagado</button>}</div></td></tr>)}</tbody></table> : <Vacio>Esta zona no tenía socios con porcentaje.</Vacio>}
          <p>Total socios: <b>{bs(d.liq.total_socios)}</b> · Tu parte: <b>{bs(d.liq.parte_dueno)}</b></p></div>
        <div className="card tw"><h2>Tu parte, repartida en fondos</h2>{d.liqFondos.length ? <table><thead><tr><th>Fondo</th><th>%</th><th>Monto</th></tr></thead><tbody>{d.liqFondos.map((f: any) => <tr key={f.id}><td>{f.fondo}</td><td>{n(f.porcentaje)}%</td><td>{bs(f.monto)}</td></tr>)}</tbody></table> : <Vacio>Sin fondos.</Vacio>}</div>
        <div className="card"><button className="btn suave" onClick={anular}>Anular este reparto</button><p className="mute">Anular devuelve los aportes a los fondos y te deja calcularlo de nuevo. El reparto anulado queda guardado como constancia. Si ya marcaste pagos a socios, primero quítales la marca.</p></div>
      </> : ed && res && <>
        {d.sinZona > 0 && <Aviso>Hay <b>{bs(d.sinZona)}</b> de gastos de este mes registrados <b>sin zona</b>; no se descuentan aquí. Si son de la empresa, regístralos en <i>Gastos de la empresa</i>; si sirven a varias zonas, en <i>Costos compartidos</i>.</Aviso>}
        {d.compartidos.filter((c: any) => c.aviso).map((c: any) => <Aviso key={c.costo.id} tipo="mal"><b>{c.costo.nombre}:</b> {c.aviso}</Aviso>)}
        <div className="card tw"><h2>1. Utilidad del mes</h2>
          <table><thead><tr><th>Concepto</th><th>Monto (Bs)</th><th /></tr></thead><tbody>
            <tr><td>Cobrado a clientes</td><td><Monto v={ed.cobrado} set={x => up("cobrado", x)} /></td><td className="mute">Pagos recibidos en el mes (sin anulados)</td></tr>
            <tr><td>+ Otros ingresos</td><td><Monto v={ed.otros} set={x => up("otros", x)} /></td><td className="mute">Ingresos registrados en Finanzas para esta zona</td></tr>
            <tr><td>− Gastos operativos</td><td><Monto v={ed.gastos} set={x => up("gastos", x)} /></td><td className="mute">Gastos registrados en Ingresos y gastos con esta zona</td></tr>
            <tr><td>− Costos compartidos</td><td><Monto v={ed.compartidos} set={x => up("compartidos", x)} /></td><td className="mute">{d.compartidos.length ? d.compartidos.map((c: any) => `${c.costo.nombre}: ${bs(c.cuota)}`).join(" · ") : "Ninguno"}</td></tr>
            <tr><td>− Pagos a inversores</td><td><Monto v={ed.inversores} set={x => up("inversores", x)} /></td><td className="mute">{d.nPagosInv ? `${d.nPagosInv} pago(s) del mes` : "Ninguno"}</td></tr>
          </tbody><tfoot><tr><td><b>Utilidad</b></td><td colSpan={2} style={{ color: res.utilidad >= 0 ? "var(--ok)" : "var(--bad)" }}><b>{bs(res.utilidad)}</b>{res.utilidad < 0 && " · no hay utilidad para repartir este mes"}</td></tr></tfoot></table>
          <div className="fila" style={{ marginTop: 8 }}><button className="btn suave chico" onClick={() => setDetalle(!detalle)}>{detalle ? "Ocultar detalle" : "Ver el detalle de los gastos"}</button><button className="btn suave chico" onClick={() => setV(x => x + 1)}>Volver a calcular con los datos actuales</button></div>
          {detalle && <div style={{ marginTop: 8 }}>{d.lineasGasto.length ? <table><thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Monto</th></tr></thead><tbody>{d.lineasGasto.map((g: any, i: number) => <tr key={i}><td>{g.fecha}</td><td>{g.categoria || "—"}</td><td>{g.descripcion || "—"}</td><td>{bs(g.monto)}</td></tr>)}</tbody></table> : <Vacio>Sin gastos operativos registrados en este mes.</Vacio>}</div>}
        </div>

        <div className="card tw"><h2>2. Socios</h2>
          <div className="fila" style={{ marginBottom: 8 }}><label className="fila">Monto a repartir (déjalo vacío para repartir toda la utilidad): <Monto v={ed.monto} set={x => up("monto", x)} /></label><b>Se repartirán {bs(res.monto)}</b></div>
          {d.sociosCfg.length ? <table><thead><tr><th>Socio</th><th>Porcentaje</th><th>Le corresponde</th></tr></thead><tbody>
            {res.socios.map((s: any) => <tr key={s.user_id}><td><b>{s.nombre}</b></td><td><Pct v={ed.socios[s.user_id]} set={x => setEd({ ...ed, socios: { ...ed.socios, [s.user_id]: x } })} /></td><td>{bs(s.monto)}</td></tr>)}
            <tr><td><b>Tú (dueño)</b></td><td>{res.pctDueno}%</td><td><b>{bs(res.parteDueno)}</b></td></tr></tbody></table>
            : <Vacio>Esta zona no tiene socios con porcentaje: toda la utilidad es tuya. Puedes agregarlos en <b>Socios y porcentajes</b>.</Vacio>}
        </div>

        <div className="card tw"><h2>3. Tu parte ({bs(res.parteDueno)}) repartida en fondos</h2>
          <table><thead><tr><th>Fondo</th><th>Porcentaje</th><th>Monto</th></tr></thead><tbody>
            {res.fondos.map((f: any) => <tr key={f.fondo}><td>{f.fondo}</td><td><Pct v={ed.fondos[f.fondo]} set={x => setEd({ ...ed, fondos: { ...ed.fondos, [f.fondo]: x } })} /></td><td>{bs(f.monto)}</td></tr>)}
            <tr><td className="mute">Sin asignar a ningún fondo</td><td className="mute">{r2(Math.max(0, 100 - res.pctFondos))}%</td><td className="mute">{bs(res.sinAsignar)}</td></tr></tbody></table>
        </div>

        <div className="card"><div className="form"><Campo l="Fecha del reparto"><input type="date" value={ed.fecha} onChange={e => up("fecha", e.target.value)} /></Campo><Campo l="Notas (opcional)"><input value={ed.notas} onChange={e => up("notas", e.target.value)} /></Campo></div>
          {res.avisos.map((a, i) => <Aviso key={i} tipo="mal">{a}</Aviso>)}
          <button className="btn mor" disabled={ocup || !res.valido} onClick={confirmar}>{ocup ? "Confirmando…" : "Confirmar reparto"}</button>
          <p className="mute">Al confirmar se guarda el reparto con los porcentajes que ves aquí (los de la zona no cambian) y se registran los aportes a los fondos.</p></div>
      </>}
    </>)}

    <div className="card tw"><h2>Repartos anteriores{zona ? " de " + zona.nombre : ""}</h2>{hist.loading ? <Cargando /> : ((hist.data as any[]) || []).length ? <table><thead><tr><th>Mes</th><th>Zona</th><th>Utilidad</th><th>Repartido</th><th>Socios</th><th>Tu parte</th><th>Estado</th><th /></tr></thead>
      <tbody>{((hist.data as any[]) || []).map(h => <tr key={h.id} style={{ opacity: h.estado === "ANULADA" ? 0.5 : 1 }}><td>{mesLargo(String(h.periodo).slice(0, 7))}</td><td>{h.zona_nombre}</td><td>{bs(h.utilidad)}</td><td>{bs(h.monto_repartido)}</td><td>{bs(h.total_socios)}</td><td>{bs(h.parte_dueno)}</td><td>{h.estado === "ANULADA" ? "Anulado" : "Confirmado"}</td>
        <td><button className="btn suave chico" onClick={() => { setProyectoId(""); setZonaId(h.zona_id); setMes(String(h.periodo).slice(0, 7)); }}>Ver</button></td></tr>)}</tbody></table> : <Vacio>Aún no hay repartos confirmados.</Vacio>}</div>
    {pago && <PagoSocio s={pago} proyecto={zona?.proyecto_id} onClose={() => setPago(null)} onListo={() => { setPago(null); setV(x => x + 1); }} />}
  </>;
}

function PagoSocio({ s, proyecto, onClose, onListo }: { s: any; proyecto: string; onClose: () => void; onListo: () => void }) {
  const [fecha, setFecha] = useState(hoy()), [arch, setArch] = useState<File | null>(null), [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false);
  const guardar = async () => {
    setMsg(""); setOcup(true);
    try {
      const ruta = arch && proyecto ? await subirArchivo("comprobantes", proyecto, arch) : null;
      const { error } = await supabase.rpc("marcar_pago_socio", { p_id: s.id, p_fecha: fecha, p_comprobante: ruta }); if (error) throw new Error(error.message); onListo();
    } catch (e: any) { setMsg(e.message); setOcup(false); }
  };
  return <Modal titulo={`Pago a ${s.socio_nombre}`} onClose={onClose}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    <p>Le corresponden <b>{bs(s.monto)}</b>.</p>
    <div className="form"><Campo l="Fecha en que se pagó"><input type="date" value={fecha} max={hoy()} onChange={e => setFecha(e.target.value)} /></Campo><Campo l="Comprobante (opcional)"><input type="file" onChange={e => setArch(e.target.files?.[0] || null)} /></Campo></div>
    <button className="btn" disabled={ocup} onClick={guardar}>{ocup ? "Guardando…" : "Marcar como pagado"}</button></Modal>;
}

/* ======================================================================= */
/*  SOCIOS Y PORCENTAJES                                                    */
/* ======================================================================= */
export function SociosPorcentajes() {
  const { zonas, zonaId } = useApp(), zona = zonas.find(z => z.id === zonaId);
  const zs = useQuery(() => zonaId ? supabase.from("zona_socios").select("user_id, porcentaje").eq("zona_id", zonaId) : nada, [zonaId]);
  const fp = useQuery(() => zonaId ? supabase.from("zona_fondos_pct").select("fondo, porcentaje").eq("zona_id", zonaId) : nada, [zonaId]);
  const socios = useQuery(() => supabase.from("profiles").select("id, nombre, email").eq("rol", "socio").eq("activo", true).order("nombre"), []);
  const [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [nuevo, setNuevo] = useState(""), [nuevoPct, setNuevoPct] = useState("");
  const S: any[] = (socios.data as any[]) || [], Z: any[] = (zs.data as any[]) || [], F: any[] = (fp.data as any[]) || [];
  const totS = r2(suma(Z, "porcentaje")), pf = (f: string) => n(F.find(x => x.fondo === f)?.porcentaje), totF = r2(FONDOS.reduce((s, f) => s + pf(f), 0));
  const nom = (id: string) => nombreDe(S.find(x => x.id === id));
  const guardarSocio = async (user_id: string, porcentaje: number) => {
    setMsg(""); setOk(""); const { error } = await supabase.from("zona_socios").upsert({ zona_id: zonaId, user_id, porcentaje }, { onConflict: "zona_id,user_id" });
    if (error) { setMsg(error.message); zs.recargar(); } else { setOk("Guardado."); zs.recargar(); }
  };
  const guardarFondo = async (fondo: string, porcentaje: number) => {
    setMsg(""); setOk(""); const { error } = await supabase.from("zona_fondos_pct").upsert({ zona_id: zonaId, fondo, porcentaje }, { onConflict: "zona_id,fondo" });
    if (error) { setMsg(error.message); fp.recargar(); } else { setOk("Guardado."); fp.recargar(); }
  };
  if (!zona) return <Aviso>Elige una <b>zona</b> arriba para ver y cambiar sus porcentajes.</Aviso>;
  return <>
    <Aviso>Estos son los porcentajes <b>de la zona {zona.nombre}</b>. Cada zona tiene los suyos y puedes cambiarlos cuando quieras: los repartos ya confirmados no se modifican, porque guardan los porcentajes con los que se hicieron.</Aviso>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="grid g2">
      <div className="card tw"><h2>Socios de {zona.nombre}</h2>{zs.loading || socios.loading ? <Cargando /> : <>
        {Z.length ? <table><thead><tr><th>Socio</th><th>Porcentaje de la utilidad</th></tr></thead><tbody>{Z.map(x => <tr key={x.user_id}><td><b>{nom(x.user_id)}</b></td>
          <td><input type="number" min={0} max={100} step={0.5} style={{ width: 90 }} defaultValue={n(x.porcentaje)} key={x.user_id + n(x.porcentaje)} onBlur={e => n(e.target.value) !== n(x.porcentaje) && guardarSocio(x.user_id, n(e.target.value))} /> %</td></tr>)}</tbody></table> : <Vacio>Esta zona no tiene socios con porcentaje.</Vacio>}
        <p>Socios: <b>{totS}%</b> · Tu parte: <b>{r2(Math.max(0, 100 - totS))}%</b></p></>}
        <p className="mute">Para sacar a un socio de esta zona, ponle 0%. Cambia el número y sal del campo para guardar.</p>
        <h3>Agregar un socio</h3>
        {(() => { const libres = S.filter(x => !Z.some(z => z.user_id === x.id)); return libres.length ? <div className="fila"><select value={nuevo} onChange={e => setNuevo(e.target.value)}><option value="">Elige un socio…</option>{libres.map(x => <option key={x.id} value={x.id}>{nombreDe(x)}</option>)}</select>
          <Pct v={nuevoPct} set={setNuevoPct} /><button className="btn" disabled={!nuevo || nuevoPct === ""} onClick={async () => { await guardarSocio(nuevo, n(nuevoPct)); setNuevo(""); setNuevoPct(""); }}>Agregar</button></div> : <p className="mute">No hay más usuarios con rol Socio. Créalos en el menú Usuarios.</p>; })()}
        <p className="mute">Tener un porcentaje no le da acceso a ver la zona; el acceso se da en Zonas → Socios.</p></div>

      <div className="card tw"><h2>Tu parte: reparto en fondos</h2>{fp.loading ? <Cargando /> : <>
        <table><thead><tr><th>Fondo</th><th>Porcentaje de tu parte</th></tr></thead><tbody>{FONDOS.map(f => <tr key={f}><td>{f}</td><td><input type="number" min={0} max={100} step={0.5} style={{ width: 90 }} defaultValue={pf(f)} key={f + pf(f)} onBlur={e => n(e.target.value) !== pf(f) && guardarFondo(f, n(e.target.value))} /> %</td></tr>)}</tbody></table>
        <p>Asignado: <b>{totF}%</b> · Sin asignar: <b>{r2(Math.max(0, 100 - totF))}%</b></p>
        <p className="mute">Es el porcentaje de <b>lo que te queda a ti</b> después de pagar a los socios. Lo que no asignes a ningún fondo queda sin asignar. Puedes cambiarlo en cada reparto antes de confirmarlo.</p></>}</div>
    </div>
  </>;
}

/* ======================================================================= */
/*  COSTOS COMPARTIDOS                                                      */
/* ======================================================================= */
export function CostosCompartidos() {
  const { zonas } = useApp();
  const costos = useQuery(() => supabase.from("costos_compartidos").select("*").order("nombre"), []);
  const cz = useQuery(() => supabase.from("costos_compartidos_zonas").select("*"), [costos.data]);
  const cm = useQuery(() => supabase.from("costos_compartidos_meses").select("*").eq("periodo", rangoMes(hoy().slice(0, 7))[0]).eq("activo", true), [costos.data]);
  const cli = useQuery(() => clientesActivos().then(data => ({ data, error: null })), [costos.data]);
  const [ed, setEd] = useState<any>(null), [msg, setMsg] = useState("");
  const C: any[] = (costos.data as any[]) || [], CZ: any[] = (cz.data as any[]) || [], CM: any[] = (cm.data as any[]) || [], clientes: Record<string, number> = (cli.data as any) || {};
  const nz = (id: string) => zonas.find(z => z.id === id)?.nombre || "(zona en la papelera)";
  const cuotas = (c: any) => {
    const zsC = CZ.filter(z => z.costo_id === c.id && z.incluida).map(z => ({ zona_id: z.zona_id, porcentaje: n(z.porcentaje) })), ov = CM.find(m => m.costo_id === c.id);
    const costo: CostoComp = { id: c.id, nombre: c.nombre, metodo: c.metodo, monto: ov ? n(ov.monto) : n(c.monto_mensual), zonas: zsC };
    return zsC.map(z => ({ zona: nz(z.zona_id), ...cuotaCostoCompartido(costo, z.zona_id, clientes) }));
  };
  const quitar = async (c: any) => { if (!confirm(`¿Mandar "${c.nombre}" a la papelera? Dejará de repartirse entre las zonas. Podrás restaurarlo desde el menú Papelera.`)) return; try { await aPapelera("costos_compartidos", [c.id]); costos.recargar(); } catch (e: any) { setMsg(e.message); } };
  return <>
    <Aviso>Un <b>costo compartido</b> es un gasto que sirve a varias zonas (por ejemplo un Starlink). Se reparte entre ellas cada mes y cada zona lo descuenta de su utilidad. <b>El método lo eliges en cada costo.</b> Solo tú ves esta pantalla; cada socio ve únicamente lo que le toca a su zona.</Aviso>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}
    <div className="fila" style={{ marginBottom: 12 }}><button className="btn" onClick={() => setEd({})}>+ Nuevo costo compartido</button></div>
    <div className="card tw"><h2>Costos compartidos</h2>{costos.loading ? <Cargando /> : C.length ? <table><thead><tr><th>Costo</th><th>Monto mensual</th><th>Método</th><th>Lo que paga cada zona este mes</th><th>Vigencia</th><th /></tr></thead>
      <tbody>{C.map(c => <tr key={c.id} style={{ opacity: c.activo ? 1 : 0.5 }}><td><b>{c.nombre}</b>{c.categoria && <><br /><span className="mute">{c.categoria}</span></>}{!c.activo && <><br /><span className="tag">Inactivo</span></>}</td><td>{bs(c.monto_mensual)}</td><td>{METODOS[c.metodo as Metodo]}</td>
        <td>{cuotas(c).map((x, i) => <div key={i}>{x.zona}: <b>{bs(x.cuota)}</b>{x.aviso && <span style={{ color: "var(--bad)" }}> ⚠</span>}</div>)}</td><td>desde {c.desde}{c.hasta ? ` hasta ${c.hasta}` : ""}</td>
        <td><div className="fila"><button className="btn suave chico" onClick={() => setEd(c)}>Editar</button><button className="btn suave chico" onClick={() => quitar(c)}>A la papelera</button></div></td></tr>)}</tbody></table> : <Vacio>Aún no hay costos compartidos.</Vacio>}</div>
    {ed && <FormCosto costo={ed.id ? ed : null} zonas={zonas} zonasCosto={CZ.filter(z => z.costo_id === ed.id)} clientes={clientes} onClose={() => setEd(null)} onListo={() => { setEd(null); costos.recargar(); cz.recargar(); cm.recargar(); }} />}
  </>;
}

function FormCosto({ costo, zonas, zonasCosto, clientes, onClose, onListo }: any) {
  const [f, setF] = useState({ nombre: costo?.nombre || "", categoria: costo?.categoria || "", monto: String(costo?.monto_mensual ?? ""), metodo: (costo?.metodo || "iguales") as Metodo, desde: costo?.desde || rangoMes(hoy().slice(0, 7))[0], hasta: costo?.hasta || "", activo: costo?.activo ?? true, nota: costo?.nota || "" });
  const [sel, setSel] = useState<Record<string, { on: boolean; pct: string }>>(() => Object.fromEntries(zonas.map((z: any) => { const x = zonasCosto.find((c: any) => c.zona_id === z.id); return [z.id, { on: !!x?.incluida, pct: String(x?.porcentaje ?? 0) }]; })));
  const meses = useQuery(() => costo ? supabase.from("costos_compartidos_meses").select("*").eq("costo_id", costo.id).eq("activo", true).order("periodo", { ascending: false }) : nada, [costo?.id]);
  const [mes, setMes] = useState(hoy().slice(0, 7)), [mmonto, setMmonto] = useState(""), [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false);
  const incl = zonas.filter((z: any) => sel[z.id]?.on);
  const vista: CostoComp = { id: "x", nombre: f.nombre, metodo: f.metodo, monto: n(f.monto), zonas: incl.map((z: any) => ({ zona_id: z.id, porcentaje: n(sel[z.id].pct) })) };
  const totPct = r2(incl.reduce((s: number, z: any) => s + n(sel[z.id].pct), 0));

  const guardar = async () => {
    setMsg("");
    if (!f.nombre.trim()) return setMsg("Escribe el nombre del costo.");
    if (!(n(f.monto) >= 0) || f.monto === "") return setMsg("Escribe el monto mensual.");
    if (!incl.length) return setMsg("Elige al menos una zona.");
    if (f.metodo === "porcentaje" && Math.abs(totPct - 100) > 0.01) return setMsg(`Los porcentajes de las zonas suman ${totPct}%: deben sumar 100%.`);
    setOcup(true);
    try {
      const fila = { nombre: f.nombre.trim(), categoria: f.categoria || null, monto_mensual: n(f.monto), metodo: f.metodo, desde: f.desde, hasta: f.hasta || null, activo: f.activo, nota: f.nota || null };
      let id = costo?.id;
      if (id) { const { error } = await supabase.from("costos_compartidos").update(fila).eq("id", id); if (error) throw new Error(error.message); }
      else { const { data, error } = await supabase.from("costos_compartidos").insert(fila).select("id").single(); if (error) throw new Error(error.message); id = (data as any).id; }
      const { error } = await supabase.from("costos_compartidos_zonas").upsert(zonas.map((z: any) => ({ costo_id: id, zona_id: z.id, incluida: !!sel[z.id].on, porcentaje: n(sel[z.id].pct) })), { onConflict: "costo_id,zona_id" });
      if (error) throw new Error(error.message);
      onListo();
    } catch (e: any) { setMsg(e.message); setOcup(false); }
  };
  const ajuste = async (periodo: string, monto: number | null) => {
    if (!costo) return; setMsg("");
    const { error } = await supabase.from("costos_compartidos_meses").upsert({ costo_id: costo.id, periodo, monto: monto ?? 0, activo: monto !== null }, { onConflict: "costo_id,periodo" });
    if (error) setMsg(error.message); else { setMmonto(""); meses.recargar(); }
  };
  return <Modal titulo={costo ? "Editar costo compartido" : "Nuevo costo compartido"} onClose={onClose} ancho={760}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    <div className="form">
      <Campo l="Nombre *"><input value={f.nombre} placeholder="Starlink central" onChange={e => setF({ ...f, nombre: e.target.value })} /></Campo>
      <Campo l="Categoría"><input value={f.categoria} placeholder="Internet" onChange={e => setF({ ...f, categoria: e.target.value })} /></Campo>
      <Campo l="Monto mensual (Bs) *"><input type="number" min={0} step={0.01} value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} /></Campo>
      <Campo l="¿Cómo se reparte? *"><select value={f.metodo} onChange={e => setF({ ...f, metodo: e.target.value as Metodo })}>{Object.entries(METODOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Campo>
      <Campo l="Vigente desde"><input type="date" value={f.desde} onChange={e => setF({ ...f, desde: e.target.value })} /></Campo>
      <Campo l="Hasta (opcional)"><input type="date" value={f.hasta} onChange={e => setF({ ...f, hasta: e.target.value })} /></Campo>
      <Campo l="Nota"><input value={f.nota} onChange={e => setF({ ...f, nota: e.target.value })} /></Campo>
      <label className="fila"><input type="checkbox" checked={f.activo} onChange={e => setF({ ...f, activo: e.target.checked })} /> Activo</label>
    </div>
    <h3>Zonas que lo comparten</h3>
    <table style={{ minWidth: 0 }}><thead><tr><th /><th>Zona</th>{f.metodo === "porcentaje" && <th>Porcentaje</th>}<th>Le tocaría este mes</th></tr></thead>
      <tbody>{zonas.map((z: any) => { const q = sel[z.id]; const cuota = q.on ? cuotaCostoCompartido(vista, z.id, clientes) : null; return <tr key={z.id}>
        <td><input type="checkbox" checked={q.on} onChange={e => setSel({ ...sel, [z.id]: { ...q, on: e.target.checked } })} /></td><td>{z.nombre}{f.metodo === "clientes" && <span className="mute"> · {clientes[z.id] || 0} clientes</span>}</td>
        {f.metodo === "porcentaje" && <td>{q.on ? <Pct v={q.pct} set={x => setSel({ ...sel, [z.id]: { ...q, pct: x } })} /> : "—"}</td>}<td>{cuota ? bs(cuota.cuota) : "—"}</td></tr>; })}</tbody></table>
    {f.metodo === "porcentaje" && <p style={{ color: Math.abs(totPct - 100) > 0.01 ? "var(--bad)" : "var(--ok)" }}>Suman {totPct}% {Math.abs(totPct - 100) > 0.01 ? "(deben sumar 100%)" : "✓"}</p>}
    {f.metodo === "clientes" && <p className="mute">Se reparte según los clientes activos que tiene cada zona al momento de calcular el reparto.</p>}
    {costo && <><h3>Meses con un monto distinto</h3><p className="mute">Si un mes el costo fue otro (por ejemplo no se pagó), anótalo aquí; para ese mes se usa este monto en vez del mensual.</p>
      {((meses.data as any[]) || []).map(m => <div key={m.periodo} className="fila" style={{ marginBottom: 4 }}><span>{mesLargo(String(m.periodo).slice(0, 7))}: <b>{bs(m.monto)}</b></span><button className="btn suave chico" onClick={() => ajuste(m.periodo, null)}>Quitar ajuste</button></div>)}
      <div className="fila"><SelMes v={mes} set={setMes} /><input type="number" min={0} step={0.01} placeholder="Monto de ese mes" value={mmonto} style={{ width: 150 }} onChange={e => setMmonto(e.target.value)} /><button className="btn suave" disabled={mmonto === ""} onClick={() => ajuste(rangoMes(mes)[0], n(mmonto))}>Guardar ajuste</button></div></>}
    <div className="fila" style={{ marginTop: 14 }}><button className="btn" disabled={ocup} onClick={guardar}>{ocup ? "Guardando…" : "Guardar"}</button></div>
  </Modal>;
}

/* ======================================================================= */
/*  GASTOS DE LA EMPRESA                                                    */
/* ======================================================================= */
const CATEGORIAS = ["Contador", "Oficina", "Publicidad", "Impuestos", "Software", "Movilidad", "Sueldos administrativos", "Otros"];
export function GastosEmpresa() {
  const [mes, setMes] = useState(hoy().slice(0, 7)), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false), [arch, setArch] = useState<File | null>(null);
  const [ini, fin] = rangoMes(mes || hoy().slice(0, 7));
  const vacio = { fecha: hoy(), categoria: "Otros", concepto: "", monto: "", pagado_desde: "Fuera de los fondos", nota: "" }, [f, setF] = useState(vacio);
  const gastos = useQuery(() => { let q = supabase.from("gastos_empresa").select("*").order("fecha", { ascending: false }).limit(500); if (mes) q = q.gte("fecha", ini).lte("fecha", fin); return q; }, [mes]);
  const liqs = useQuery(() => { let q = supabase.from("v_liquidaciones").select("parte_dueno, fecha_reparto").eq("estado", "CONFIRMADA").limit(2000); if (mes) q = q.gte("fecha_reparto", ini).lte("fecha_reparto", fin); return q; }, [mes]);
  const G: any[] = (gastos.data as any[]) || [], totG = r2(suma(G, "monto")), totD = r2(suma((liqs.data as any[]) || [], "parte_dueno"));
  const porCat: Record<string, number> = {}; G.forEach(g => { porCat[g.categoria] = (porCat[g.categoria] || 0) + n(g.monto); });

  const guardar = async () => {
    setMsg(""); setOk("");
    if (!f.concepto.trim()) return setMsg("Escribe el concepto del gasto."); if (!(n(f.monto) > 0)) return setMsg("Escribe un monto mayor a 0.");
    setOcup(true);
    try {
      const ruta = arch ? await subirArchivo("comprobantes", "empresa", arch) : null;
      const { error } = await supabase.rpc("registrar_gasto_empresa", { p: { ...f, monto: n(f.monto), comprobante_path: ruta } }); if (error) throw new Error(error.message);
      setF(vacio); setArch(null); setOk("Gasto registrado."); gastos.recargar();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  const quitar = async (g: any) => { if (!confirm(`¿Mandar "${g.concepto}" a la papelera?` + (g.pagado_desde !== "Fuera de los fondos" ? `\n\nTambién se devuelve el descuento hecho al fondo ${g.pagado_desde}.` : ""))) return; try { await aPapelera("gastos_empresa", [g.id]); gastos.recargar(); } catch (e: any) { setMsg(e.message); } };
  const ver = async (ruta: string) => { const u = await urlArchivo("comprobantes", ruta); if (u) window.open(u, "_blank"); else setMsg("No se pudo abrir el comprobante."); };
  return <>
    <Aviso>Aquí van los gastos de la <b>empresa</b> que no pertenecen a ninguna zona (contador, oficina, publicidad…). <b>No se descuentan de la utilidad de las zonas ni de los socios</b>: salen de tu parte. Solo tú ves esta pantalla. Un gasto registrado no se edita: si hay un error, mándalo a la papelera y regístralo de nuevo.</Aviso>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="fila" style={{ marginBottom: 12 }}><b>Ver:</b><SelMes v={mes} set={setMes} todos /></div>
    <div className="grid gk" style={{ marginBottom: 14 }}><Kpi t="Gastos de la empresa" v={bs(totG)} s={mes ? mesLargo(mes) : "Todos los meses"} /><Kpi t="Tu parte recibida en repartos" v={bs(totD)} s="Repartos confirmados con fecha en ese período" /><Kpi t="Resultado de la empresa" v={bs(totD - totG)} c={totD - totG >= 0 ? "var(--ok)" : "var(--bad)"} s="Tu parte − gastos de la empresa" /></div>
    <div className="card"><h2>Registrar un gasto</h2><div className="form">
      <Campo l="Fecha"><input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></Campo>
      <Campo l="Categoría"><input list="cat-empresa" value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })} /><datalist id="cat-empresa">{CATEGORIAS.map(c => <option key={c} value={c} />)}</datalist></Campo>
      <Campo l="Concepto *"><input value={f.concepto} onChange={e => setF({ ...f, concepto: e.target.value })} /></Campo>
      <Campo l="Monto (Bs) *"><input type="number" min={0} step={0.01} value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} /></Campo>
      <Campo l="¿De dónde salió el dinero?"><select value={f.pagado_desde} onChange={e => setF({ ...f, pagado_desde: e.target.value })}>{[...FONDOS, "Fuera de los fondos"].map(x => <option key={x}>{x}</option>)}</select></Campo>
      <Campo l="Comprobante (opcional)"><input type="file" key={String(ok)} onChange={e => setArch(e.target.files?.[0] || null)} /></Campo>
      <Campo l="Nota"><input value={f.nota} onChange={e => setF({ ...f, nota: e.target.value })} /></Campo>
    </div><button className="btn" disabled={ocup} onClick={guardar}>{ocup ? "Guardando…" : "Registrar gasto"}</button><p className="mute">Si eliges un fondo (por ejemplo Caja chica), el gasto se descuenta de ese fondo solo.</p></div>
    {Object.keys(porCat).length > 0 && <div className="card"><h2>Por categoría</h2><div className="fila">{Object.entries(porCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k} className="tag">{k}: {bs(v)}</span>)}</div></div>}
    <div className="card tw"><h2>Gastos</h2>{gastos.loading ? <Cargando /> : G.length ? <table><thead><tr><th>Fecha</th><th>Categoría</th><th>Concepto</th><th>Monto</th><th>Salió de</th><th /></tr></thead>
      <tbody>{G.map(g => <tr key={g.id}><td>{g.fecha}</td><td>{g.categoria}</td><td>{g.concepto}{g.nota && <><br /><span className="mute">{g.nota}</span></>}</td><td><b>{bs(g.monto)}</b></td><td>{g.pagado_desde}</td>
        <td><div className="fila">{g.comprobante_path && <button className="btn suave chico" onClick={() => ver(g.comprobante_path)}>Ver comprobante</button>}<button className="btn suave chico" onClick={() => quitar(g)}>A la papelera</button></div></td></tr>)}</tbody></table> : <Vacio>No hay gastos de la empresa en este período.</Vacio>}</div>
  </>;
}

/* ======================================================================= */
/*  CAJA Y FONDOS (de la empresa)                                           */
/* ======================================================================= */
export function CajaFondos() {
  const mov = useQuery(() => supabase.from("fondos_empresa").select("*").order("fecha", { ascending: false }).order("creado_en", { ascending: false }).limit(300), []);
  const saldos = useQuery(() => todas(() => supabase.from("fondos_empresa").select("fondo, tipo, monto, anulado")).then(data => ({ data, error: null })), [mov.data]);
  const vacio = { fecha: hoy(), fondo: "Caja chica", tipo: "Aporte", monto: "", nota: "" }, [f, setF] = useState(vacio), [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false);
  const S: any[] = ((saldos.data as any[]) || []).filter(x => !x.anulado), M: any[] = (mov.data as any[]) || [];
  const saldo = (k: string) => r2(S.filter(x => x.fondo === k).reduce((s, x) => s + (x.tipo === "Aporte" ? n(x.monto) : -n(x.monto)), 0));
  const guardar = async () => {
    setMsg(""); if (!(n(f.monto) > 0)) return setMsg("Escribe un monto mayor a 0."); setOcup(true);
    const { error } = await supabase.from("fondos_empresa").insert({ fecha: f.fecha, fondo: f.fondo, tipo: f.tipo, monto: n(f.monto), nota: f.nota || null, origen: "manual" });
    setOcup(false); if (error) return setMsg(error.message); setF(vacio); mov.recargar();
  };
  const quitar = async (m: any) => { if (!confirm("¿Mandar este movimiento a la papelera? Podrás recuperarlo desde el menú Papelera.")) return; try { await aPapelera("fondos_empresa", [m.id]); mov.recargar(); } catch (e: any) { setMsg(e.message); } };
  const ETIQ: Record<string, string> = { manual: "Manual", reparto: "Reparto", gasto_empresa: "Gasto de la empresa" };
  return <>
    <Aviso>Estos son los fondos de <b>tu parte</b>: Caja chica, Ahorro, Inversión y Retiro del dueño. Anota aquí lo que entra y lo que sale de cada uno. Solo tú ves esta pantalla.</Aviso>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}
    <div className="grid gk" style={{ marginBottom: 14 }}>{FONDOS.map(k => <Kpi key={k} t={k} v={bs(saldo(k))} c={saldo(k) < 0 ? "var(--bad)" : undefined} />)}</div>
    <div className="card"><h2>Registrar un movimiento a mano</h2><div className="form">
      <Campo l="Fecha"><input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></Campo>
      <Campo l="Fondo"><select value={f.fondo} onChange={e => setF({ ...f, fondo: e.target.value })}>{FONDOS.map(x => <option key={x}>{x}</option>)}</select></Campo>
      <Campo l="Tipo"><select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}><option>Aporte</option><option>Gasto</option></select></Campo>
      <Campo l="Monto (Bs)"><input type="number" min={0} step={0.01} value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} /></Campo>
      <Campo l="Nota"><input value={f.nota} onChange={e => setF({ ...f, nota: e.target.value })} /></Campo></div><button className="btn" disabled={ocup} onClick={guardar}>Agregar</button></div>
    <div className="card tw"><h2>Movimientos</h2>{mov.loading ? <Cargando /> : M.length ? <table><thead><tr><th>Fecha</th><th>Fondo</th><th>Tipo</th><th>Monto</th><th>Origen</th><th>Nota</th><th /></tr></thead>
      <tbody>{M.map(m => <tr key={m.id} style={{ opacity: m.anulado ? 0.45 : 1, textDecoration: m.anulado ? "line-through" : undefined }}><td>{m.fecha}</td><td>{m.fondo}</td><td>{m.tipo}</td><td><b>{bs(m.monto)}</b></td><td>{ETIQ[m.origen] || m.origen}{m.anulado && " · anulado"}</td><td>{m.nota || "—"}</td>
        <td>{m.origen === "manual" && !m.anulado && <button className="btn suave chico" onClick={() => quitar(m)}>A la papelera</button>}</td></tr>)}</tbody></table> : <Vacio>Aún no hay movimientos.</Vacio>}</div>
  </>;
}

/* ======================================================================= */
/*  MI REPARTO (para cada socio)                                            */
/* ======================================================================= */
export function MiReparto() {
  const q = useQuery(() => supabase.from("v_reparto_socios").select("*").order("periodo", { ascending: false }).limit(120), []);
  const [msg, setMsg] = useState("");
  const R: any[] = ((q.data as any[]) || []).filter(x => x.estado === "CONFIRMADA");
  const recibido = r2(suma(R.filter(x => x.pagado_en), "monto")), pendiente = r2(suma(R.filter(x => !x.pagado_en), "monto"));
  const ver = async (ruta: string) => { const u = await urlArchivo("comprobantes", ruta); if (u) window.open(u, "_blank"); else setMsg("No se pudo abrir el comprobante."); };
  return <>
    <Aviso>Aquí ves lo que te corresponde de la utilidad de tus zonas, mes a mes, y si ya te lo pagaron.</Aviso>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}
    <div className="grid gk" style={{ marginBottom: 14 }}><Kpi t="Ya recibido" v={bs(recibido)} c="var(--ok)" /><Kpi t="Pendiente de pago" v={bs(pendiente)} c={pendiente ? "var(--warn)" : undefined} /></div>
    <div className="card tw"><h2>Mis repartos</h2>{q.loading ? <Cargando /> : q.error ? <Aviso tipo="mal">{q.error}</Aviso> : R.length ? <table><thead><tr><th>Mes</th><th>Zona</th><th>Utilidad de la zona</th><th>Mi porcentaje</th><th>Mi parte</th><th>Estado</th><th /></tr></thead>
      <tbody>{R.map(r => <tr key={r.id}><td>{mesLargo(String(r.periodo).slice(0, 7))}</td><td>{r.zona_nombre}</td><td>{bs(r.utilidad)}</td><td>{n(r.porcentaje)}%</td><td><b>{bs(r.monto)}</b></td>
        <td>{r.pagado_en ? <span className="tag" style={{ background: "var(--okb)", color: "var(--ok)" }}>Pagado el {r.pagado_en}</span> : <span className="tag" style={{ background: "var(--warnb)", color: "var(--warn)" }}>Pendiente</span>}</td>
        <td>{r.comprobante_path && <button className="btn suave chico" onClick={() => ver(r.comprobante_path)}>Ver comprobante</button>}</td></tr>)}</tbody></table> : <Vacio>Todavía no hay repartos confirmados para ti.</Vacio>}</div>
  </>;
}
