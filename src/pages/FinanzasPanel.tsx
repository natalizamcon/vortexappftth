import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Cargando, Kpi, Vacio, bs, hoy, useAlcance, useQuery } from "../lib/ui";
import Crud from "../lib/crud";
import { BarrasAgrupadas, BarrasH, Donut, Leyenda, Linea } from "../lib/graficos";
import { etiquetaMes, mesDesp, mesesRango, num, sumaDe, todas } from "../lib/datos";
import { rangoMes } from "../lib/reparto";

const PALETA = ["var(--lil)", "var(--acc)", "var(--ok)", "#a8741a", "#4cc3e0", "#d6579c", "#e8c81c", "#667"];
const colorMargen = (m: number) => (m >= 30 ? "var(--ok)" : m >= 0 ? "var(--warn)" : "var(--bad)");
const mesLargo = (m: string) => { const t = new Date(m + "-01T12:00:00").toLocaleDateString("es-BO", { month: "long", year: "numeric" }); return t.charAt(0).toUpperCase() + t.slice(1); };
const opcionesMes = () => Array.from({ length: 24 }, (_, i) => mesDesp(hoy().slice(0, 7), -i));
const aDatos = (p: Promise<any[]>) => p.then(data => ({ data, error: null })).catch(e => ({ data: null, error: { message: e.message } }));

