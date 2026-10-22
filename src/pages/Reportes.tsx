import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Cargando, Vacio, bs, hoy, nombreMes, useAlcance } from "../lib/ui";

const n = (x: any) => Number(x) || 0;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const fechaLarga = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("es-BO", { day: "numeric", month: "long", year: "numeric" });
const primeroDelMes = (d: string) => d.slice(0, 7) + "-01";
const sumaMeses = (d: string, k: number) => { const x = new Date(d + "T12:00:00"); x.setMonth(x.getMonth() + k); return x.toISOString().slice(0, 10); };
const mesesDe = (desde: string, hasta: string) => { const out: string[] = []; for (let m = desde.slice(0, 7); m <= hasta.slice(0, 7) && out.length < 120; m = sumaMeses(m + "-01", 1).slice(0, 7)) out.push(m); return out; };

type Col = { t: string; f?: "bs" | "pct" | "n" };
type Res = { cols: Col[]; filas: any[][]; total?: any[]; nota?: string };
type Ctx = { al: (q: any, z?: boolean) => any; zv: any[]; nz: (id: string) => string; desde: string; hasta: string };
type Rep = { id: string; nombre: string; desc: string; fechas: boolean; run: (c: Ctx) => Promise<Res> };

/** Trae todas las filas, de 1.000 en 1.000 (sin el tope habitual de 1.000). */
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
const suma = (a: any[], k: string) => a.reduce((s, x) => s + n(x[k]), 0);

