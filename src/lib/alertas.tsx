import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "./supabase";
import { useApp } from "./auth";
import { bs, hoy, useAlcance } from "./ui";
import { mesAnterior, rangoMes } from "./reparto";

export type Prioridad = "critica" | "alta" | "media" | "baja";
export type Nivel = "critica" | "atencion" | "info";
export type Area = "Cobranza" | "Red" | "Operación" | "Inventario" | "Finanzas";
export type Alerta = { id: string; tipo: string; prioridad: Prioridad; nivel: Nivel; area: Area; fecha: string; proyecto_id: string; zona_id: string | null; descripcion: string; titulo: string; detalle: string[]; ruta: string; firma: string };
export type Revisada = { clave: string; proyecto_id: string | null; zona_id: string | null; tipo: string; prioridad: string; descripcion: string; fecha_alerta: string; firma: string; estado: "REVISADA" | "RESUELTA"; nota: string | null; usuario_nombre: string | null; fecha: string };
export type TipoAlerta = { clave: string; nombre: string; cuando: string; prioridad: string; area: Area; roles: string[]; extra?: boolean };

/** Columnas de la tabla "Quién recibe cada alerta" (el administrador siempre recibe todas). */
export const ROLES_REGLAS: [string, string][] = [["socio", "Socio"], ["financiero", "Financiero"], ["cobranzas", "Cobranzas"], ["supervisor", "Supervisor técnico"], ["almacen", "Almacén"]];
export const RESPONSABLE_ORDEN = ["cobranzas", "supervisor", "almacen", "financiero", "socio"];