/* =============================== RENTABILIDAD =============================== */
export function Rentabilidad() {
  const { zonas, proyectoId, zonaId } = useApp(), al = useAlcance();
  const [desde, setDesde] = useState(mesDesp(hoy().slice(0, 7), -5) + "-01"), [hasta, setHasta] = useState(hoy()), [todo, setTodo] = useState(false);
  const mA = desde.slice(0, 7), mB = hasta.slice(0, 7);
  const res = useQuery(() => aDatos(todas(() => { let q = al(supabase.from("v_resumen_zona_mes").select("*")); if (!todo) q = q.gte("mes", mA + "-01").lte("mes", mB + "-01"); return q.order("mes"); })), [proyectoId, zonaId, mA, mB, todo]);
  const cli = useQuery(() => aDatos(todas(() => al(supabase.from("clientes").select("zona_id, plan_nombre, precio_mensual").neq("estado", "BAJA").order("id")))), [proyectoId, zonaId]);
  const R: any[] = (res.data as any[]) || [], C: any[] = (cli.data as any[]) || [];
  const zv = zonas.filter(z => (!proyectoId || z.proyecto_id === proyectoId) && (!zonaId || z.id === zonaId));
  const meses = todo ? Array.from(new Set(R.map(r => String(r.mes).slice(0, 7)))).sort() : mesesRango(mA, mB);
  const ing = (r: any) => num(r.ingresos_servicio) + num(r.otros_ingresos);

  const filas = [...zv.map(z => ({ id: z.id, nombre: "Zona " + z.nombre.replace(/^zona\s+/i, "") })), { id: "", nombre: "Sin zona" }].map(z => {
    const x = R.filter(r => (r.zona_id || "") === z.id), i = x.reduce((s, r) => s + ing(r), 0), g = sumaDe(x, "gastos_operativos"), u = i - g;
    return { ...z, clientes: C.filter(c => c.zona_id === z.id).length, i, g, u, mg: i ? Math.round((u / i) * 100) : 0 };
  }).filter(f => f.id !== "" || f.i || f.g).sort((a, b) => b.i - a.i);
  const I = filas.reduce((s, f) => s + f.i, 0), G = filas.reduce((s, f) => s + f.g, 0), U = I - G, MG = I ? Math.round((U / I) * 100) : 0, mx = Math.max(1, ...filas.flatMap(f => [f.i, f.g]));
  const planes: Record<string, number> = {}; C.forEach(c => { const k = c.plan_nombre || "Sin plan"; planes[k] = (planes[k] || 0) + num(c.precio_mensual); });
  const partes = Object.entries(planes).sort((a, b) => b[1] - a[1]).map(([nombre, valor], i) => ({ nombre, valor, color: PALETA[(i + 1) % PALETA.length] }));
  const porMes = meses.map(m => { const x = R.filter(r => String(r.mes).slice(0, 7) === m); return { i: x.reduce((s, r) => s + ing(r), 0), g: sumaDe(x, "gastos_operativos") }; });
  const rango = (a: string, b: string) => { setTodo(false); setDesde(a); setHasta(b); };

  return <>
    <div className="card"><div className="fila"><label className="fila">Desde <input type="date" value={desde} onChange={e => { setTodo(false); setDesde(e.target.value); }} /></label><label className="fila">Hasta <input type="date" value={hasta} onChange={e => { setTodo(false); setHasta(e.target.value); }} /></label>
      <button className="btn suave" onClick={() => { const p = mesDesp(hoy().slice(0, 7), -1); rango(p + "-01", new Date(+new Date(hoy().slice(0, 7) + "-01T12:00:00") - 86400000).toISOString().slice(0, 10)); }}>Último mes</button>
      <button className="btn suave" onClick={() => rango(mesDesp(hoy().slice(0, 7), -2) + "-01", hoy())}>3 meses</button><button className="btn suave" onClick={() => setTodo(true)}>Todo</button></div>
      <p className="mute" style={{ margin: "8px 0 0" }}>Mostrando {meses.length} mes(es) completos que tocan el rango elegido. Los ingresos son los del servicio (mensualidades) más otros ingresos; los gastos son los operativos. La inversión (CAPEX) va aparte.</p></div>
    {res.loading || cli.loading ? <Cargando /> : res.error ? <Aviso tipo="mal">{res.error}</Aviso> : <>
      <div className="grid gk" style={{ marginBottom: 14 }}><Kpi t="Ingresos" v={bs(I)} /><Kpi t="Gastos" v={bs(G)} /><Kpi t="Utilidad neta" v={bs(U)} c={colorMargen(MG)} /><div className="card kpi"><span>Margen</span><b style={{ color: colorMargen(MG) }}>{MG}%</b><div className="bar" style={{ marginTop: 6 }}><i style={{ width: Math.max(0, Math.min(100, MG)) + "%", background: colorMargen(MG) }} /></div></div></div>
      <div className="mitades">
        <div className="card"><h2>Ingresos contra gastos por zona</h2>{filas.length ? <>{filas.map(f => <div key={f.id || "sin"} style={{ marginBottom: 12 }}>
          <div className="fila" style={{ justifyContent: "space-between" }}><b>{f.nombre} <small className="mute" style={{ fontWeight: 400 }}>{f.clientes} clientes</small></b><b style={{ color: colorMargen(f.mg) }}>{bs(f.u)} · {f.mg}%</b></div>
          <div className="bar" style={{ marginBottom: 3 }}><i style={{ width: (f.i / mx) * 100 + "%", background: "var(--lil)" }} /></div><div className="bar"><i style={{ width: (f.g / mx) * 100 + "%", background: "var(--acc)" }} /></div></div>)}
          <Leyenda items={[{ nombre: "Ingresos", color: "var(--lil)" }, { nombre: "Gastos", color: "var(--acc)" }]} /></> : <Vacio>Aún no hay datos en este rango.</Vacio>}</div>
        <div className="card"><h2>Ingresos por plan</h2>{partes.length ? <Donut partes={partes} /> : <Vacio>Aún no hay clientes activos.</Vacio>}<p className="mute" style={{ margin: "8px 0 0" }}>Mensualidad de los clientes activos hoy, según su plan.</p></div>
        <div className="card"><h2>Ingresos y gastos por mes</h2><BarrasAgrupadas etiquetas={meses.map(etiquetaMes)} series={[{ nombre: "Ingresos", color: "var(--lil)", datos: porMes.map(x => x.i) }, { nombre: "Gastos", color: "var(--acc)", datos: porMes.map(x => x.g) }]} /><Leyenda items={[{ nombre: "Ingresos", color: "var(--lil)" }, { nombre: "Gastos", color: "var(--acc)" }]} /></div>
        <div className="card"><h2>Margen por zona</h2>{filas.length ? <BarrasH filas={filas.map(f => ({ nombre: f.nombre, valor: Math.max(0, f.mg), color: colorMargen(f.mg), extra: <span style={{ color: colorMargen(f.mg) }}>{f.mg}%</span> }))} /> : <Vacio>Sin datos.</Vacio>}<p className="mute" style={{ margin: "8px 0 0" }}>Verde: 30% o más · amarillo: entre 0% y 30% · rojo: pérdida.</p></div>
      </div></>}
  </>;
}

