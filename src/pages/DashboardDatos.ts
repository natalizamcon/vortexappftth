import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { hoy, useAlcance } from "../lib/ui";
import { mesDesp, mesesRango, num, sumaDe, todas } from "../lib/datos";

const n = num;
export const addDias = (iso: string, k: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + k); return d.toISOString().slice(0, 10); };
const diasEntre = (a: string, b: string) => Math.round((+new Date(b + "T12:00:00") - +new Date(a + "T12:00:00")) / 86400000);
export const finDeMes = (m: string) => addDias(mesDesp(m, 1) + "-01", -1);
const aDatos = async (p: Promise<any[]>) => { try { return await p; } catch { return [] as any[]; } };
const dat = (r: any): any[] => (r && !r.error && r.data ? r.data : []);

/** Todo lo que necesita el Dashboard, calculado para el rango de fechas elegido y el alcance (proyecto y zona) de la barra superior. */
export function useDashboardDatos(desde: string, hasta: string) {
  const { proyectoId, zonaId, zonas, proyectos, perfil } = useApp(), al = useAlcance();
  const [d, setD] = useState<any>(null), [cargando, setCargando] = useState(true), [t, setT] = useState(0);
  useEffect(() => {
    let vivo = true; setCargando(true);
    (async () => {
      const H = hoy(), mesA = desde.slice(0, 7), mesB = hasta.slice(0, 7), k = Math.max(1, mesesRango(mesA, mesB).length), ndias = Math.max(1, diasEntre(desde, hasta) + 1);
      const pFin = addDias(desde, -1), pIni = addDias(pFin, -(ndias - 1)), mesDesde12 = mesDesp(mesB, -23);
      const [cli, cob, res, cargos, pagos, apl, naps, mant, ords, acts, eqs, gast, viajes, pu, soc] = await Promise.all([
        aDatos(todas(() => al(supabase.from("clientes").select("zona_id, estado, fecha_instalacion, fecha_baja").order("id")))),
        aDatos(todas(() => al(supabase.from("v_cobranza").select("cliente_id, codigo, nombre, zona_id, estado_cuenta, deuda, mas_antiguo").order("cliente_id")))),
        aDatos(todas(() => al(supabase.from("v_resumen_zona_mes").select("proyecto_id, zona_id, mes, ingresos_servicio, cobrado, otros_ingresos, gastos_operativos, inversion").order("mes")))),
        aDatos(todas(() => al(supabase.from("v_cargos").select("periodo, monto, pagado, saldo").gte("periodo", mesDesde12 + "-01").order("periodo")))),
        aDatos(todas(() => al(supabase.from("v_pagos").select("monto, fecha").eq("anulado", false).gte("fecha", desde).lte("fecha", hasta).order("fecha")))),
        aDatos(todas(() => al(supabase.from("v_aplicaciones").select("monto").eq("anulado", false).gt("periodo_cargo", H.slice(0, 7) + "-01").order("id")))),
        aDatos(todas(() => al(supabase.from("v_naps_ocupacion").select("nap_id, codigo, zona_id, total, ocupados, libres, reservados, danados").order("codigo")))),
        aDatos(todas(() => al(supabase.from("mantenimientos").select("objeto, referencia, tipo, estado, fecha_programada, fecha_cierre, tecnico, zona_id, problema").order("id")))),
        aDatos(todas(() => al(supabase.from("ordenes_trabajo").select("tipo, estado, fecha_programada, tecnico, zona_id, referencia").in("estado", ["PROGRAMADA", "EN PROCESO"]).order("id")))),
        aDatos(todas(() => al(supabase.from("v_actividades").select("fuente, cliente, tecnico, trabajo, fecha, zona_id, estado").eq("estado", "COMPLETADA").order("fecha", { ascending: false })))),
        aDatos(todas(() => al(supabase.from("equipos_serie").select("estado").eq("estado", "PENDIENTE").order("id"), false))),
        aDatos(todas(() => al(supabase.from("fin_movimientos").select("categoria, descripcion, monto, fecha, proyecto_id").eq("tipo", "GASTO_OPERATIVO").gte("fecha", mesB + "-01").lte("fecha", finDeMes(mesB)).order("fecha")))),
        aDatos(todas(() => al(supabase.from("viajes").select("tipo, detalle, fecha_inicio, estado, zona_id").eq("estado", "PROGRAMADO").order("fecha_inicio")))),
        perfil?.rol === "admin" ? aDatos(todas(() => supabase.from("proyecto_usuarios").select("proyecto_id, user_id").order("proyecto_id"))) : Promise.resolve([]),
        perfil?.rol === "admin" ? aDatos(todas(() => supabase.from("profiles").select("id, nombre, email").eq("rol", "socio").order("id"))) : Promise.resolve([]),
      ]);
      if (!vivo) return;
      const activoEn = (c: any, f: string) => (!c.fecha_instalacion || c.fecha_instalacion <= f) && (c.estado !== "BAJA" || (c.fecha_baja && c.fecha_baja > f));
      const nuevosEn = (a: string, b: string) => cli.filter(c => c.fecha_instalacion && c.fecha_instalacion >= a && c.fecha_instalacion <= b).length, bajasEn = (a: string, b: string) => cli.filter(c => c.fecha_baja && c.fecha_baja >= a && c.fecha_baja <= b).length;
      const ing = (r: any) => n(r.ingresos_servicio) + n(r.otros_ingresos), enMeses = (ms: string[]) => res.filter(r => ms.includes(String(r.mes).slice(0, 7)));
      const mesesRng = mesesRango(mesA, mesB), mesesPrev = mesesRango(mesDesp(mesA, -k), mesDesp(mesA, -1));
      const ingR = enMeses(mesesRng).reduce((s, r) => s + ing(r), 0), gasR = sumaDe(enMeses(mesesRng), "gastos_operativos"), ingP = enMeses(mesesPrev).reduce((s, r) => s + ing(r), 0), gasP = sumaDe(enMeses(mesesPrev), "gastos_operativos");
      const capex = sumaDe(res, "inversion"), recuperado = res.reduce((s, r) => s + ing(r) - n(r.gastos_operativos), 0), capexRango = sumaDe(enMeses(mesesRng), "inversion");
      const serie = (m: number) => mesesRango(mesDesp(mesB, -(m - 1)), mesB);
      const porMes = (ms: string[]) => ms.map(mm => { const r = res.filter(x => String(x.mes).slice(0, 7) === mm); return { mes: mm, ing: r.reduce((s, x) => s + ing(x), 0), serv: sumaDe(r, "ingresos_servicio"), cob: sumaDe(r, "cobrado"), gas: sumaDe(r, "gastos_operativos") }; });
      const porProyecto = proyectos.map(p => { const r = res.filter(x => x.proyecto_id === p.id && String(x.mes).slice(0, 7) === mesB), ss = (soc as any[]).filter(s => (pu as any[]).some(a => a.proyecto_id === p.id && a.user_id === s.id)); return { id: p.id, nombre: p.nombre, etiqueta: `${p.nombre} — ${["Empresa", ...ss.map(s => s.nombre || s.email)].join(" + ")}`, valor: r.reduce((s, x) => s + ing(x) - n(x.gastos_operativos), 0), hay: r.length > 0 }; }).filter(p => p.hay || !proyectoId || p.id === proyectoId);
      const cats: Record<string, number> = {}; gast.forEach(x => { const c = x.categoria || x.descripcion || "Sin categoría"; cats[c] = (cats[c] || 0) + n(x.monto); });
      const deudores = cob.filter(c => ["VENCIDO", "SUSPENDIDO"].includes(c.estado_cuenta) && n(c.deuda) > 0).sort((a, b) => n(b.deuda) - n(a.deuda));
      const enRango = cargos.filter(c => String(c.periodo).slice(0, 7) >= mesA && String(c.periodo).slice(0, 7) <= mesB);
      const abiertasM = mant.filter(m => ["PENDIENTE", "EN PROCESO", "PAUSADO"].includes(m.estado)), esRed = (m: any) => ["NAP", "Red troncal"].includes(m.objeto);
      const falla: Record<string, number> = {}; mant.filter(m => m.objeto === "NAP" && m.referencia && /correctivo/i.test(m.tipo || "")).forEach(m => { falla[m.referencia] = (falla[m.referencia] || 0) + 1; });
      const tec: Record<string, number> = {}; [...ords, ...abiertasM].forEach(x => { if (x.tecnico) tec[x.tecnico] = (tec[x.tecnico] || 0) + 1; });
      const ordI = ords.filter(o => o.tipo === "Instalación"), ordB = ords.filter(o => o.tipo === "Baja");
      const instComp = acts.filter(a => a.fuente === "instalacion" && a.fecha >= desde && a.fecha <= hasta).length, bajasComp = acts.filter(a => a.fuente === "baja" && a.fecha >= desde && a.fecha <= hasta).length;
      const mantComp = mant.filter(m => m.estado === "COMPLETADA" && m.fecha_cierre && m.fecha_cierre >= desde && m.fecha_cierre <= hasta).length;
      const tareas = [...ords.map(o => ({ fecha: o.fecha_programada || H, texto: `${o.tipo}: ${o.referencia || "—"}`, zona_id: o.zona_id })), ...mant.filter(m => ["PENDIENTE", "EN PROCESO"].includes(m.estado)).map(m => ({ fecha: m.fecha_programada || H, texto: `Mantenimiento ${m.objeto}${m.referencia ? " " + m.referencia : ""}: ${m.problema || ""}`, zona_id: m.zona_id })), ...viajes.map(v => ({ fecha: v.fecha_inicio, texto: `Viaje: ${v.tipo || ""}${v.detalle ? " (" + v.detalle + ")" : ""}`, zona_id: v.zona_id }))].sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(0, 8);
      const activosAhora = cli.filter(c => activoEn(c, H)).length, activosFin = cli.filter(c => activoEn(c, hasta)).length, activosPrev = cli.filter(c => activoEn(c, pFin)).length;
      setD({
        H, mesA, mesB, k, ndias, pIni, pFin, activosAhora, activosFin, activosPrev, hayPrev: cli.some(c => c.fecha_instalacion && c.fecha_instalacion <= pFin),
        nuevos: nuevosEn(desde, hasta), nuevosPrev: nuevosEn(pIni, pFin), bajas: bajasEn(desde, hasta), bajasPrev: bajasEn(pIni, pFin),
        cobradoRango: sumaDe(pagos, "monto"), deudaTotal: sumaDe(deudores, "deuda"), nDeudores: deudores.length, ingR, gasR, resR: ingR - gasR, ingP, gasP, resP: ingP - gasP, hayPrevRes: res.some(r => mesesPrev.includes(String(r.mes).slice(0, 7))),
        capex, capexRango, recuperado, serie, porMes, porProyecto, cats: Object.entries(cats).sort((a, b) => b[1] - a[1]), deudores,
        estados: ["PAGADO", "POR VENCER", "VENCIDO", "SUSPENDIDO"].map(e => ({ e, k: cob.filter(c => c.estado_cuenta === e).length })),
        parciales: cargos.filter(c => n(c.pagado) > 0 && n(c.saldo) > 0 && String(c.periodo).slice(0, 7) <= H.slice(0, 7)).length, anticipado: sumaDe(apl, "monto"),
        pctCobranza: enRango.length && sumaDe(enRango, "monto") ? Math.round((sumaDe(enRango, "pagado") / sumaDe(enRango, "monto")) * 100) : null, venc: cob.filter(c => c.estado_cuenta === "VENCIDO").length,
        naps, mantRedPend: abiertasM.filter(esRed).length, falla, clientes: cli, tec,
        ops: { instPend: ordI.filter(o => o.estado === "PROGRAMADA").length, instProc: ordI.filter(o => o.estado === "EN PROCESO").length, instComp, mantAb: abiertasM.length, mantProc: mant.filter(m => m.estado === "EN PROCESO").length, mantComp, atrasadas: ords.filter(o => o.fecha_programada && o.fecha_programada < H).length, bajasPend: ordB.length, bajasComp, eqRec: eqs.length, mantPend: mant.filter(m => m.estado === "PENDIENTE").length, bajasProc: ordB.filter(o => o.estado === "EN PROCESO").length },
        tareas, recientes: acts.slice(0, 8), activoEn,
      });
      setCargando(false);
    })().catch(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [proyectoId, zonaId, desde, hasta, zonas.length, proyectos.length, t]);
  return { d, cargando, recargar: () => setT(x => x + 1) };
}
