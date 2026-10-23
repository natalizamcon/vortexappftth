import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Kpi, Vacio, bs, hoy, sumar, useProyecto, useQuery } from "../lib/ui";
import Crud from "../lib/crud";
import { aPapelera } from "../lib/papelera";

const n = (x: any) => Number(x) || 0;
const DIAS_POR_UNIDAD: Record<string, number> = { dias: 1, semanas: 6, meses: 26 }; // días de trabajo
const norm = (s: any) => String(s || "").trim().toLowerCase();

type Fila = { id: number; categoria: string; concepto: string; cant: any; unit: any; porCliente: boolean };
type Gasto = { id: number; concepto: string; monto: any };
type Sim = {
  nombre: string; clientes: any; precio: any; altasMes: any; morosidad: any;
  filas: Fila[]; instaladores: any; pagoDia: any; duracion: any; unidad: string; gastos: Gasto[];
};

// Valores de ejemplo: cámbialos por tus costos reales.
const simInicial = (): Sim => ({
  nombre: "", clientes: 100, precio: 150, altasMes: 10, morosidad: 5,
  filas: [
    { id: 1, categoria: "Fibra", concepto: "Fibra troncal (metros)", cant: 3000, unit: 3, porCliente: false },
    { id: 2, categoria: "Fibra", concepto: "Fibra drop (metros por cliente)", cant: 80, unit: 1.2, porCliente: true },
    { id: 3, categoria: "OLT y PON", concepto: "OLT", cant: 1, unit: 9000, porCliente: false },
    { id: 4, categoria: "OLT y PON", concepto: "Módulos PON", cant: 2, unit: 1500, porCliente: false },
    { id: 5, categoria: "Router de borde", concepto: "Mikrotik", cant: 1, unit: 2500, porCliente: false },
    { id: 6, categoria: "Internet", concepto: "Equipo Starlink", cant: 1, unit: 3500, porCliente: false },
    { id: 7, categoria: "Red de distribución", concepto: "Splitters y NAP", cant: 10, unit: 250, porCliente: false },
    { id: 8, categoria: "Equipos de cliente", concepto: "ONU / router por cliente", cant: 1, unit: 250, porCliente: true },
    { id: 9, categoria: "Ferretería", concepto: "Postes y ferretería", cant: 1, unit: 3000, porCliente: false },
  ],
  instaladores: 2, pagoDia: 150, duracion: 2, unidad: "semanas",
  gastos: [
    { id: 1, concepto: "Internet mayorista / Starlink mensual", monto: 500 },
    { id: 2, concepto: "Energía", monto: 300 },
    { id: 3, concepto: "Soporte y mantenimiento", monto: 800 },
  ],
});

/** Todo el cálculo del simulador. Devuelve inversión, gastos, ingresos y la curva de caja mes a mes. */
function calcular(s: Sim) {
  const N = n(s.clientes);
  const lineas = s.filas.map(f => { const qty = n(f.cant) * (f.porCliente ? N : 1); return { ...f, qty, total: qty * n(f.unit) }; });
  const dias = n(s.duracion) * (DIAS_POR_UNIDAD[s.unidad] || 1);
  const mano = n(s.instaladores) * n(s.pagoDia) * dias;
  const infra = lineas.reduce((a, l) => a + l.total, 0);
  const inversion = infra + mano;
  const gastoMes = sumar(s.gastos, "monto");
  const factor = 1 - Math.min(100, Math.max(0, n(s.morosidad))) / 100;
  const ingresoRegimen = N * n(s.precio) * factor;
  const altas = n(s.altasMes);
  const curva: number[] = []; let acum = -inversion, recup: number | null = null;
  for (let m = 1; m <= 60; m++) {
    const c = altas > 0 ? Math.min(N, altas * m) : N;
    acum += c * n(s.precio) * factor - gastoMes;
    curva.push(acum);
    if (recup === null && acum >= 0) recup = m;
  }
  const porCategoria: Record<string, number> = {};
  lineas.forEach(l => { const k = l.categoria.trim() || "Sin categoría"; porCategoria[k] = (porCategoria[k] || 0) + l.total; });
  if (mano > 0) porCategoria["Mano de obra"] = (porCategoria["Mano de obra"] || 0) + mano;
  return { N, lineas, dias, mano, infra, inversion, gastoMes, ingresoRegimen, utilidad: ingresoRegimen - gastoMes, curva, recup, porCategoria, mesesLlegar: altas > 0 ? Math.ceil(N / altas) : 1 };
}