/** Todas las alertas del sistema, con quién las recibe de entrada (el administrador puede cambiarlo). */
export const TIPOS: TipoAlerta[] = [
  { clave: "prox_vencer", nombre: "Clientes próximos a vencer", cuando: "Cliente con cargo pendiente que vence en 5 días o menos", prioridad: "Media", area: "Cobranza", roles: ["socio", "financiero", "cobranzas"] },
  { clave: "deuda", nombre: "Clientes con deuda", cuando: "Cliente vencido o suspendido con saldo", prioridad: "Alta · Crítica si es 30% o más de la zona", area: "Cobranza", roles: ["socio", "financiero", "cobranzas"] },
  { clave: "inst_pend", nombre: "Instalaciones pendientes", cuando: "Instalación sin completar", prioridad: "Media · Alta si la fecha ya pasó", area: "Operación", roles: ["socio", "supervisor"] },
  { clave: "mant_pend", nombre: "Mantenimientos pendientes", cuando: "Mantenimiento sin completar", prioridad: "Media · Alta si la fecha ya pasó", area: "Operación", roles: ["socio", "supervisor"] },
  { clave: "nap_llena", nombre: "NAP con puertos agotados", cuando: "NAP sin puertos libres", prioridad: "Alta", area: "Red", roles: ["socio", "supervisor"] },
  { clave: "puertos_dan", nombre: "Puertos dañados", cuando: "NAP con al menos un puerto dañado", prioridad: "Media", area: "Red", roles: ["socio", "supervisor"] },
  { clave: "eq_recuperar", nombre: "Equipos pendientes de recuperación", cuando: "Baja completada con el equipo sin devolver", prioridad: "Alta", area: "Inventario", roles: ["socio", "supervisor", "almacen"] },
  { clave: "stock_bajo", nombre: "Productos con stock bajo", cuando: "Stock bajo el mínimo", prioridad: "Media · Alta si hay agotados", area: "Inventario", roles: ["socio", "almacen"] },
  { clave: "eq_sin_ubicacion", nombre: "Equipos sin ubicación registrada", cuando: "Equipo con serie sin ubicación", prioridad: "Media", area: "Inventario", roles: ["socio", "almacen"] },
  { clave: "ordenes_atrasadas", nombre: "Órdenes de trabajo atrasadas", cuando: "Orden abierta con fecha vencida", prioridad: "Alta · Crítica si son más de 3", area: "Operación", roles: ["socio", "supervisor"] },
  { clave: "inv_gasto", nombre: "Inversiones o gastos por revisar", cuando: "Inversión o gasto operativo mayor a Bs 500 sin revisar", prioridad: "Media · Alta si supera Bs 5.000", area: "Finanzas", roles: ["financiero"] },
  { clave: "cambios_criticos", nombre: "Cambios críticos por autorizar", cuando: "Troncal a la papelera o ajuste y baja de inventario", prioridad: "Alta", area: "Finanzas", roles: [] },
  // ---- otras alertas que ya tenía el sistema ----
  { clave: "nocortar_venc", nombre: "“No cortar” ya vencido", cuando: "Cliente con “No cortar” cuya fecha ya pasó", prioridad: "Alta", area: "Cobranza", roles: ["socio", "cobranzas"], extra: true },
  { clave: "nocortar_prox", nombre: "“No cortar” por terminar", cuando: "“No cortar” que termina en 3 días o menos", prioridad: "Baja", area: "Cobranza", roles: ["socio", "cobranzas"], extra: true },
  { clave: "reserva_venc", nombre: "Reservas de puerto vencidas", cuando: "Puerto reservado cuya fecha ya pasó", prioridad: "Media", area: "Red", roles: ["socio", "supervisor"], extra: true },
  { clave: "nap_casi", nombre: "NAP casi llena", cuando: "NAP con 10% o menos de puertos libres", prioridad: "Media", area: "Red", roles: ["socio", "supervisor"], extra: true },
  { clave: "tron_libres", nombre: "Troncales casi sin hilos libres", cuando: "Troncal con 2 hilos libres o menos", prioridad: "Alta · Crítica si no queda ninguno", area: "Red", roles: ["socio", "supervisor"], extra: true },
  { clave: "tron_dan", nombre: "Hilos dañados", cuando: "Troncal con hilos dañados", prioridad: "Media", area: "Red", roles: ["socio", "supervisor"], extra: true },
  { clave: "fus_alta", nombre: "Fusiones con pérdida alta", cuando: "Fusión con más de 0,3 dB de pérdida", prioridad: "Media", area: "Red", roles: ["socio", "supervisor"], extra: true },
  { clave: "viaje_sin_cerrar", nombre: "Viajes sin cerrar", cuando: "Viaje en ejecución cuya fecha de regreso ya pasó", prioridad: "Alta", area: "Operación", roles: ["socio", "supervisor"], extra: true },
  { clave: "viaje_no_inicio", nombre: "Viajes que no se iniciaron", cuando: "Viaje programado cuya fecha de salida ya pasó", prioridad: "Media", area: "Operación", roles: ["socio", "supervisor"], extra: true },
  { clave: "viaje_prox", nombre: "Viajes por empezar", cuando: "Viaje que empieza en 3 días o menos", prioridad: "Baja", area: "Operación", roles: ["socio", "supervisor"], extra: true },
  { clave: "meta", nombre: "Metas de zona", cuando: "Zona con meta vencida o que va lenta", prioridad: "Alta · Crítica si la meta ya venció", area: "Finanzas", roles: ["socio", "financiero"], extra: true },
  { clave: "presupuesto", nombre: "Presupuestos excedidos", cuando: "Gasto real mayor al presupuesto de la zona", prioridad: "Alta · Crítica si supera el 110%", area: "Finanzas", roles: ["socio", "financiero"], extra: true },
  { clave: "inversor_atrasado", nombre: "Inversores con pagos atrasados", cuando: "Pagos al inversor con atraso", prioridad: "Alta · Crítica si debe 2 cuotas o más", area: "Finanzas", roles: ["socio", "financiero"], extra: true },
  { clave: "reparto_pend", nombre: "Reparto del mes sin hacer", cuando: "Zona sin reparto del mes anterior", prioridad: "Baja · Media desde el día 10", area: "Finanzas", roles: [], extra: true },
  { clave: "pago_socio", nombre: "Pagos a socios pendientes", cuando: "Pago a socio sin marcar hace más de 15 días", prioridad: "Alta", area: "Finanzas", roles: [], extra: true },
];

const n = (x: any) => Number(x) || 0;
const dat = (r: any): any[] => (r && !r.error && r.data ? r.data : []);
const mas = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const dias = (a: string, b: string) => Math.round((+new Date(a + "T12:00:00") - +new Date(b + "T12:00:00")) / 86400000);
const mesesEntre = (desde: string, hasta: string) => (+hasta.slice(0, 4) - +desde.slice(0, 4)) * 12 + (+hasta.slice(5, 7) - +desde.slice(5, 7)) - (+hasta.slice(8, 10) < +desde.slice(8, 10) ? 1 : 0);
const lista = (xs: string[], max = 8) => (xs.length > max ? [...xs.slice(0, max), `… y ${xs.length - max} más`] : xs);
const pl = (k: number, uno: string, varios: string) => `${k} ${k === 1 ? uno : varios}`;
const minFecha = (xs: (string | null | undefined)[], def: string) => (xs.filter(Boolean).sort()[0] as string) || def;
const NIVEL: Record<Prioridad, Nivel> = { critica: "critica", alta: "atencion", media: "info", baja: "info" };
export const PESO: Record<Prioridad, number> = { critica: 0, alta: 1, media: 2, baja: 3 };
export const tipoDe = (clave: string) => TIPOS.find(t => t.clave === clave);

