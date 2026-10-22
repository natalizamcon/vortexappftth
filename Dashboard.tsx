import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Cargando, Kpi, Vacio, bs, hoy, mesActual, nombreMes, sumar, useAlcance, useQuery } from "../lib/ui";

export default function Dashboard() {
  const { proyectoId, zonaId, perfil } = useApp(), al = useAlcance(), mes = mesActual();
  const conteo = (tabla: string, f: (q: any) => any) => f(al(supabase.from(tabla).select("id", { count: "exact", head: true }))).then((r: any) => ({ data: r.count ?? 0, error: r.error }));
  const activos = useQuery(() => conteo("clientes", q => q.neq("estado", "BAJA")), [proyectoId, zonaId]);
  const nuevos = useQuery(() => conteo("clientes", q => q.gte("fecha_instalacion", mes)), [proyectoId, zonaId]);
  const bajas = useQuery(() => conteo("clientes", q => q.gte("fecha_baja", mes)), [proyectoId, zonaId]);
  const mant = useQuery(() => conteo("mantenimientos", q => q.in("estado", ["PENDIENTE", "EN PROCESO", "PAUSADO"])), [proyectoId, zonaId]);
  const cob = useQuery(() => al(supabase.from("v_cobranza_resumen").select("*")), [proyectoId, zonaId]);
  const pue = useQuery(() => al(supabase.from("v_puertos_resumen").select("*")), [proyectoId, zonaId]);
  const mens = useQuery(() => al(supabase.from("v_resumen_mensual").select("*").order("mes", { ascending: false }).limit(60), false), [proyectoId]);
  if (activos.loading || cob.loading) return <Cargando />;
  const C: any[] = (cob.data as any[]) || [], P: any[] = (pue.data as any[]) || [];
  const por = (e: string) => sumar(C.filter(x => x.estado_cuenta === e), "clientes"), ocup = sumar(P.filter(x => x.estado === "OCUPADO"), "puertos"), totP = sumar(P, "puertos");
  const M: any[] = ((mens.data as any[]) || []).filter(x => x.mes <= hoy()), porMes: any = {};
  M.forEach(x => { const o = porMes[x.mes] || (porMes[x.mes] = { ing: 0, cob: 0, gas: 0, inv: 0 }); o.ing += +x.ingresos_servicio; o.cob += +x.cobrado; o.gas += +x.gastos_operativos; o.inv += +x.inversion; });
  const meses = Object.keys(porMes).sort().slice(-6), max = Math.max(1, ...meses.flatMap(m => [porMes[m].ing, porMes[m].cob, porMes[m].gas])), act = porMes[mes] || { ing: 0, cob: 0, gas: 0, inv: 0 };
  const inversion = sumar(Object.values(porMes), "inv");
  return <>
    <h1>Hola, {perfil?.nombre || "bienvenido"}</h1>
    {(activos.error || cob.error) && <Aviso tipo="mal">{activos.error || cob.error}</Aviso>}
    {zonaId && <Aviso>Con una zona elegida, el resumen por mes (abajo) se muestra del proyecto completo.</Aviso>}
    <div className="grid gk" style={{ marginBottom: 14 }}>
      <Kpi t="Inversión acumulada (CAPEX)" v={bs(inversion)} s="Infraestructura y equipos" /><Kpi t="Resultado operativo del mes" v={bs(act.ing - act.gas)} c={act.ing - act.gas >= 0 ? "var(--ok)" : "var(--bad)"} s="Ingresos del servicio − gastos operativos" />
      <Kpi t="Clientes activos" v={activos.data ?? 0} /><Kpi t="Nuevos del mes" v={nuevos.data ?? 0} /><Kpi t="Bajas del mes" v={bajas.data ?? 0} />
      <Kpi t="Cobrado del mes" v={bs(act.cob)} s="Dinero que entró" /><Kpi t="Deuda pendiente" v={bs(sumar(C.filter(x => x.estado_cuenta === "VENCIDO" || x.estado_cuenta === "SUSPENDIDO"), "deuda"))} />
      <Kpi t="Clientes vencidos" v={por("VENCIDO")} /><Kpi t="Suspendidos" v={por("SUSPENDIDO")} /><Kpi t="Ocupación de la red" v={totP ? Math.round(ocup / totP * 100) + "%" : "—"} s={ocup + " de " + totP + " puertos"} /><Kpi t="Mantenimientos pendientes" v={mant.data ?? 0} /></div>
    <div className="card"><h2>Ingresos del servicio, cobrado y gastos por mes</h2>
      {meses.length ? <><div style={{ display: "grid", gap: 10 }}>{meses.map(m => <div key={m}><div className="fila entre"><b>{nombreMes(m)}</b><span className="mute">Servicio {bs(porMes[m].ing)} · Cobrado {bs(porMes[m].cob)} · Gastos {bs(porMes[m].gas)}</span></div>
        {[["ing", "var(--lil)"], ["cob", "var(--ok)"], ["gas", "var(--late)"]].map(([k, c]) => <div key={k} className="barra-bar" style={{ marginTop: 2 }}><i style={{ width: porMes[m][k] / max * 100 + "%", background: c }} /></div>)}</div>)}</div>
        <div className="fila mute" style={{ marginTop: 8 }}><span style={{ color: "var(--lil)" }}>■ Ingreso del servicio</span><span style={{ color: "var(--ok)" }}>■ Cobrado</span><span style={{ color: "var(--late)" }}>■ Gastos operativos</span></div></> : <Vacio>Aún no hay movimientos. Se llena con los cargos, pagos y gastos que registres.</Vacio>}</div>
  </>;
}