function Curva({ pts }: { pts: number[] }) {
  const P = pts.slice(0, 36), mx = Math.max(0, ...P), mn = Math.min(0, ...P), W = 720, H = 230, pad = 28, rng = mx - mn || 1;
  const y = (v: number) => pad + ((mx - v) / rng) * (H - 2 * pad), bw = (W - 2 * pad) / P.length;
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Dinero acumulado mes a mes">
    <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="var(--line)" />
    {P.map((v, i) => <rect key={i} x={pad + i * bw + 1} width={Math.max(1, bw - 2)} y={Math.min(y(v), y(0))} height={Math.abs(y(v) - y(0))} fill={v >= 0 ? "var(--ok)" : "var(--bad)"} opacity={0.85}><title>{"Mes " + (i + 1) + ": " + bs(v)}</title></rect>)}
    <text x={pad} y={12} fontSize="11" fill="var(--mute)">{bs(mx)}</text>
    <text x={pad} y={H - 4} fontSize="11" fill="var(--mute)">{bs(mn)}</text>
    <text x={W - pad} y={H - 4} fontSize="11" fill="var(--mute)" textAnchor="end">Mes {P.length}</text>
  </svg>;
}

const Num = ({ v, set, paso, ancho }: { v: any; set: (x: string) => void; paso?: number; ancho?: number }) =>
  <input type="number" min={0} step={paso || 1} value={v} style={ancho ? { width: ancho } : undefined} onChange={e => set(e.target.value)} />;

/* ================================ PRESUPUESTO ================================ */
/* ================================ PRESUPUESTO CONTRA GASTO REAL (barras) ================================ */
const nada2 = Promise.resolve({ data: [], error: null });
export function PresupuestoBarras({ zona }: { zona: any }) {
  const lineas = useQuery(() => supabase.from("presupuesto_lineas").select("categoria, cantidad, monto_unitario, origen, creado_en").eq("zona_id", zona.id).eq("tipo", "INVERSION"), [zona.id]);
  const viajes = useQuery(() => supabase.from("viajes").select("id, fecha_inicio, fecha_fin, personas, gasolina, movilidad, pago_dia, viaticos_dia").eq("zona_id", zona.id).eq("estado", "FINALIZADO"), [zona.id]);
  const dias = useQuery(() => ((viajes.data as any[]) || []).length ? supabase.from("viaje_dias").select("viaje_id, gasto").in("viaje_id", ((viajes.data as any[]) || []).map(v => v.id)) : nada2, [viajes.data]);
  const cv = useQuery(() => supabase.from("costos_variables").select("real_total").eq("zona_id", zona.id), [zona.id]);
  const inv = useQuery(() => supabase.from("fin_movimientos").select("monto").eq("zona_id", zona.id).eq("tipo", "INVERSION"), [zona.id]);
  const cli = useQuery(() => supabase.from("clientes").select("id", { count: "exact", head: true }).eq("zona_id", zona.id).neq("estado", "BAJA").then((r: any) => ({ data: r.count ?? 0, error: r.error })), [zona.id]);
  if ([lineas, viajes, dias, cv, inv, cli].some(q => q.loading)) return <Cargando />;
  const L: any[] = (lineas.data as any[]) || [], total = (x: any) => n(x.cantidad) * n(x.monto_unitario);
  const dd = (a: string, b: string) => Math.round((+new Date(b + "T12:00:00") - +new Date(a + "T12:00:00")) / 86400000) + 1;
  const costoViaje = (v: any) => n(v.gasolina) + n(v.movilidad) + dd(v.fecha_inicio, v.fecha_fin) * n(v.personas) * (n(v.pago_dia) + n(v.viaticos_dia)) + ((dias.data as any[]) || []).filter(x => x.viaje_id === v.id).reduce((s, x) => s + n(x.gasto), 0);
  const pViajes = L.filter(x => x.categoria === "Viajes de instalación").reduce((s, x) => s + total(x), 0), pMat = L.filter(x => x.categoria !== "Viajes de instalación").reduce((s, x) => s + total(x), 0);
  const rViajes = ((viajes.data as any[]) || []).reduce((s, v) => s + costoViaje(v), 0), rMat = ((cv.data as any[]) || []).reduce((s, x) => s + n(x.real_total), 0) + ((inv.data as any[]) || []).reduce((s, x) => s + n(x.monto), 0);
  const filas = [["Viajes", pViajes, rViajes], ["Materiales y red", pMat, rMat]] as [string, number, number][], tp = pViajes + pMat, tr = rViajes + rMat;
  const guia = L.filter(x => x.origen === "Guía del simulador").map(x => String(x.creado_en).slice(0, 10)).sort().pop();
  const meses = zona.fecha_inicio ? Math.max(0, (+new Date(hoy() + "T12:00:00") - +new Date(String(zona.fecha_inicio) + "T12:00:00")) / 86400000 / 30.44) : 0, clientes = Number(cli.data) || 0;
  const meta = n(zona.meta_clientes), plazo = n(zona.meta_meses), lograda = meta > 0 && clientes >= meta;
  const Barra = (real: number, pres: number) => <div className="bar" style={{ minWidth: 160 }}><i style={{ width: Math.min(100, pres ? (real / pres) * 100 : 0) + "%", background: pres && real > pres ? "var(--bad)" : "var(--lil)" }} /></div>;
  const Dif = (real: number, pres: number) => <span style={{ color: real - pres <= 0 ? "var(--ok)" : "var(--bad)" }}>{bs(real - pres)}</span>;
  return <div className="card tw"><h2>Presupuesto contra gasto real · {zona.nombre}</h2>
    {L.length ? <table><thead><tr><th>Concepto</th><th>Presupuesto</th><th>Gasto real</th><th>Diferencia</th><th>Avance del gasto</th></tr></thead>
      <tbody>{filas.map(([c, p, r]) => <tr key={c}><td>{c}</td><td>{bs(p)}</td><td>{bs(r)}</td><td>{Dif(r, p)}</td><td>{Barra(r, p)}</td></tr>)}</tbody>
      <tfoot><tr><td><b>Total</b></td><td><b>{bs(tp)}</b></td><td><b>{bs(tr)}</b></td><td><b>{Dif(tr, tp)}</b></td><td>{Barra(tr, tp)}</td></tr></tfoot></table>
      : <Vacio>Esta zona todavía no tiene presupuesto de inversión. Cárgalo desde el Simulador de proyecto ("Guardar simulación como guía") o agrega líneas abajo.</Vacio>}
    <p className="mute" style={{ margin: "8px 0 0" }}>{guia ? `Presupuesto de la guía guardada en el simulador (${guia}).` : L.length ? "Presupuesto cargado a mano." : ""} Gasto real: viajes finalizados, más lo registrado en Red → Costos variables y las inversiones de la zona en Ingresos y gastos. Diferencia en verde = dentro del presupuesto.</p>
    {(meta > 0 || plazo > 0) && <p style={{ margin: "8px 0 0" }}>{lograda ? <><b>Meta alcanzada:</b> {clientes} de {meta} clientes en {meses.toFixed(1)} meses{plazo ? (meses <= plazo ? " (dentro del plazo)" : " (fuera del plazo)") : ""}{tp ? (tr <= tp ? " y dentro del presupuesto." : " y por encima del presupuesto.") : "."}</>
      : <>En curso: lleva <b>{meses.toFixed(1)}</b>{plazo ? ` de ${plazo}` : ""} meses y <b>{clientes}</b>{meta ? ` de ${meta}` : ""} clientes. Al llegar a la meta se muestra si se cumplió el plazo y el presupuesto.</>}</p>}
  </div>;
}