/* =============================== INGRESOS Y GASTOS =============================== */
function RangoFechas({ desde, hasta, todo, rango, setTodo, nota }: { desde: string; hasta: string; todo: boolean; rango: (a: string, b: string) => void; setTodo: () => void; nota: string }) {
  const m0 = hoy().slice(0, 7), ayer = new Date(+new Date(m0 + "-01T12:00:00") - 86400000).toISOString().slice(0, 10);
  return <div className="card"><div className="fila"><label className="fila">Desde <input type="date" value={desde} onChange={e => rango(e.target.value, hasta)} /></label><label className="fila">Hasta <input type="date" value={hasta} onChange={e => rango(desde, e.target.value)} /></label>
    <button className="btn suave" onClick={() => rango(mesDesp(m0, -1) + "-01", ayer)}>Último mes</button><button className="btn suave" onClick={() => rango(mesDesp(m0, -2) + "-01", hoy())}>3 meses</button>
    <button className="btn suave" onClick={() => rango(mesDesp(m0, -11) + "-01", hoy())}>12 meses</button><button className={"btn " + (todo ? "" : "suave")} onClick={setTodo}>Todo</button></div>
    <p className="mute" style={{ margin: "8px 0 0" }}>{nota}</p></div>;
}

export function IngresosGastos() {
  const { zonas, proyectoId, zonaId } = useApp(), al = useAlcance(), actual = hoy().slice(0, 7);
  const [desde, setDesde] = useState(mesDesp(actual, -11) + "-01"), [hasta, setHasta] = useState(hoy()), [todo, setTodo] = useState(false), [conInv, setConInv] = useState(false);
  const mA = desde.slice(0, 7), mB = hasta.slice(0, 7), rango = (a: string, b: string) => { setTodo(false); setDesde(a); setHasta(b); };
  const hist = useQuery(() => aDatos(todas(() => { let q = al(supabase.from("v_resumen_zona_mes").select("*")); if (!todo) q = q.gte("mes", mA + "-01").lte("mes", mB + "-01"); return q.order("mes"); })), [proyectoId, zonaId, mA, mB, todo]);
  const capex = useQuery(() => aDatos(todas(() => al(supabase.from("v_resumen_zona_mes").select("inversion").order("mes")))), [proyectoId, zonaId]);
  const gcat = useQuery(() => aDatos(todas(() => { let q = al(supabase.from("fin_movimientos").select("categoria, monto").eq("tipo", "GASTO_OPERATIVO")); if (!todo) q = q.gte("fecha", rangoMes(mA)[0]).lte("fecha", rangoMes(mB)[1]); return q.order("fecha"); })), [proyectoId, zonaId, mA, mB, todo]);
  const H: any[] = (hist.data as any[]) || [], ing = (r: any) => num(r.ingresos_servicio) + num(r.otros_ingresos);
  const meses = todo ? Array.from(new Set(H.map(r => String(r.mes).slice(0, 7)))).sort() : mesesRango(mA, mB);
  const delMes = (m: string) => H.filter(r => String(r.mes).slice(0, 7) === m);
  const ingM = meses.map(m => delMes(m).reduce((s, r) => s + ing(r), 0)), gasM = meses.map(m => sumaDe(delMes(m), "gastos_operativos")), invM = meses.map(m => sumaDe(delMes(m), "inversion"));
  const egM = meses.map((_, i) => gasM[i] + (conInv ? invM[i] : 0)), utilM = meses.map((_, i) => ingM[i] - gasM[i]);
  const zv = zonas.filter(z => (!proyectoId || z.proyecto_id === proyectoId) && (!zonaId || z.id === zonaId));
  const seriesZ = zv.map((z, i) => ({ nombre: z.nombre, color: PALETA[i % PALETA.length], datos: meses.map(m => delMes(m).filter(r => r.zona_id === z.id).reduce((s, r) => s + ing(r), 0)) })).filter(s => s.datos.some(v => v > 0));
  const I = ingM.reduce((a, b) => a + b, 0), G = gasM.reduce((a, b) => a + b, 0), U = I - G, CAPEX = sumaDe((capex.data as any[]) || [], "inversion"), promU = meses.length ? U / meses.length : 0;
  const cats: Record<string, number> = {}; ((gcat.data as any[]) || []).forEach(x => { const c = x.categoria || "Sin categoría"; cats[c] = (cats[c] || 0) + num(x.monto); });
  const filasCat = Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([nombre, valor]) => ({ nombre, valor }));

  return <>
    <RangoFechas desde={desde} hasta={hasta} todo={todo} rango={rango} setTodo={() => setTodo(true)} nota={`Mostrando ${meses.length} mes(es) completos que tocan el rango elegido. Los ingresos son las mensualidades más otros ingresos; los gastos son los operativos. La inversión (CAPEX) va aparte.`} />
    {hist.loading ? <Cargando /> : hist.error ? <Aviso tipo="mal">{hist.error}</Aviso> : <>
      <div className="grid gk" style={{ marginBottom: 14 }}><Kpi t="Ingresos del período" v={bs(I)} /><Kpi t="Gastos operativos" v={bs(G)} /><Kpi t="Utilidad del período" v={bs(U)} c={U >= 0 ? "var(--ok)" : "var(--bad)"} /><Kpi t="Inversión (CAPEX)" v={bs(CAPEX)} s="Acumulada" /><Kpi t="Meses para recuperar" v={promU > 0 && CAPEX > 0 ? Math.ceil(CAPEX / promU) : "—"} s={promU > 0 ? "Inversión ÷ utilidad mensual promedio" : "Sin utilidad en el período"} /></div>
      <div className="mitades">
        <div className="card"><h2>Ingresos y egresos por mes</h2><BarrasAgrupadas etiquetas={meses.map(etiquetaMes)} series={[{ nombre: "Ingresos", color: "var(--lil)", datos: ingM }, { nombre: "Egresos", color: "var(--acc)", datos: egM }]} /><Leyenda items={[{ nombre: "Ingresos", color: "var(--lil)" }, { nombre: conInv ? "Egresos (con inversión)" : "Egresos (gastos operativos)", color: "var(--acc)" }]} />
          <label className="fila" style={{ marginTop: 8 }}><input type="checkbox" checked={conInv} onChange={e => setConInv(e.target.checked)} /> Incluir la inversión (CAPEX) en los egresos</label>
          <p className="mute" style={{ margin: "6px 0 0" }}>Total del período: ingresos <b>{bs(I)}</b> · egresos <b>{bs(egM.reduce((a, b) => a + b, 0))}</b> · utilidad <b>{bs(I - egM.reduce((a, b) => a + b, 0))}</b></p></div>
        <div className="card"><h2>Ingresos por zona, mes a mes</h2>{seriesZ.length ? <><BarrasAgrupadas etiquetas={meses.map(etiquetaMes)} series={seriesZ} totales={ingM} /><Leyenda items={seriesZ.map(s => ({ nombre: s.nombre, color: s.color }))} /><p className="mute" style={{ margin: "6px 0 0" }}>El número sobre cada mes es el total generado por todas las zonas.</p></> : <Vacio>Aún no hay ingresos para mostrar.</Vacio>}</div>
        <div className="card"><h2>Gastos operativos por categoría</h2>{gcat.loading ? <Cargando /> : filasCat.length ? <BarrasH filas={filasCat} /> : <Vacio>No hay gastos operativos registrados en este período.</Vacio>}</div>
        <div className="card"><h2>Utilidad por mes</h2><Linea etiquetas={meses.map(etiquetaMes)} series={[{ nombre: "Utilidad", color: "var(--ok)", datos: utilM }]} /><p className="mute" style={{ margin: "6px 0 0" }}>Ingresos menos gastos operativos de cada mes. Si baja de la línea negra, ese mes hubo pérdida.</p></div>
      </div></>}
    <div style={{ marginTop: 14 }}><Crud titulo="Ingresos, gastos operativos e inversiones (si eliges una zona arriba, el registro queda en esa zona)" tabla="fin_movimientos" orden="fecha" conZona="opcional" select="*, zonas(nombre)" extra={f => <span className="mute">{f.zonas?.nombre || "Todo el proyecto"}</span>} campos={[{ k: "fecha", l: "Fecha", t: "date" }, { k: "tipo", l: "Tipo", t: "select", opts: ["INGRESO", "GASTO_OPERATIVO", "INVERSION"], req: true }, { k: "categoria", l: "Categoría (Starlink, materiales…)" }, { k: "monto", l: "Monto (Bs)", t: "number", req: true }, { k: "descripcion", l: "Descripción" }, { k: "comprobante_path", l: "Comprobante", t: "archivo" }]} columnas={["fecha", "tipo", "categoria", "monto", "descripcion"]} /></div>
  </>;
}
