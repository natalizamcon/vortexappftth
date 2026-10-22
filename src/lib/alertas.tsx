import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "./supabase";
import { useApp } from "./auth";
import { bs, hoy, useAlcance } from "./ui";
import { mesAnterior, rangoMes } from "./reparto";

export type Nivel = "critica" | "atencion" | "info";
export type Area = "Cobranza" | "Red" | "Operación" | "Inventario" | "Finanzas";
export type Alerta = { id: string; nivel: Nivel; area: Area; titulo: string; detalle: string[]; ruta: string };

const n = (x: any) => Number(x) || 0;
const dat = (r: any): any[] => (r && !r.error && r.data ? r.data : []);
const cuenta = (r: any, filas: any[]) => (r && !r.error && typeof r.count === "number" ? r.count : filas.length);
const mas = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const dias = (a: string, b: string) => Math.round((+new Date(a + "T12:00:00") - +new Date(b + "T12:00:00")) / 86400000);
const mesesEntre = (desde: string, hasta: string) => (+hasta.slice(0, 4) - +desde.slice(0, 4)) * 12 + (+hasta.slice(5, 7) - +desde.slice(5, 7)) - (+hasta.slice(8, 10) < +desde.slice(8, 10) ? 1 : 0);
const lista = (xs: string[], max = 6) => (xs.length > max ? [...xs.slice(0, max), `… y ${xs.length - max} más`] : xs);
const plural = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;

type Ctx = { alertas: Alerta[]; cargando: boolean; actualizadaA: Date | null; recargar: () => void };
const C = createContext<Ctx>({ alertas: [], cargando: true, actualizadaA: null, recargar: () => {} });
export const useAlertas = () => useContext(C);