export function Presupuesto() {
  const { zonaId, zonas } = useApp(), zona = zonas.find(z => z.id === zonaId);
  if (!zona) return <Aviso>Elige una <b>zona</b> arriba para ver o armar su presupuesto.</Aviso>;
  return <>
    <PresupuestoBarras zona={zona} />
    <Aviso>Presupuesto de <b>{zona.nombre}</b>. Puedes cargarlo desde el Simulador o agregar líneas a mano. Los gastos <b>mensuales</b> se multiplican por los meses transcurridos desde que empezó la zona.</Aviso>
    <Crud titulo="Líneas del presupuesto" tabla="presupuesto_lineas" conZona orden="creado_en"
      campos={[
        { k: "tipo", l: "Tipo", t: "select", opts: ["INVERSION", "GASTO_OPERATIVO"], req: true },
        { k: "categoria", l: "Categoría (igual que en Ingresos y gastos)", req: true },
        { k: "concepto", l: "Concepto", req: true },
        { k: "cantidad", l: "Cantidad", t: "number", def: 1, req: true },
        { k: "monto_unitario", l: "Monto unitario (Bs)", t: "number", req: true },
        { k: "periodo", l: "Se paga", t: "select", opts: ["unico", "mensual"], def: "unico", req: true },
      ]}
      columnas={["tipo", "categoria", "concepto", "cantidad", "monto_unitario", "periodo", "origen"]}
      extra={f => <b>{bs(n(f.cantidad) * n(f.monto_unitario))}</b>}
      tfoot={f => <div className="fila">
        <span className="tag">Inversión: {bs(f.filter(x => x.tipo === "INVERSION").reduce((a, x) => a + n(x.cantidad) * n(x.monto_unitario), 0))}</span>
        <span className="tag">Gasto operativo por mes: {bs(f.filter(x => x.tipo === "GASTO_OPERATIVO" && x.periodo === "mensual").reduce((a, x) => a + n(x.cantidad) * n(x.monto_unitario), 0))}</span>
      </div>} />
  </>;
}