type Ctx = { alertas: Alerta[]; historial: Revisada[]; cargando: boolean; actualizadaA: Date | null; recargar: () => void; rolesDe: (tipo: string) => string[]; marcar: (a: Alerta, estado: "REVISADA" | "RESUELTA", nota: string) => Promise<string>; reabrir: (clave: string) => Promise<string>; guardarRegla: (tipo: string, roles: string[]) => Promise<string> };
const C = createContext<Ctx>({ alertas: [], historial: [], cargando: true, actualizadaA: null, recargar: () => {}, rolesDe: () => [], marcar: async () => "", reabrir: async () => "", guardarRegla: async () => "" });
export const useAlertas = () => useContext(C);

/** Calcula las alertas con los datos que cada persona tiene permiso de ver. Todo se calcula al momento. */
export function AlertasProvider({ children }: { children: ReactNode }) {
  const { zonas, proyectoId, zonaId, perfil } = useApp(), al = useAlcance();
  const [todas, setTodas] = useState<Alerta[]>([]), [estados, setEstados] = useState<Revisada[]>([]), [reglas, setReglas] = useState<any[]>([]), [cargando, setCargando] = useState(true), [t, setT] = useState(0), [cuando, setCuando] = useState<Date | null>(null);
  const esAdmin = perfil?.rol === "admin";

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCargando(true);
      try {
        const H = hoy(), zv = zonas.filter(z => (!proyectoId || z.proyecto_id === proyectoId) && (!zonaId || z.id === zonaId));
        const [prevIni] = rangoMes(mesAnterior(H)), [, finPrev] = rangoMes(mesAnterior(H)), sinDatos = Promise.resolve({ data: [], error: null });
        const proyDe = (zid?: string | null) => zonas.find(z => z.id === zid)?.proyecto_id || "";
        const [cobr, porv, noc, naps, resv, mant, viajes, mats, stock, inv, pinv, pre, fin, resCli, trs, fusAlt, liqPrev, pagosSocio, ords, eqs, finRev, ajustes, papelera, reg, est] = await Promise.all([
          al(supabase.from("v_cobranza").select("nombre, meses_deuda, deuda, zona_id, proyecto_id, mas_antiguo").in("estado_cuenta", ["VENCIDO", "SUSPENDIDO"]).gt("deuda", 0).order("deuda", { ascending: false }).limit(2000)),
          al(supabase.from("v_cobranza").select("nombre, zona_id, proyecto_id").eq("estado_cuenta", "POR VENCER").limit(1000)),
          al(supabase.from("clientes").select("nombre, no_cortar_hasta, zona_id").eq("no_cortar", true).neq("estado", "BAJA").not("no_cortar_hasta", "is", null).lte("no_cortar_hasta", mas(3)).order("no_cortar_hasta").limit(200)),
          al(supabase.from("v_naps_ocupacion").select("*").limit(800)),
          al(supabase.from("v_reservas_vencidas").select("*").limit(200)),
          al(supabase.from("mantenimientos").select("objeto, referencia, problema, fecha_programada, estado, zona_id").in("estado", ["PENDIENTE", "EN PROCESO", "PAUSADO"]).limit(500)),
          al(supabase.from("viajes").select("tipo, detalle, fecha_inicio, fecha_fin, estado, zona_id").in("estado", ["PROGRAMADO", "EN EJECUCION", "PAUSADO"]).limit(300)),
          al(supabase.from("materiales").select("id, nombre, minimo, unidad, proyecto_id").gt("minimo", 0).limit(800), false),
          al(supabase.from("stock").select("material_id, cantidad").limit(8000), false),
          al(supabase.from("inversores").select("id, nombre, monto, interes, periodo_interes, plazo_meses, fecha_inicio, zona_id").limit(300)),
          al(supabase.from("pagos_inversores").select("inversor_id, monto").limit(5000), false),
          al(supabase.from("presupuesto_lineas").select("zona_id, tipo, cantidad, monto_unitario, periodo").limit(3000)),
          al(supabase.from("fin_movimientos").select("zona_id, tipo, monto").in("tipo", ["INVERSION", "GASTO_OPERATIVO"]).not("zona_id", "is", null).limit(5000)),
          al(supabase.from("v_cobranza_resumen").select("zona_id, estado_cuenta, clientes")),
          al(supabase.from("v_troncales_resumen").select("codigo, zona_id, total, libres, danados").limit(300)),
          al(supabase.from("v_fusiones").select("troncal_codigo, hilo_entrada, perdida_db, zona_id").gt("perdida_db", 0.3).limit(150)),
          esAdmin ? al(supabase.from("v_liquidaciones").select("zona_id").eq("estado", "CONFIRMADA").eq("periodo", prevIni).limit(500)) : sinDatos,
          esAdmin ? (() => { let q = supabase.from("v_reparto_socios").select("socio_nombre, zona_id, monto, periodo, fecha_reparto").eq("estado", "CONFIRMADA").is("pagado_en", null).lt("fecha_reparto", mas(-15)).limit(100); if (zonaId) q = q.eq("zona_id", zonaId); return q; })() : sinDatos,
          al(supabase.from("ordenes_trabajo").select("id, tipo, fecha_programada, zona_id, proyecto_id, estado, creado_en").in("estado", ["PROGRAMADA", "EN PROCESO"]).limit(1000)),
          al(supabase.from("equipos_serie").select("id, serie, modelo, estado, almacen_id, cliente_id, proyecto_id").in("estado", ["PENDIENTE", "ALMACEN", "MANTENIMIENTO"]).limit(3000), false),
          al(supabase.from("fin_movimientos").select("id, fecha, tipo, categoria, descripcion, monto, zona_id, proyecto_id").in("tipo", ["INVERSION", "GASTO_OPERATIVO"]).gt("monto", 500).is("viaje_id", null).order("fecha", { ascending: false }).limit(300)),
          al(supabase.from("movimientos").select("id, fecha, tipo, cantidad, proyecto_id, materiales(nombre, unidad)").in("tipo", ["BAJA", "AJUSTE_NEGATIVO", "AJUSTE_POSITIVO"]).gte("fecha", mas(-30)).order("fecha", { ascending: false }).limit(100), false),
          esAdmin ? supabase.rpc("listar_papelera") : sinDatos,
          supabase.from("alertas_reglas").select("tipo, rol, activo"),
          al(supabase.from("alertas_estado").select("*").order("fecha", { ascending: false }).limit(800), false),
        ]);
        const A: Alerta[] = [];
        const add = (a: { tipo: string; prioridad: Prioridad; fecha?: string; zona_id?: string | null; proyecto_id?: string; descripcion: string; detalle?: string[]; ruta: string; clave?: string }) => {
          const tp = tipoDe(a.tipo)!, proy = a.proyecto_id || proyDe(a.zona_id) || "";
          A.push({ id: a.clave || `${a.tipo}:${a.zona_id || proy}`, tipo: a.tipo, prioridad: a.prioridad, nivel: NIVEL[a.prioridad], area: tp.area, fecha: a.fecha || H, proyecto_id: proy, zona_id: a.zona_id || null, descripcion: a.descripcion, titulo: a.descripcion, detalle: a.detalle || [], ruta: a.ruta, firma: a.descripcion });
        };
        /** Una alerta por zona (o por proyecto si no hay zona). */
        const porZona = <T,>(rows: T[], zid: (x: T) => string | null | undefined, pid: (x: T) => string | undefined, f: (xs: T[]) => { prioridad: Prioridad; descripcion: string; detalle?: string[]; fecha?: string } | null, tipo: string, ruta: string) => {
          const g = new Map<string, T[]>(); rows.forEach(x => { const k = zid(x) ? "z:" + zid(x) : "p:" + (pid(x) || ""); g.set(k, [...(g.get(k) || []), x]); });
          g.forEach((xs, k) => { const r = f(xs); if (r) add({ tipo, ruta, zona_id: k.startsWith("z:") ? k.slice(2) : null, proyecto_id: k.startsWith("p:") ? k.slice(2) || undefined : undefined, ...r }); });
        };
        const activos: Record<string, number> = {}; dat(resCli).filter(x => x.estado_cuenta !== "BAJA").forEach(x => { activos[x.zona_id] = (activos[x.zona_id] || 0) + n(x.clientes); });
        const abiertas = dat(ords);

        // ---------- COBRANZA ----------
        porZona(dat(porv), x => x.zona_id, x => x.proyecto_id, xs => ({ prioridad: "media", descripcion: `${pl(xs.length, "cliente próximo a vencer", "clientes próximos a vencer")} (5 días o menos).`, detalle: lista(xs.map(x => x.nombre)) }), "prox_vencer", "cobranzas");
        porZona(dat(cobr), x => x.zona_id, x => x.proyecto_id, xs => { const act = activos[xs[0].zona_id] || 0, crit = act > 0 && xs.length / act >= 0.3; return { prioridad: crit ? "critica" : "alta", descripcion: `${xs.length} cliente(s) con deuda.`, fecha: minFecha(xs.map(x => x.mas_antiguo), H), detalle: lista(xs.map(x => `${x.nombre} · ${n(x.meses_deuda)} ${n(x.meses_deuda) === 1 ? "mes" : "meses"} · ${bs(x.deuda)}`)) }; }, "deuda", "cobranzas");
        const NC = dat(noc);
        porZona(NC.filter(x => x.no_cortar_hasta < H), x => x.zona_id, () => undefined, xs => ({ prioridad: "alta", descripcion: `${pl(xs.length, "cliente con “No cortar” vencido", "clientes con “No cortar” vencido")}.`, fecha: minFecha(xs.map(x => x.no_cortar_hasta), H), detalle: lista(xs.map(x => `${x.nombre} · venció el ${x.no_cortar_hasta}`)) }), "nocortar_venc", "cobranzas");
        porZona(NC.filter(x => x.no_cortar_hasta >= H), x => x.zona_id, () => undefined, xs => ({ prioridad: "baja", descripcion: `${pl(xs.length, "“No cortar” termina", "“No cortar” terminan")} en 3 días o menos.`, detalle: lista(xs.map(x => `${x.nombre} · hasta el ${x.no_cortar_hasta}`)) }), "nocortar_prox", "cobranzas");

        // ---------- OPERACIÓN ----------
        const instPend = abiertas.filter(o => o.tipo === "Instalación");
        porZona(instPend, x => x.zona_id, x => x.proyecto_id, xs => ({ prioridad: xs.some(x => x.fecha_programada && x.fecha_programada < H) ? "alta" : "media", descripcion: `${pl(xs.length, "instalación pendiente", "instalaciones pendientes")}.`, fecha: minFecha(xs.map(x => x.fecha_programada || String(x.creado_en).slice(0, 10)), H) }), "inst_pend", "servicios");
        const M = dat(mant);
        porZona(M, x => x.zona_id, () => undefined, xs => ({ prioridad: xs.some(x => x.fecha_programada && x.fecha_programada < H) ? "alta" : "media", descripcion: `${pl(xs.length, "mantenimiento pendiente", "mantenimientos pendientes")}.`, fecha: minFecha(xs.map(x => x.fecha_programada), H), detalle: lista(xs.map(x => `${x.objeto}${x.referencia ? " " + x.referencia : ""} · ${x.problema || ""}${x.fecha_programada && x.fecha_programada < H ? ` · ${dias(H, x.fecha_programada)} día(s) de atraso` : ""}`)) }), "mant_pend", "servicios");
        const atrasadas = abiertas.filter(o => o.fecha_programada && o.fecha_programada < H);
        porZona(atrasadas, x => x.zona_id, x => x.proyecto_id, xs => ({ prioridad: xs.length > 3 ? "critica" : "alta", descripcion: `${pl(xs.length, "orden de trabajo atrasada", "órdenes de trabajo atrasadas")}.`, fecha: minFecha(xs.map(x => x.fecha_programada), H), detalle: lista(xs.map(x => `${x.tipo} · para el ${x.fecha_programada}`)) }), "ordenes_atrasadas", "servicios");
        const Vj = dat(viajes), nomV = (x: any) => `${x.tipo || "Viaje"}${x.detalle ? " (" + x.detalle + ")" : ""}`;
        porZona(Vj.filter(x => x.estado === "EN EJECUCION" && x.fecha_fin < H), x => x.zona_id, () => undefined, xs => ({ prioridad: "alta", descripcion: `${pl(xs.length, "viaje sin cerrar", "viajes sin cerrar")}.`, fecha: minFecha(xs.map(x => x.fecha_fin), H), detalle: lista(xs.map(x => `${nomV(x)} · debió terminar el ${x.fecha_fin}`)) }), "viaje_sin_cerrar", "servicios");
        porZona(Vj.filter(x => x.estado === "PROGRAMADO" && x.fecha_inicio < H), x => x.zona_id, () => undefined, xs => ({ prioridad: "media", descripcion: `${pl(xs.length, "viaje programado que no se inició", "viajes programados que no se iniciaron")}.`, fecha: minFecha(xs.map(x => x.fecha_inicio), H), detalle: lista(xs.map(x => `${nomV(x)} · debía empezar el ${x.fecha_inicio}`)) }), "viaje_no_inicio", "servicios");
        porZona(Vj.filter(x => x.estado === "PROGRAMADO" && x.fecha_inicio >= H && x.fecha_inicio <= mas(3)), x => x.zona_id, () => undefined, xs => ({ prioridad: "baja", descripcion: `${pl(xs.length, "viaje empieza", "viajes empiezan")} en 3 días o menos.`, fecha: minFecha(xs.map(x => x.fecha_inicio), H), detalle: lista(xs.map(x => `${nomV(x)} · ${x.fecha_inicio}`)) }), "viaje_prox", "servicios");

        // ---------- RED ----------
        const N = dat(naps), llenas = N.filter(x => n(x.libres) === 0 && n(x.total) > 0), casi = N.filter(x => n(x.libres) > 0 && n(x.libres) <= Math.max(1, Math.floor(n(x.total) * 0.1))), dan = N.filter(x => n(x.danados) > 0);
        porZona(llenas, x => x.zona_id, x => x.proyecto_id, xs => ({ prioridad: "alta", descripcion: `${pl(xs.length, "NAP sin puertos libres", "NAP sin puertos libres")}.`, detalle: lista(xs.map(x => `${x.codigo} · ${n(x.ocupados)} ocupados, ${n(x.reservados)} reservados`)) }), "nap_llena", "red");
        porZona(casi, x => x.zona_id, x => x.proyecto_id, xs => ({ prioridad: "media", descripcion: `${pl(xs.length, "NAP casi llena", "NAP casi llenas")}.`, detalle: lista(xs.map(x => `${x.codigo} · quedan ${n(x.libres)} de ${n(x.total)} puertos`)) }), "nap_casi", "red");
        porZona(dan, x => x.zona_id, x => x.proyecto_id, xs => ({ prioridad: "media", descripcion: `${pl(xs.reduce((s, x) => s + n(x.danados), 0), "puerto dañado", "puertos dañados")} en ${pl(xs.length, "NAP", "NAP")}.`, detalle: lista(xs.map(x => `${x.codigo} · ${n(x.danados)} dañado(s)`)) }), "puertos_dan", "red");
        porZona(dat(resv), x => x.zona_id, x => x.proyecto_id, xs => ({ prioridad: "media", descripcion: `${pl(xs.length, "reserva de puerto vencida", "reservas de puerto vencidas")}.`, fecha: minFecha(xs.map(x => x.reservado_hasta), H), detalle: lista(xs.map(x => `${x.nap} puerto ${x.numero} · ${x.reservado_para || "sin nombre"} · venció el ${x.reservado_hasta}`)) }), "reserva_venc", "red");
        const TR = dat(trs);
        porZona(TR.filter(x => n(x.libres) <= 2), x => x.zona_id, () => undefined, xs => ({ prioridad: xs.some(x => n(x.libres) === 0) ? "critica" : "alta", descripcion: `${pl(xs.length, "troncal casi sin hilos libres", "troncales casi sin hilos libres")}.`, detalle: lista(xs.map(x => `${x.codigo} · quedan ${n(x.libres)} de ${n(x.total)} hilos`)) }), "tron_libres", "red");
        porZona(TR.filter(x => n(x.danados) > 0), x => x.zona_id, () => undefined, xs => ({ prioridad: "media", descripcion: `${pl(xs.reduce((s, x) => s + n(x.danados), 0), "hilo dañado", "hilos dañados")}.`, detalle: lista(xs.map(x => `${x.codigo} · ${n(x.danados)} dañado(s)`)) }), "tron_dan", "red");
        porZona(dat(fusAlt), x => x.zona_id, () => undefined, xs => ({ prioridad: "media", descripcion: `${pl(xs.length, "fusión con pérdida alta", "fusiones con pérdida alta")}.`, detalle: lista(xs.map(x => `${x.troncal_codigo} · hilo ${x.hilo_entrada} · ${n(x.perdida_db).toFixed(2)} dB`)) }), "fus_alta", "red");

        // ---------- INVENTARIO ----------
        const stockTot: Record<string, number> = {}; dat(stock).forEach(s => { stockTot[s.material_id] = (stockTot[s.material_id] || 0) + n(s.cantidad); });
        const bajos = dat(mats).map(m => ({ ...m, tiene: stockTot[m.id] || 0 })).filter(m => m.tiene < n(m.minimo));
        porZona(bajos, () => null, x => x.proyecto_id, xs => ({ prioridad: xs.some(m => m.tiene <= 0) ? "alta" : "media", descripcion: `${pl(xs.length, "producto con stock bajo", "productos con stock bajo")}.`, detalle: lista([...xs].sort((a, b) => a.tiene - b.tiene).map(m => `${m.nombre} · hay ${m.tiene} ${m.unidad}, mínimo ${n(m.minimo)}`)) }), "stock_bajo", "inventario");
        const E = dat(eqs), nomE = (x: any) => `${x.modelo || "Equipo"} · ${x.serie}`;
        porZona(E.filter(x => x.estado === "PENDIENTE"), () => null, x => x.proyecto_id, xs => ({ prioridad: "alta", descripcion: `${pl(xs.length, "equipo pendiente de recuperación", "equipos pendientes de recuperación")}.`, detalle: lista(xs.map(nomE)) }), "eq_recuperar", "inventario");
        porZona(E.filter(x => ["ALMACEN", "MANTENIMIENTO"].includes(x.estado) && !x.almacen_id && !x.cliente_id), () => null, x => x.proyecto_id, xs => ({ prioridad: "media", descripcion: `${pl(xs.length, "equipo sin ubicación registrada", "equipos sin ubicación registrada")}.`, detalle: lista(xs.map(nomE)) }), "eq_sin_ubicacion", "inventario");

        // ---------- FINANZAS ----------
        dat(finRev).forEach(x => add({ tipo: "inv_gasto", clave: "inv_gasto:" + x.id, prioridad: n(x.monto) > 5000 ? "alta" : "media", fecha: x.fecha, zona_id: x.zona_id, proyecto_id: x.proyecto_id, ruta: "finanzas", descripcion: `${x.tipo === "INVERSION" ? "Inversión (CAPEX)" : "Gasto operativo"} · ${x.categoria || x.descripcion || "sin categoría"} · ${bs(x.monto)} pendiente de revisión.` }));
        dat(ajustes).forEach(x => add({ tipo: "cambios_criticos", clave: "cambio_inv:" + x.id, prioridad: "alta", fecha: String(x.fecha).slice(0, 10), proyecto_id: x.proyecto_id, ruta: "inventario", descripcion: `Inventario: ${x.tipo === "BAJA" ? "baja" : x.tipo === "AJUSTE_NEGATIVO" ? "ajuste hacia abajo" : "ajuste hacia arriba"} de ${n(x.cantidad)} ${x.materiales?.unidad || ""} de ${x.materiales?.nombre || "un material"} por autorizar.` }));
        dat(papelera).filter(x => x.tabla === "troncales" && String(x.eliminado_en).slice(0, 10) >= mas(-30)).forEach(x => add({ tipo: "cambios_criticos", clave: "cambio_tron:" + x.id, prioridad: "alta", fecha: String(x.eliminado_en).slice(0, 10), proyecto_id: x.proyecto_id, ruta: "papelera", descripcion: `Troncal ${x.datos?.codigo || ""} mandada a la papelera${x.eliminado_por ? " por " + x.eliminado_por : ""}: por autorizar.` }));

        const pagado: Record<string, number> = {}; dat(pinv).forEach(p => { pagado[p.inversor_id] = (pagado[p.inversor_id] || 0) + n(p.monto); });
        const atras = dat(inv).map(x => {
          const interes = n(x.monto) * (n(x.interes) / 100) * (x.periodo_interes === "anual" ? n(x.plazo_meses) / 12 : n(x.plazo_meses)), cuota = (n(x.monto) + interes) / (n(x.plazo_meses) || 1);
          const meses = Math.min(n(x.plazo_meses), Math.max(0, mesesEntre(x.fecha_inicio, H))), debe = cuota * meses - (pagado[x.id] || 0);
          return { ...x, cuota, debe };
        }).filter(x => x.cuota > 0 && x.debe > x.cuota * 0.5);
        porZona(atras, x => x.zona_id, () => undefined, xs => ({ prioridad: xs.some(x => x.debe >= x.cuota * 2) ? "critica" : "alta", descripcion: `${pl(xs.length, "inversor con pagos atrasados", "inversores con pagos atrasados")}.`, detalle: lista(xs.map(x => `${x.nombre} · atraso de ${bs(x.debe)}`)) }), "inversor_atrasado", "finanzas");

        zv.filter(z => n(z.meta_clientes) > 0 && z.fecha_meta).forEach(z => {
          const a = activos[z.id] || 0, total = Math.max(1, mesesEntre(z.fecha_inicio, z.fecha_meta)), pasados = Math.max(0, mesesEntre(z.fecha_inicio, H)), esperado = n(z.meta_clientes) * Math.min(1, pasados / total);
          if (H > z.fecha_meta && a < n(z.meta_clientes)) add({ tipo: "meta", clave: "meta:" + z.id, prioridad: "critica", fecha: z.fecha_meta, zona_id: z.id, ruta: "dashboard", descripcion: `Meta vencida sin cumplir: ${a} de ${z.meta_clientes} clientes (era para el ${z.fecha_meta}).` });
          else if (pasados >= 1 && a < esperado * 0.7) add({ tipo: "meta", clave: "meta:" + z.id, prioridad: "alta", zona_id: z.id, ruta: "dashboard", descripcion: `Va lenta para su meta: ${a} de ${z.meta_clientes} clientes; se esperaban unos ${Math.round(esperado)}.` });
        });
        zv.forEach(z => {
          const meses = Math.max(1, mesesEntre(z.fecha_inicio || H, H) + 1), pas: { t: string; p: Prioridad }[] = [];
          (["INVERSION", "GASTO_OPERATIVO"] as const).forEach(tp => {
            const presu = dat(pre).filter(l => l.zona_id === z.id && l.tipo === tp).reduce((s, l) => s + n(l.cantidad) * n(l.monto_unitario) * (l.periodo === "mensual" ? meses : 1), 0), real = dat(fin).filter(l => l.zona_id === z.id && l.tipo === tp).reduce((s, l) => s + n(l.monto), 0);
            if (presu > 0 && real > presu) pas.push({ p: real > presu * 1.1 ? "critica" : "alta", t: `${tp === "INVERSION" ? "inversión" : "gasto operativo"} ${bs(real)} de ${bs(presu)} presupuestados (${Math.round((real / presu) * 100)}%)` });
          });
          if (pas.length) add({ tipo: "presupuesto", zona_id: z.id, ruta: "finanzas", prioridad: pas.some(x => x.p === "critica") ? "critica" : "alta", descripcion: `Presupuesto excedido: ${pas.map(x => x.t).join("; ")}.` });
        });
        if (esAdmin) {
          const hechas = new Set(dat(liqPrev).map(x => x.zona_id)), faltan = zv.filter(z => (z.fecha_inicio || "0000") <= finPrev && !hechas.has(z.id));
          faltan.forEach(z => add({ tipo: "reparto_pend", clave: "reparto_pend:" + z.id + ":" + mesAnterior(H), zona_id: z.id, ruta: "finanzas", prioridad: +H.slice(8, 10) >= 10 ? "media" : "baja", descripcion: `Falta el reparto de ${mesAnterior(H)}.` }));
          porZona(dat(pagosSocio), x => x.zona_id, () => undefined, xs => ({ prioridad: "alta", descripcion: `${pl(xs.length, "pago a socio pendiente hace más de 15 días", "pagos a socios pendientes hace más de 15 días")}.`, fecha: minFecha(xs.map(x => x.fecha_reparto), H), detalle: lista(xs.map(x => `${x.socio_nombre} · ${bs(x.monto)} · reparto de ${String(x.periodo).slice(0, 7)}`)) }), "pago_socio", "finanzas");
        }
        A.sort((a, b) => PESO[a.prioridad] - PESO[b.prioridad] || a.fecha.localeCompare(b.fecha));
        if (!cancelado) { setTodas(A); setEstados(dat(est) as Revisada[]); setReglas(dat(reg)); setCuando(new Date()); }
      } catch { if (!cancelado) { setTodas([]); } }
      if (!cancelado) setCargando(false);
    })();
    return () => { cancelado = true; };
  }, [proyectoId, zonaId, zonas, t]);

  // se actualiza sola cada 5 minutos
  useEffect(() => { const i = setInterval(() => setT(x => x + 1), 300000); return () => clearInterval(i); }, []);

  const rolesDe = (tipo: string) => { const r = reglas.filter(x => x.tipo === tipo); return r.length ? r.filter(x => x.activo).map(x => x.rol as string) : tipoDe(tipo)?.roles || []; };
  const visible = (tipo: string) => esAdmin || rolesDe(tipo).includes(perfil?.rol || "");
  const hechas = new Map(estados.map(e => [e.clave, e]));
  const alertas = todas.filter(a => visible(a.tipo) && hechas.get(a.id)?.firma !== a.firma);
  const historial = estados.filter(e => visible(e.tipo));

  const marcar = async (a: Alerta, estado: "REVISADA" | "RESUELTA", nota: string) => {
    const { error } = await supabase.rpc("marcar_alerta", { p: { clave: a.id, proyecto_id: a.proyecto_id || null, zona_id: a.zona_id, tipo: a.tipo, prioridad: a.prioridad, descripcion: a.descripcion, fecha_alerta: a.fecha, firma: a.firma, estado, nota } });
    if (!error) setT(x => x + 1); return error ? error.message : "";
  };
  const reabrir = async (clave: string) => { const { error } = await supabase.rpc("reabrir_alerta", { p_clave: clave }); if (!error) setT(x => x + 1); return error ? error.message : ""; };
  const guardarRegla = async (tipo: string, roles: string[]) => {
    const filas = ROLES_REGLAS.map(([rol]) => ({ tipo, rol, activo: roles.includes(rol) }));
    setReglas(r => [...r.filter(x => x.tipo !== tipo), ...filas]); // se ve al instante; si falla, se vuelve a cargar
    const { error } = await supabase.from("alertas_reglas").upsert(filas, { onConflict: "tipo,rol" });
    if (error) setT(x => x + 1); return error ? error.message : "";
  };
  return <C.Provider value={{ alertas, historial, cargando, actualizadaA: cuando, recargar: () => setT(x => x + 1), rolesDe, marcar, reabrir, guardarRegla }}>{children}</C.Provider>;
}

/** Numerito rojo del menú: todas las alertas activas. */
export function ContadorAlertas() {
  const { alertas } = useAlertas(), k = alertas.length;
  return k ? <span style={{ marginLeft: 6, background: "var(--bad)", color: "#fff", borderRadius: 99, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{k}</span> : null;
}