const REPORTES: Rep[] = [
  { id: "morosidad", nombre: "Morosidad por zona", desc: "Cuántos clientes están vencidos o suspendidos en cada zona y cuánto deben.", fechas: false,
    run: async c => {
      const R = await todas(() => c.al(supabase.from("v_cobranza_resumen").select("zona_id, estado_cuenta, clientes, deuda")));
      const filas = c.zv.map(z => { const x = R.filter(r => r.zona_id === z.id), act = suma(x.filter(r => r.estado_cuenta !== "BAJA"), "clientes"), mor = suma(x.filter(r => r.estado_cuenta === "VENCIDO" || r.estado_cuenta === "SUSPENDIDO"), "clientes"); return [z.nombre, act, mor, pct(mor, act), suma(x.filter(r => r.estado_cuenta === "VENCIDO" || r.estado_cuenta === "SUSPENDIDO"), "deuda")]; });
      const a = filas.reduce((s, f) => s + f[1], 0), m = filas.reduce((s, f) => s + f[2], 0);
      return { cols: [{ t: "Zona" }, { t: "Clientes activos", f: "n" }, { t: "Vencidos o suspendidos", f: "n" }, { t: "Morosidad", f: "pct" }, { t: "Deuda", f: "bs" }], filas, total: ["Total", a, m, pct(m, a), filas.reduce((s, f) => s + f[4], 0)] };
    } },
  { id: "deudores", nombre: "Clientes con deuda", desc: "Lista de clientes que deben, de mayor a menor deuda, con su teléfono.", fechas: false,
    run: async c => {
      const R = await todas(() => c.al(supabase.from("v_cobranza").select("codigo, nombre, telefono, zona_id, meses_deuda, deuda, ultimo_pago, estado_cuenta").gt("deuda", 0).order("deuda", { ascending: false })));
      return { cols: [{ t: "Código" }, { t: "Cliente" }, { t: "Teléfono" }, { t: "Zona" }, { t: "Meses de deuda", f: "n" }, { t: "Deuda", f: "bs" }, { t: "Último pago" }, { t: "Estado" }],
        filas: R.map(r => [r.codigo, r.nombre, r.telefono || "", c.nz(r.zona_id), n(r.meses_deuda), n(r.deuda), r.ultimo_pago || "—", r.estado_cuenta]), total: ["Total", `${R.length} clientes`, "", "", "", suma(R, "deuda"), "", ""] };
    } },
  { id: "cobranza", nombre: "Cobranza del período", desc: "Dinero cobrado en las fechas elegidas, según el medio de pago. No incluye pagos anulados.", fechas: true,
    run: async c => {
      const R = await todas(() => c.al(supabase.from("v_pagos").select("fecha, monto, medio").eq("anulado", false).gte("fecha", c.desde).lte("fecha", c.hasta)));
      const g: Record<string, { k: number; m: number }> = {}; R.forEach(r => { const k = r.medio || "Sin dato"; (g[k] = g[k] || { k: 0, m: 0 }).k++; g[k].m += n(r.monto); });
      const tot = suma(R, "monto");
      return { cols: [{ t: "Medio de pago" }, { t: "Pagos", f: "n" }, { t: "Monto", f: "bs" }, { t: "% del total", f: "pct" }], filas: Object.entries(g).sort((a, b) => b[1].m - a[1].m).map(([k, v]) => [k, v.k, v.m, pct(v.m, tot)]), total: ["Total", R.length, tot, tot ? 100 : 0] };
    } },
  { id: "planes", nombre: "Clientes e ingresos por plan", desc: "Cuántos clientes activos tiene cada plan y cuánto ingreso mensual representa.", fechas: false,
    run: async c => {
      const R = await todas(() => c.al(supabase.from("clientes").select("plan_nombre, precio_mensual").neq("estado", "BAJA")));
      const g: Record<string, { k: number; m: number }> = {}; R.forEach(r => { const k = r.plan_nombre || "Sin plan"; (g[k] = g[k] || { k: 0, m: 0 }).k++; g[k].m += n(r.precio_mensual); });
      const tot = suma(R, "precio_mensual");
      return { cols: [{ t: "Plan" }, { t: "Clientes", f: "n" }, { t: "Ingreso mensual", f: "bs" }, { t: "Promedio por cliente", f: "bs" }], filas: Object.entries(g).sort((a, b) => b[1].m - a[1].m).map(([k, v]) => [k, v.k, v.m, v.k ? v.m / v.k : 0]), total: ["Total", R.length, tot, R.length ? tot / R.length : 0] };
    } },
  { id: "altasbajas", nombre: "Altas y bajas por mes", desc: "Clientes nuevos y clientes dados de baja en cada mes del período.", fechas: true,
    run: async c => {
      const [A, B] = await Promise.all([
        todas(() => c.al(supabase.from("clientes").select("fecha_instalacion").gte("fecha_instalacion", c.desde).lte("fecha_instalacion", c.hasta))),
        todas(() => c.al(supabase.from("clientes").select("fecha_baja").gte("fecha_baja", c.desde).lte("fecha_baja", c.hasta))),
      ]);
      const filas = mesesDe(c.desde, c.hasta).map(m => { const a = A.filter(x => String(x.fecha_instalacion).startsWith(m)).length, b = B.filter(x => String(x.fecha_baja).startsWith(m)).length; return [nombreMes(m + "-01"), a, b, a - b]; });
      return { cols: [{ t: "Mes" }, { t: "Altas", f: "n" }, { t: "Bajas", f: "n" }, { t: "Saldo", f: "n" }], filas, total: ["Total", A.length, B.length, A.length - B.length] };
    } },
  { id: "naps", nombre: "Utilización de NAP", desc: "Puertos ocupados, reservados, dañados y libres de cada NAP.", fechas: false,
    run: async c => {
      const R = await todas(() => c.al(supabase.from("v_naps_ocupacion").select("*").order("codigo")));
      const t = (k: string) => suma(R, k);
      return { cols: [{ t: "NAP" }, { t: "Zona" }, { t: "Tipo" }, { t: "Puertos", f: "n" }, { t: "Ocupados", f: "n" }, { t: "Reservados", f: "n" }, { t: "Dañados", f: "n" }, { t: "Libres", f: "n" }, { t: "Utilización", f: "pct" }],
        filas: R.map(r => [r.codigo, c.nz(r.zona_id), r.tipo, n(r.total), n(r.ocupados), n(r.reservados), n(r.danados), n(r.libres), pct(n(r.ocupados), n(r.total))]),
        total: ["Total", "", "", t("total"), t("ocupados"), t("reservados"), t("danados"), t("libres"), pct(t("ocupados"), t("total"))] };
    } },
  { id: "instalaciones", nombre: "Instalaciones realizadas", desc: "Instalaciones del período con su costo de materiales y mano de obra.", fechas: true,
    run: async c => {
      const R = await todas(() => c.al(supabase.from("v_instalaciones").select("fecha, tecnico, costo_materiales, mano_obra, cliente_codigo, cliente_nombre, zona_id").gte("fecha", c.desde).lte("fecha", c.hasta).order("fecha")));
      return { cols: [{ t: "Fecha" }, { t: "Cliente" }, { t: "Zona" }, { t: "Técnico" }, { t: "Materiales", f: "bs" }, { t: "Mano de obra", f: "bs" }, { t: "Total", f: "bs" }],
        filas: R.map(r => [r.fecha, `${r.cliente_codigo || ""} ${r.cliente_nombre || ""}`.trim(), c.nz(r.zona_id), r.tecnico || "", n(r.costo_materiales), n(r.mano_obra), n(r.costo_materiales) + n(r.mano_obra)]),
        total: [`${R.length} ${R.length === 1 ? "instalación" : "instalaciones"}`, "", "", "", suma(R, "costo_materiales"), suma(R, "mano_obra"), suma(R, "costo_materiales") + suma(R, "mano_obra")] };
    } },
  { id: "mantenimientos", nombre: "Mantenimientos y su costo", desc: "Mantenimientos programados en el período, su estado y cuánto costaron.", fechas: true,
    run: async c => {
      const R = await todas(() => c.al(supabase.from("mantenimientos").select("fecha_programada, objeto, referencia, estado, tecnico, costo, zona_id").gte("fecha_programada", c.desde).lte("fecha_programada", c.hasta).order("fecha_programada")));
      return { cols: [{ t: "Fecha" }, { t: "Zona" }, { t: "Qué" }, { t: "Estado" }, { t: "Técnico" }, { t: "Costo", f: "bs" }],
        filas: R.map(r => [r.fecha_programada, c.nz(r.zona_id), `${r.objeto}${r.referencia ? " " + r.referencia : ""}`, r.estado, r.tecnico || "", n(r.costo)]), total: [`${R.length} ${R.length === 1 ? "mantenimiento" : "mantenimientos"}`, "", "", "", "", suma(R, "costo")] };
    } },
  { id: "materiales", nombre: "Materiales bajo el mínimo", desc: "Materiales que tienen menos del mínimo y cuánto costaría reponerlos.", fechas: false,
    run: async c => {
      const [M, S] = await Promise.all([todas(() => c.al(supabase.from("materiales").select("id, nombre, unidad, minimo, costo").gt("minimo", 0).order("nombre"), false)), todas(() => c.al(supabase.from("stock").select("material_id, cantidad"), false))]);
      const t: Record<string, number> = {}; S.forEach(s => { t[s.material_id] = (t[s.material_id] || 0) + n(s.cantidad); });
      const B = M.map(m => ({ ...m, hay: t[m.id] || 0 })).filter(m => m.hay < n(m.minimo)).map(m => ({ ...m, faltan: n(m.minimo) - m.hay }));
      return { cols: [{ t: "Material" }, { t: "Unidad" }, { t: "Hay", f: "n" }, { t: "Mínimo", f: "n" }, { t: "Faltan", f: "n" }, { t: "Costo de reponer", f: "bs" }],
        filas: B.map(m => [m.nombre, m.unidad, m.hay, n(m.minimo), m.faltan, m.faltan * n(m.costo)]), total: ["Total", "", "", "", "", B.reduce((s, m) => s + m.faltan * n(m.costo), 0)], nota: "El stock se cuenta sumando todos los almacenes del proyecto." };
    } },
  { id: "finanzas", nombre: "Ingresos y gastos por categoría", desc: "Lo registrado en Finanzas en el período, agrupado por tipo y categoría.", fechas: true,
    run: async c => {
      const R = await todas(() => c.al(supabase.from("fin_movimientos").select("tipo, categoria, monto").gte("fecha", c.desde).lte("fecha", c.hasta)));
      const g: Record<string, { tipo: string; cat: string; k: number; m: number }> = {}; R.forEach(r => { const k = r.tipo + "|" + (r.categoria || "Sin categoría"); (g[k] = g[k] || { tipo: r.tipo, cat: r.categoria || "Sin categoría", k: 0, m: 0 }).k++; g[k].m += n(r.monto); });
      const T: Record<string, string> = { INGRESO: "Ingreso", GASTO_OPERATIVO: "Gasto operativo", INVERSION: "Inversión" }, orden = ["INGRESO", "GASTO_OPERATIVO", "INVERSION"];
      const ing = suma(R.filter(r => r.tipo === "INGRESO"), "monto"), gas = suma(R.filter(r => r.tipo === "GASTO_OPERATIVO"), "monto"), inv = suma(R.filter(r => r.tipo === "INVERSION"), "monto");
      return { cols: [{ t: "Tipo" }, { t: "Categoría" }, { t: "Movimientos", f: "n" }, { t: "Monto", f: "bs" }],
        filas: Object.values(g).sort((a, b) => orden.indexOf(a.tipo) - orden.indexOf(b.tipo) || b.m - a.m).map(x => [T[x.tipo] || x.tipo, x.cat, x.k, x.m]), total: ["Total", "", R.length, ing + gas + inv],
        nota: `Ingresos ${bs(ing)} · Gastos operativos ${bs(gas)} · Inversión ${bs(inv)} · Resultado operativo (ingresos − gastos operativos): ${bs(ing - gas)}.` };
    } },
  { id: "equipos", nombre: "Equipos por estado", desc: "Cuántos equipos con número de serie hay en almacén, instalados, en mantenimiento o descartados.", fechas: false,
    run: async c => {
      const R = await todas(() => c.al(supabase.from("equipos_serie").select("estado"), false)), g: Record<string, number> = {}; R.forEach(r => { g[r.estado] = (g[r.estado] || 0) + 1; });
      return { cols: [{ t: "Estado" }, { t: "Equipos", f: "n" }], filas: ["ALMACEN", "INSTALADO", "MANTENIMIENTO", "PENDIENTE", "DESCARTE"].map(e => [e, g[e] || 0]), total: ["Total", R.length], nota: "Este reporte cuenta los equipos de todo el proyecto, sin separar por zona." };
    } },
];