/** Calcula las alertas con los datos que cada persona tiene permiso de ver. Todo se calcula al momento. */
export function AlertasProvider({ children }: { children: ReactNode }) {
  const { zonas, proyectoId, zonaId, perfil } = useApp(), al = useAlcance();
  const [alertas, setAlertas] = useState<Alerta[]>([]), [cargando, setCargando] = useState(true), [t, setT] = useState(0), [cuando, setCuando] = useState<Date | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCargando(true);
      try {
        const H = hoy(), zv = zonas.filter(z => (!proyectoId || z.proyecto_id === proyectoId) && (!zonaId || z.id === zonaId));
        const zn = (id: string) => (zv.length > 1 ? ` · ${zonas.find(z => z.id === id)?.nombre || ""}` : "");
        const esAdmin = perfil?.rol === "admin", [prevIni] = rangoMes(mesAnterior(H)), sinDatos = Promise.resolve({ data: [], error: null });
        const [venc, porv, noc, naps, resv, mant, viajes, mats, stock, inv, pinv, pre, fin, resCli, trs, fusAlt, liqPrev, pagosSocio] = await Promise.all([
          al(supabase.from("v_cobranza").select("nombre, meses_deuda, deuda, zona_id", { count: "exact" }).eq("estado_cuenta", "VENCIDO").order("deuda", { ascending: false }).limit(100)),
          al(supabase.from("v_cobranza").select("nombre, zona_id", { count: "exact" }).eq("estado_cuenta", "POR VENCER").limit(100)),
          al(supabase.from("clientes").select("nombre, no_cortar_hasta, zona_id").eq("no_cortar", true).neq("estado", "BAJA").not("no_cortar_hasta", "is", null).lte("no_cortar_hasta", mas(3)).order("no_cortar_hasta").limit(100)),
          al(supabase.from("v_naps_ocupacion").select("*").limit(500)),
          al(supabase.from("v_reservas_vencidas").select("*").limit(100)),
          al(supabase.from("mantenimientos").select("objeto, referencia, problema, fecha_programada, estado, zona_id").in("estado", ["PENDIENTE", "EN PROCESO", "PAUSADO"]).limit(300)),
          al(supabase.from("viajes").select("tipo, detalle, fecha_inicio, fecha_fin, estado, zona_id").in("estado", ["PROGRAMADO", "EN EJECUCION", "PAUSADO"]).limit(200)),
          al(supabase.from("materiales").select("id, nombre, minimo, unidad").gt("minimo", 0).limit(500), false),
          al(supabase.from("stock").select("material_id, cantidad").limit(5000), false),
          al(supabase.from("inversores").select("id, nombre, monto, interes, periodo_interes, plazo_meses, fecha_inicio, zona_id").limit(300)),
          al(supabase.from("pagos_inversores").select("inversor_id, monto").limit(5000), false),
          al(supabase.from("presupuesto_lineas").select("zona_id, tipo, cantidad, monto_unitario, periodo").limit(3000)),
          al(supabase.from("fin_movimientos").select("zona_id, tipo, monto").in("tipo", ["INVERSION", "GASTO_OPERATIVO"]).not("zona_id", "is", null).limit(5000)),
          al(supabase.from("v_cobranza_resumen").select("zona_id, estado_cuenta, clientes")),
          al(supabase.from("v_troncales_resumen").select("codigo, zona_id, total, libres, danados").limit(300)),
          al(supabase.from("v_fusiones").select("troncal_codigo, hilo_entrada, perdida_db, zona_id").gt("perdida_db", 0.3).limit(100)),
          esAdmin ? al(supabase.from("v_liquidaciones").select("zona_id").eq("estado", "CONFIRMADA").eq("periodo", prevIni).limit(500)) : sinDatos,
          esAdmin ? (() => { let q = supabase.from("v_reparto_socios").select("socio_nombre, zona_id, monto, periodo, fecha_reparto").eq("estado", "CONFIRMADA").is("pagado_en", null).lt("fecha_reparto", mas(-15)).limit(100); if (zonaId) q = q.eq("zona_id", zonaId); return q; })() : sinDatos,
        ]);
        const A: Alerta[] = [];

        // ---------- COBRANZA ----------
        const V = dat(venc);
        if (V.length) A.push({ id: "venc", area: "Cobranza", ruta: "cobranzas", nivel: V.some(x => n(x.meses_deuda) >= 2) ? "critica" : "atencion",
          titulo: `${plural(cuenta(venc, V), "cliente con pago vencido", "clientes con pago vencido")}`,
          detalle: lista(V.map(x => `${x.nombre}${zn(x.zona_id)} · ${n(x.meses_deuda)} ${n(x.meses_deuda) === 1 ? "mes" : "meses"} · ${bs(x.deuda)}`)) });
        const PV = dat(porv);
        if (PV.length) A.push({ id: "porv", area: "Cobranza", ruta: "cobranzas", nivel: "info", titulo: `${plural(cuenta(porv, PV), "cliente vence", "clientes vencen")} en los próximos 5 días`, detalle: lista(PV.map(x => `${x.nombre}${zn(x.zona_id)}`)) });
        const NC = dat(noc), ncV = NC.filter(x => x.no_cortar_hasta < H), ncP = NC.filter(x => x.no_cortar_hasta >= H);
        if (ncV.length) A.push({ id: "nocV", area: "Cobranza", ruta: "cobranzas", nivel: "atencion", titulo: `${plural(ncV.length, "cliente con \"No cortar\" ya vencido", "clientes con \"No cortar\" ya vencido")}`, detalle: lista(ncV.map(x => `${x.nombre}${zn(x.zona_id)} · venció el ${x.no_cortar_hasta}`)) });
        if (ncP.length) A.push({ id: "nocP", area: "Cobranza", ruta: "cobranzas", nivel: "info", titulo: `${plural(ncP.length, "\"No cortar\" termina", "\"No cortar\" terminan")} en 3 días o menos`, detalle: lista(ncP.map(x => `${x.nombre}${zn(x.zona_id)} · hasta el ${x.no_cortar_hasta}`)) });

        // ---------- RED ----------
        const N = dat(naps), llenas = N.filter(x => n(x.libres) === 0 && n(x.total) > 0), casi = N.filter(x => n(x.libres) > 0 && n(x.libres) <= Math.max(1, Math.floor(n(x.total) * 0.1)));
        if (llenas.length) A.push({ id: "napLlena", area: "Red", ruta: "red", nivel: "critica", titulo: `${plural(llenas.length, "NAP sin puertos libres", "NAP sin puertos libres")}`, detalle: lista(llenas.map(x => `${x.codigo}${zn(x.zona_id)} · ${n(x.ocupados)} ocupados, ${n(x.reservados)} reservados`)) });
        if (casi.length) A.push({ id: "napCasi", area: "Red", ruta: "red", nivel: "atencion", titulo: `${plural(casi.length, "NAP casi llena", "NAP casi llenas")}`, detalle: lista(casi.map(x => `${x.codigo}${zn(x.zona_id)} · quedan ${n(x.libres)} de ${n(x.total)} puertos`)) });
        const RV = dat(resv);
        if (RV.length) A.push({ id: "resv", area: "Red", ruta: "red", nivel: "atencion", titulo: `${plural(RV.length, "reserva de puerto vencida", "reservas de puerto vencidas")}`, detalle: lista(RV.map(x => `${x.nap} puerto ${x.numero}${zn(x.zona_id)} · ${x.reservado_para || "sin nombre"} · venció el ${x.reservado_hasta}`)) });
        const dan = N.filter(x => n(x.danados) > 0);
        if (dan.length) A.push({ id: "dan", area: "Red", ruta: "red", nivel: "info", titulo: `${plural(dan.reduce((s, x) => s + n(x.danados), 0), "puerto dañado", "puertos dañados")}`, detalle: lista(dan.map(x => `${x.codigo}${zn(x.zona_id)} · ${n(x.danados)} dañado(s)`)) });

        const TRs = dat(trs), tPoco = TRs.filter(x => n(x.libres) <= 2), tDan = TRs.filter(x => n(x.danados) > 0), FA = dat(fusAlt);
        if (tPoco.length) A.push({ id: "tronLibres", area: "Red", ruta: "red", nivel: tPoco.some(x => n(x.libres) === 0) ? "critica" : "atencion", titulo: `${plural(tPoco.length, "troncal casi sin hilos libres", "troncales casi sin hilos libres")}`, detalle: lista(tPoco.map(x => `${x.codigo}${zn(x.zona_id)} · quedan ${n(x.libres)} de ${n(x.total)} hilos`)) });
        if (tDan.length) A.push({ id: "tronDan", area: "Red", ruta: "red", nivel: "info", titulo: `${plural(tDan.reduce((s, x) => s + n(x.danados), 0), "hilo dañado", "hilos dañados")}`, detalle: lista(tDan.map(x => `${x.codigo}${zn(x.zona_id)} · ${n(x.danados)} dañado(s)`)) });
        if (FA.length) A.push({ id: "fusAlta", area: "Red", ruta: "red", nivel: "atencion", titulo: `${plural(FA.length, "fusión con pérdida alta", "fusiones con pérdida alta")}`, detalle: lista(FA.map(x => `${x.troncal_codigo}${zn(x.zona_id)} · hilo ${x.hilo_entrada} · ${n(x.perdida_db).toFixed(2)} dB`)) });

        // ---------- OPERACIÓN ----------
        const M = dat(mant), mAtr = M.filter(x => x.fecha_programada && x.fecha_programada < H), mProx = M.filter(x => x.fecha_programada && x.fecha_programada >= H && x.fecha_programada <= mas(1));
        const nomM = (x: any) => `${x.objeto}${x.referencia ? " " + x.referencia : ""}${zn(x.zona_id)}`;
        if (mAtr.length) A.push({ id: "mantAtr", area: "Operación", ruta: "campo", nivel: mAtr.some(x => dias(H, x.fecha_programada) > 3) ? "critica" : "atencion", titulo: `${plural(mAtr.length, "mantenimiento atrasado", "mantenimientos atrasados")}`, detalle: lista(mAtr.map(x => `${nomM(x)} · ${dias(H, x.fecha_programada)} día(s) de atraso · ${x.estado.toLowerCase()}`)) });
        if (mProx.length) A.push({ id: "mantProx", area: "Operación", ruta: "campo", nivel: "info", titulo: `${plural(mProx.length, "mantenimiento para hoy o mañana", "mantenimientos para hoy o mañana")}`, detalle: lista(mProx.map(x => `${nomM(x)} · ${x.fecha_programada}`)) });
        const Vj = dat(viajes), vSin = Vj.filter(x => x.estado === "EN EJECUCION" && x.fecha_fin < H), vNo = Vj.filter(x => x.estado === "PROGRAMADO" && x.fecha_inicio < H), vProx = Vj.filter(x => x.estado === "PROGRAMADO" && x.fecha_inicio >= H && x.fecha_inicio <= mas(3));
        const nomV = (x: any) => `${x.tipo || "Viaje"}${x.detalle ? " (" + x.detalle + ")" : ""}${zn(x.zona_id)}`;
        if (vSin.length) A.push({ id: "viajeSin", area: "Operación", ruta: "campo", nivel: "atencion", titulo: `${plural(vSin.length, "viaje sin cerrar", "viajes sin cerrar")}`, detalle: lista(vSin.map(x => `${nomV(x)} · debió terminar el ${x.fecha_fin}`)) });
        if (vNo.length) A.push({ id: "viajeNo", area: "Operación", ruta: "campo", nivel: "atencion", titulo: `${plural(vNo.length, "viaje programado que no se inició", "viajes programados que no se iniciaron")}`, detalle: lista(vNo.map(x => `${nomV(x)} · debía empezar el ${x.fecha_inicio}`)) });
        if (vProx.length) A.push({ id: "viajeProx", area: "Operación", ruta: "campo", nivel: "info", titulo: `${plural(vProx.length, "viaje empieza", "viajes empiezan")} en 3 días o menos`, detalle: lista(vProx.map(x => `${nomV(x)} · ${x.fecha_inicio}`)) });

        // ---------- INVENTARIO ----------
        const stockTot: Record<string, number> = {}; dat(stock).forEach(s => { stockTot[s.material_id] = (stockTot[s.material_id] || 0) + n(s.cantidad); });
        const bajos = dat(mats).map(m => ({ ...m, tiene: stockTot[m.id] || 0 })).filter(m => m.tiene < n(m.minimo));
        if (bajos.length) A.push({ id: "stock", area: "Inventario", ruta: "inventario", nivel: bajos.some(m => m.tiene <= 0) ? "critica" : "atencion", titulo: `${plural(bajos.length, "material bajo el mínimo", "materiales bajo el mínimo")}`,
          detalle: lista(bajos.sort((a, b) => a.tiene - b.tiene).map(m => `${m.nombre} · hay ${m.tiene} ${m.unidad}, mínimo ${n(m.minimo)}`)) });

        // ---------- FINANZAS ----------
        const pagado: Record<string, number> = {}; dat(pinv).forEach(p => { pagado[p.inversor_id] = (pagado[p.inversor_id] || 0) + n(p.monto); });
        const atras = dat(inv).map(x => {
          const interes = n(x.monto) * (n(x.interes) / 100) * (x.periodo_interes === "anual" ? n(x.plazo_meses) / 12 : n(x.plazo_meses)), cuota = (n(x.monto) + interes) / (n(x.plazo_meses) || 1);
          const meses = Math.min(n(x.plazo_meses), Math.max(0, mesesEntre(x.fecha_inicio, H))), debe = cuota * meses - (pagado[x.id] || 0);
          return { ...x, cuota, debe };
        }).filter(x => x.cuota > 0 && x.debe > x.cuota * 0.5);
        if (atras.length) A.push({ id: "inv", area: "Finanzas", ruta: "finanzas", nivel: atras.some(x => x.debe >= x.cuota * 2) ? "critica" : "atencion", titulo: `${plural(atras.length, "inversor con pagos atrasados", "inversores con pagos atrasados")}`, detalle: lista(atras.map(x => `${x.nombre}${zn(x.zona_id)} · atraso de ${bs(x.debe)}`)) });

        const activos: Record<string, number> = {}; dat(resCli).filter(x => x.estado_cuenta !== "BAJA").forEach(x => { activos[x.zona_id] = (activos[x.zona_id] || 0) + n(x.clientes); });
        const metaCrit: string[] = [], metaAt: string[] = [];
        zv.filter(z => n(z.meta_clientes) > 0 && z.fecha_meta).forEach(z => {
          const a = activos[z.id] || 0, total = Math.max(1, mesesEntre(z.fecha_inicio, z.fecha_meta)), pasados = Math.max(0, mesesEntre(z.fecha_inicio, H)), esperado = n(z.meta_clientes) * Math.min(1, pasados / total);
          if (H > z.fecha_meta && a < n(z.meta_clientes)) metaCrit.push(`${z.nombre}: ${a} de ${z.meta_clientes} clientes (la meta era para el ${z.fecha_meta})`);
          else if (pasados >= 1 && a < esperado * 0.7) metaAt.push(`${z.nombre}: ${a} de ${z.meta_clientes} clientes; a esta fecha se esperaban unos ${Math.round(esperado)}`);
        });
        if (metaCrit.length) A.push({ id: "metaV", area: "Finanzas", ruta: "zonas", nivel: "critica", titulo: `${plural(metaCrit.length, "meta de zona vencida sin cumplir", "metas de zona vencidas sin cumplir")}`, detalle: lista(metaCrit) });
        if (metaAt.length) A.push({ id: "metaA", area: "Finanzas", ruta: "zonas", nivel: "atencion", titulo: `${plural(metaAt.length, "zona va lenta para su meta", "zonas van lentas para su meta")}`, detalle: lista(metaAt) });

        const pasan: { t: string; nivel: Nivel }[] = [];
        zv.forEach(z => {
          const meses = Math.max(1, mesesEntre(z.fecha_inicio || H, H) + 1);
          (["INVERSION", "GASTO_OPERATIVO"] as const).forEach(tp => {
            const presu = dat(pre).filter(l => l.zona_id === z.id && l.tipo === tp).reduce((s, l) => s + n(l.cantidad) * n(l.monto_unitario) * (l.periodo === "mensual" ? meses : 1), 0);
            const real = dat(fin).filter(l => l.zona_id === z.id && l.tipo === tp).reduce((s, l) => s + n(l.monto), 0);
            if (presu > 0 && real > presu) pasan.push({ nivel: real > presu * 1.1 ? "critica" : "atencion", t: `${z.nombre}: ${tp === "INVERSION" ? "inversión" : "gasto operativo"} ${bs(real)} de ${bs(presu)} presupuestados (${Math.round((real / presu) * 100)}%)` });
          });
        });
        if (pasan.length) A.push({ id: "presu", area: "Finanzas", ruta: "finanzas", nivel: pasan.some(x => x.nivel === "critica") ? "critica" : "atencion", titulo: `${plural(pasan.length, "presupuesto excedido", "presupuestos excedidos")}`, detalle: lista(pasan.map(x => x.t)) });

        if (esAdmin) {
          const hechas = new Set(dat(liqPrev).map(x => x.zona_id)), [, finPrev] = rangoMes(mesAnterior(H));
          const faltan = zv.filter(z => (z.fecha_inicio || "0000") <= finPrev && !hechas.has(z.id));
          if (faltan.length) A.push({ id: "repartoPend", area: "Finanzas", ruta: "finanzas", nivel: +H.slice(8, 10) >= 10 ? "atencion" : "info", titulo: `${plural(faltan.length, "zona sin reparto de", "zonas sin reparto de")} ${mesAnterior(H)}`, detalle: lista(faltan.map(z => z.nombre)) });
          const PS = dat(pagosSocio);
          if (PS.length) A.push({ id: "pagoSocio", area: "Finanzas", ruta: "finanzas", nivel: "atencion", titulo: `${plural(PS.length, "pago a socio pendiente hace más de 15 días", "pagos a socios pendientes hace más de 15 días")}`, detalle: lista(PS.map(x => `${x.socio_nombre}${zn(x.zona_id)} · ${bs(x.monto)} · reparto de ${String(x.periodo).slice(0, 7)}`)) });
        }
        const peso = { critica: 0, atencion: 1, info: 2 };
        A.sort((a, b) => peso[a.nivel] - peso[b.nivel]);
        if (!cancelado) { setAlertas(A); setCuando(new Date()); }
      } catch { if (!cancelado) setAlertas([]); }
      if (!cancelado) setCargando(false);
    })();
    return () => { cancelado = true; };
  }, [proyectoId, zonaId, zonas, t]);

  // se actualiza sola cada 5 minutos
  useEffect(() => { const i = setInterval(() => setT(x => x + 1), 300000); return () => clearInterval(i); }, []);

  return <C.Provider value={{ alertas, cargando, actualizadaA: cuando, recargar: () => setT(x => x + 1) }}>{children}</C.Provider>;
}

/** Numerito rojo del menú: críticas y de atención. */
export function ContadorAlertas() {
  const { alertas } = useAlertas(), k = alertas.filter(a => a.nivel !== "info").length;
  return k ? <span style={{ marginLeft: 6, background: "var(--bad)", color: "#fff", borderRadius: 99, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{k}</span> : null;
}