/* ================================ PRESUPUESTO CONTRA REAL ================================ */
export function PresupuestoVsReal() {
  const { zonaId, zonas } = useApp(), zona = zonas.find(z => z.id === zonaId);
  const pre = useQuery(() => zonaId ? supabase.from("presupuesto_lineas").select("*").eq("zona_id", zonaId) : Promise.resolve({ data: [], error: null }), [zonaId]);
  const real = useQuery(() => zonaId ? supabase.from("fin_movimientos").select("tipo, categoria, monto").eq("zona_id", zonaId).in("tipo", ["INVERSION", "GASTO_OPERATIVO"]).limit(5000) : Promise.resolve({ data: [], error: null }), [zonaId]);
  if (!zona) return <Aviso>Elige una <b>zona</b> arriba para comparar su presupuesto con lo que realmente se gastó.</Aviso>;
  if (pre.loading || real.loading) return <Cargando />;
  if (pre.error || real.error) return <Aviso tipo="mal">{pre.error || real.error}</Aviso>;
  const ini = String(zona.fecha_inicio || hoy()), hoyD = hoy();
  const meses = Math.max(1, (+hoyD.slice(0, 4) - +ini.slice(0, 4)) * 12 + (+hoyD.slice(5, 7) - +ini.slice(5, 7)) + 1);
  const P: any[] = (pre.data as any[]) || [], R: any[] = (real.data as any[]) || [];

  const bloque = (tipo: string, titulo: string) => {
    const filas: Record<string, { nombre: string; presu: number; real: number }> = {};
    const f = (c: any) => { const k = norm(c) || "sin categoría"; return filas[k] || (filas[k] = { nombre: String(c || "").trim() || "Sin categoría", presu: 0, real: 0 }); };
    P.filter(x => x.tipo === tipo).forEach(x => { f(x.categoria).presu += n(x.cantidad) * n(x.monto_unitario) * (x.periodo === "mensual" ? meses : 1); });
    R.filter(x => x.tipo === tipo).forEach(x => { f(x.categoria).real += n(x.monto); });
    const L = Object.values(filas).sort((a, b) => b.presu - a.presu), tp = L.reduce((a, x) => a + x.presu, 0), tr = L.reduce((a, x) => a + x.real, 0);
    const color = (p: number, r: number) => r > p ? "var(--bad)" : "var(--ok)";
    return <div className="card tw"><h2>{titulo}</h2>{L.length ? <table><thead><tr><th>Categoría</th><th>Presupuestado</th><th>Real</th><th>Diferencia</th><th>Usado</th></tr></thead>
      <tbody>{L.map(x => <tr key={x.nombre}><td>{x.nombre}{x.presu === 0 && <span className="tag" style={{ marginLeft: 6 }}>sin presupuestar</span>}</td><td>{bs(x.presu)}</td><td>{bs(x.real)}</td>
        <td style={{ color: color(x.presu, x.real) }}><b>{bs(x.presu - x.real)}</b></td><td>{x.presu ? Math.round((x.real / x.presu) * 100) + "%" : "—"}</td></tr>)}</tbody>
      <tfoot><tr><td><b>Total</b></td><td><b>{bs(tp)}</b></td><td><b>{bs(tr)}</b></td><td style={{ color: color(tp, tr) }}><b>{bs(tp - tr)}</b></td><td>{tp ? Math.round((tr / tp) * 100) + "%" : "—"}</td></tr></tfoot></table> : <Vacio>Sin datos.</Vacio>}</div>;
  };

  return <>
    <Aviso>Compara lo que <b>presupuestaste</b> con lo que <b>realmente registraste</b> en Ingresos y gastos, solo para <b>{zona.nombre}</b> ({meses} {meses === 1 ? "mes" : "meses"} desde que empezó). Verde = dentro del presupuesto, rojo = te pasaste. Para que una categoría coincida, escríbela igual en ambos lados; si no, aparece como "sin presupuestar". Los gastos registrados sin zona no se cuentan aquí.</Aviso>
    {!P.length && <Aviso tipo="mal">Esta zona todavía no tiene presupuesto. Cárgalo desde el Simulador o en la pestaña "Presupuesto".</Aviso>}
    {bloque("INVERSION", "Inversión (CAPEX)")}
    {bloque("GASTO_OPERATIVO", "Gastos operativos")}
  </>;
}