const fmt = (v: any, f?: Col["f"]) => v === null || v === undefined || v === "" ? "" : f === "bs" ? bs(v) : f === "pct" ? v + "%" : f === "n" ? Number(v).toLocaleString("es-BO") : String(v);
const celdaCsv = (v: any) => typeof v === "number" ? String(Math.round(v * 100) / 100).replace(".", ",") : `"${String(v ?? "").replace(/"/g, '""')}"`;

export default function Reportes() {
  const { zonas, proyectoId, zonaId } = useApp(), al = useAlcance();
  const [id, setId] = useState("morosidad"), [desde, setDesde] = useState(primeroDelMes(hoy())), [hasta, setHasta] = useState(hoy());
  const [res, setRes] = useState<Res | null>(null), [cargando, setCargando] = useState(true), [error, setError] = useState("");
  const R = REPORTES.find(r => r.id === id)!;
  const zv = zonas.filter(z => (!proyectoId || z.proyecto_id === proyectoId) && (!zonaId || z.id === zonaId));
  const nz = (zid: string) => zonas.find(z => z.id === zid)?.nombre || "";

  useEffect(() => {
    let cancelado = false; setCargando(true); setError("");
    R.run({ al, zv, nz, desde, hasta }).then(r => { if (!cancelado) setRes(r); }).catch(e => { if (!cancelado) { setRes(null); setError(e.message); } }).finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [id, desde, hasta, proyectoId, zonaId, zonas]);

  const rango = (a: string, b: string) => { setDesde(a); setHasta(b); };
  const mesPasado = () => rango(sumaMeses(primeroDelMes(hoy()), -1), new Date(+new Date(primeroDelMes(hoy()) + "T12:00:00") - 86400000).toISOString().slice(0, 10));
  const subtitulo = `${zonaId ? "Zona: " + nz(zonaId) : proyectoId ? "Todas las zonas del espacio" : "Todas las zonas"}${R.fechas ? " · del " + fechaLarga(desde) + " al " + fechaLarga(hasta) : ""}`;
  const exportar = () => {
    if (!res) return;
    const filas = [res.cols.map(c => c.t), ...res.filas, ...(res.total ? [res.total] : [])];
    const blob = new Blob(["\uFEFF" + filas.map(f => f.map(celdaCsv).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${R.id}-${hoy()}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  return <>
    <h1>Reportes</h1>
    <div className="card">
      <div className="fila">
        <select value={id} onChange={e => setId(e.target.value)} style={{ minWidth: 260 }}>{REPORTES.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select>
        {R.fechas && <><label className="fila">Desde <input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></label><label className="fila">Hasta <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></label>
          <button className="btn suave chico" onClick={() => rango(primeroDelMes(hoy()), hoy())}>Este mes</button>
          <button className="btn suave chico" onClick={mesPasado}>Mes pasado</button>
          <button className="btn suave chico" onClick={() => rango(sumaMeses(primeroDelMes(hoy()), -2), hoy())}>Últimos 3 meses</button>
          <button className="btn suave chico" onClick={() => rango(hoy().slice(0, 4) + "-01-01", hoy())}>Este año</button></>}
      </div>
      <p className="mute" style={{ margin: "8px 0 0" }}>{R.desc} Se calcula con la zona que elegiste arriba y con lo que tu usuario puede ver.</p>
      <div className="fila" style={{ marginTop: 10 }}><button className="btn" disabled={!res || cargando} onClick={exportar}>Exportar a Excel</button><button className="btn suave" disabled={!res || cargando} onClick={() => window.print()}>Imprimir / Guardar PDF</button></div>
    </div>
    {error && <Aviso tipo="mal">{error}</Aviso>}
    {cargando ? <Cargando /> : res && <div className="hoja">
      <div className="cab"><img src="/logo.png" alt="Vortex" /><div className="t"><h1>{R.nombre}</h1><div className="sub">{subtitulo}</div></div><div className="sub">Generado: {fechaLarga(hoy())}</div></div>
      {res.filas.length ? <table><thead><tr>{res.cols.map(c => <th key={c.t}>{c.t}</th>)}</tr></thead>
        <tbody>{res.filas.map((f, i) => <tr key={i}>{f.map((v, j) => <td key={j}>{fmt(v, res.cols[j].f)}</td>)}</tr>)}</tbody>
        {res.total && <tfoot><tr>{res.total.map((v, j) => <td key={j}><b>{fmt(v, res.cols[j].f)}</b></td>)}</tr></tfoot>}</table> : <Vacio>No hay datos para mostrar con estos filtros.</Vacio>}
      {res.nota && <p className="sub" style={{ textAlign: "left" }}>{res.nota}</p>}
    </div>}
  </>;
}
