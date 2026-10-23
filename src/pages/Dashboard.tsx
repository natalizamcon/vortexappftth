import { ReactNode, useState } from "react";
import { useApp } from "../lib/auth";
import { useAlertas } from "../lib/alertas";
import { MiniK } from "../lib/mini";
import { Cargando, Vacio, bs, hoy } from "../lib/ui";
import { BarrasAgrupadas, BarrasH, Donut, Leyenda, Linea } from "../lib/graficos";
import { etiquetaMes, mesDesp } from "../lib/datos";
import { Prio } from "./Alertas";
import { addDias, useDashboardDatos } from "./DashboardDatos";

const ir = (ruta: string) => () => { location.hash = "#/" + ruta; };
const cap = (s: string) => s.replace(/\b\p{L}/gu, c => c.toUpperCase());
const PRESETS: [string, string][] = [["hoy", "Hoy"], ["mes", "Este mes"], ["mesAnt", "Mes anterior"], ["tres", "Últimos 3 meses"], ["anio", "Este año"], ["custom", "Rango personalizado"]];
const rangoDe = (p: string): [string, string] => { const H = hoy(), m = H.slice(0, 7); return p === "hoy" ? [H, H] : p === "mesAnt" ? [mesDesp(m, -1) + "-01", addDias(m + "-01", -1)] : p === "tres" ? [mesDesp(m, -2) + "-01", H] : p === "anio" ? [H.slice(0, 4) + "-01-01", H] : [m + "-01", H]; };
const MASA = { ok: "var(--ok)", pv: "var(--warn)", venc: "#c4651a", susp: "var(--bad)" };
const COLOR_EST: Record<string, string> = { "PAGADO": MASA.ok, "POR VENCER": MASA.pv, "VENCIDO": MASA.venc, "SUSPENDIDO": MASA.susp };
const NOMBRE_EST: Record<string, string> = { "PAGADO": "Pagado", "POR VENCER": "Por vencer", "VENCIDO": "Vencido", "SUSPENDIDO": "Suspendido" };

function Seccion({ titulo, link, ruta, children }: { titulo: string; link?: string; ruta?: string; children: ReactNode }) {
  return <section style={{ marginBottom: 18 }}><div className="fila entre" style={{ margin: "8px 0" }}><h2 style={{ margin: 0, color: "var(--lil)", fontSize: 15 }}>{titulo}</h2>{link && <a style={{ cursor: "pointer", fontSize: 13, color: "var(--acct)" }} onClick={ir(ruta!)}>{link} →</a>}</div>{children}</section>;
}
const Tarjetas = ({ children, min = 150 }: { children: ReactNode; min?: number }) => <div className="kpis-mini" style={{ gridTemplateColumns: `repeat(auto-fit,minmax(${min}px,1fr))` }}>{children}</div>;
const Peq = ({ t, v, c }: { t: string; v: ReactNode; c?: string }) => <div className="kmini" style={{ padding: "10px 14px" }}><span>{t}</span><b style={{ fontSize: 22, color: c }}>{v}</b></div>;

/** Barras horizontales con signo: rojo si el resultado es negativo. */
function BarrasConSigno({ filas }: { filas: { nombre: string; valor: number }[] }) {
  const max = Math.max(1, ...filas.map(f => Math.abs(f.valor)));
  return <div>{filas.map(f => <div key={f.nombre} style={{ marginBottom: 10 }}><div className="fila entre"><span>{f.nombre}</span><b>{bs(f.valor)}</b></div><div className="barra-estados" style={{ maxWidth: "none", height: 9 }}><i style={{ width: (Math.abs(f.valor) / max) * 100 + "%", background: f.valor < 0 ? "var(--bad)" : "var(--ok)" }} /></div></div>)}</div>;
}

export default function Dashboard() {
  const { perfil, proyectos, proyectoId, zonaId, zonas } = useApp(), { alertas } = useAlertas();
  const [preset, setPreset] = useState("mes"), [[desde, hasta], setRango] = useState<[string, string]>(rangoDe("mes")), [tab, setTab] = useState("activos"), [meses, setMeses] = useState(6);
  const { d, cargando } = useDashboardDatos(desde, hasta);
  const hora = new Date().getHours(), saludo = hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";
  const fecha = cap(new Date(hoy() + "T12:00:00").toLocaleDateString("es-BO", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  const alcance = zonaId ? "zona " + zonas.find(z => z.id === zonaId)?.nombre : proyectoId ? "proyecto " + proyectos.find(p => p.id === proyectoId)?.nombre : proyectos.length > 1 ? (perfil?.rol === "admin" ? "todos los proyectos" : "todos tus proyectos") : "tu proyecto";
  const banner = perfil?.rol === "admin" ? "Administrador principal: ve y administra todos los proyectos, usuarios y roles." : perfil?.rol === "socio" ? "Socio: ves únicamente los proyectos en los que estás incluido." : "Ves los proyectos y zonas que te asignó el administrador.";
  const cambiaPreset = (p: string) => { setPreset(p); if (p !== "custom") setRango(rangoDe(p)); };
  const nz = (id: string) => zonas.find(z => z.id === id)?.nombre || "—";

  const delta = (act: number, prev: number, hay: boolean, fmt = (x: number) => String(x)) => !hay ? "Sin período anterior comparable" : act === prev ? "Sin cambio vs período anterior" : `${act > prev ? "▲" : "▼"} ${fmt(Math.abs(act - prev))} vs período anterior`;
  const nombreTab = "Evolución del negocio";

  return <>
    <h1>Dashboard</h1>
    <div className="aviso">{banner}</div>
    <div className="card fila entre" style={{ borderLeft: "4px solid var(--lil)" }}>
      <div><h2 style={{ margin: 0, fontSize: 22 }}>{saludo}, {perfil?.nombre || "bienvenido"}</h2><div className="mute">{fecha}</div><small className="mute">Mostrando {desde} al {hasta} · {alcance}. Proyecto y zona se cambian en la barra superior.</small></div>
      <div className="fila"><span className="mute">Período</span><select value={preset} onChange={e => cambiaPreset(e.target.value)}>{PRESETS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input type="date" value={desde} max={hasta} onChange={e => { setPreset("custom"); setRango([e.target.value, hasta]); }} /><input type="date" value={hasta} min={desde} onChange={e => { setPreset("custom"); setRango([desde, e.target.value]); }} /></div></div>

    {cargando || !d ? <Cargando /> : <>
      <div className="grid g2" style={{ marginBottom: 12 }}>
        <MiniK t="Inversión acumulada (CAPEX)" v={bs(d.capex)} s={`En el período: ${bs(d.capexRango)}`} info="Todo lo invertido en infraestructura y equipos hasta hoy." ver={ir("finanzas")} />
        <MiniK t="Recuperación de la inversión" v={d.capex > 0 ? Math.round((d.recuperado / d.capex) * 100) + "%" : "—"} s={d.capex > 0 ? `Recuperado ${bs(d.recuperado)} · Falta ${bs(Math.max(0, d.capex - d.recuperado))}` : "Aún no hay inversión registrada"} clase="acc" info="Ingresos menos gastos operativos acumulados, contra lo invertido." ver={ir("finanzas")} /></div>
      <Tarjetas min={140}>
        <MiniK t="Clientes activos" v={d.activosAhora} s="Servicios activos" s2={delta(d.activosFin, d.activosPrev, d.hayPrev)} info="Clientes con servicio al final del período." ver={ir("clientes")} />
        <MiniK t="Cobranza del período" v={d.cobradoRango ? bs(d.cobradoRango) : "—"} s={d.cobradoRango ? "Pagos recibidos en el período" : "Aún no hay pagos registrados."} info="Dinero que entró en las fechas elegidas." ver={ir("cobranzas")} />
        <MiniK t="Deuda pendiente" v={bs(d.deudaTotal)} s={`${d.nDeudores} cliente${d.nDeudores === 1 ? "" : "s"}`} s2="Sin período anterior comparable" info="Lo que deben los clientes vencidos o suspendidos." ver={ir("cobranzas")} />
        <MiniK t="Resultado operativo" v={bs(d.resR)} color={d.resR >= 0 ? "var(--ok)" : "var(--bad)"} s={`Ingresos ${bs(d.ingR)} · Gastos ${bs(d.gasR)}`} s2={d.hayPrevRes ? `${d.resR >= d.resP ? "▲" : "▼"} vs período anterior (${bs(d.resP)})` : "Sin período anterior comparable"} info="Ingresos reconocidos menos gastos operativos de los meses del período." ver={ir("finanzas")} />
        <MiniK t="Nuevos clientes" v={d.nuevos} s="Altas del período" s2={delta(d.nuevos, d.nuevosPrev, true)} info="Instalaciones dentro de las fechas elegidas." ver={ir("clientes")} />
        <MiniK t="Bajas" v={d.bajas} s="Cancelaciones" s2={delta(d.bajas, d.bajasPrev, true)} info="Clientes dados de baja dentro de las fechas elegidas." ver={ir("clientes")} />
        <MiniK t="Crecimiento neto" v={d.nuevos - d.bajas} color={d.nuevos - d.bajas >= 0 ? "var(--ok)" : "var(--bad)"} s={`${d.nuevos} altas − ${d.bajas} bajas`} info="Altas menos bajas del período." ver={ir("clientes")} />
        <MiniK t="Trabajos pendientes" v={d.ops.instPend + d.ops.mantAb + d.ops.bajasPend} s={`${d.ops.instPend} instalaciones · ${d.ops.mantAb} mantenimientos · ${d.ops.bajasPend} órdenes`} s2="Estado actual" info="Instalaciones, mantenimientos y bajas por hacer." ver={ir("servicios")} /></Tarjetas>

      <h2 style={{ color: "var(--lil)", fontSize: 15, margin: "10px 0 8px" }}>{nombreTab}</h2>
      <div className="grid g2" style={{ alignItems: "start", marginBottom: 14 }}>
        <div className="card"><div className="fila entre" style={{ marginBottom: 6 }}>
          <div className="subtabs" style={{ margin: 0 }}>{[["activos", "Clientes activos"], ["nb", "Nuevos y bajas"], ["cobranza", "Cobranza mensual"], ["ingresos", "Ingresos reconocidos"]].map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
          <select value={meses} onChange={e => setMeses(+e.target.value)}>{[3, 6, 12, 24].map(m => <option key={m} value={m}>Últimos {m} meses</option>)}</select></div>
          {(() => { const ms = d.serie(meses), et = ms.map(etiquetaMes), pm = d.porMes(ms);
            if (tab === "activos") return <Linea etiquetas={et} series={[{ nombre: "Clientes activos", color: "var(--lil)", datos: ms.map((m: string) => d.clientes.filter((c: any) => d.activoEn(c, m === d.mesB ? d.H : addDias(mesDesp(m, 1) + "-01", -1))).length) }]} />;
            if (tab === "nb") return <><BarrasAgrupadas alto={200} fmt={v => String(v)} etiquetas={et} series={[{ nombre: "Nuevos", color: "var(--ok)", datos: ms.map((m: string) => d.clientes.filter((c: any) => c.fecha_instalacion?.slice(0, 7) === m).length) }, { nombre: "Bajas", color: "var(--bad)", datos: ms.map((m: string) => d.clientes.filter((c: any) => c.fecha_baja?.slice(0, 7) === m).length) }]} /><Leyenda items={[{ nombre: "Nuevos", color: "var(--ok)" }, { nombre: "Bajas", color: "var(--bad)" }]} /></>;
            if (tab === "cobranza") return <><BarrasAgrupadas alto={200} etiquetas={et} series={[{ nombre: "Facturado", color: "var(--lil)", datos: pm.map((x: any) => x.serv) }, { nombre: "Cobrado", color: "var(--ok)", datos: pm.map((x: any) => x.cob) }]} /><Leyenda items={[{ nombre: "Facturado", color: "var(--lil)" }, { nombre: "Cobrado", color: "var(--ok)" }]} /></>;
            return <Linea etiquetas={et} series={[{ nombre: "Ingresos reconocidos", color: "var(--acc)", datos: pm.map((x: any) => x.ing) }]} />; })()}</div>
        <div className="card"><div className="fila entre"><h2 style={{ margin: 0 }}>Alertas prioritarias</h2><a style={{ cursor: "pointer", fontSize: 13, color: "var(--acct)" }} onClick={ir("alertas")}>Centro de alertas →</a></div>
          {alertas.length ? alertas.slice(0, 6).map(a => <div key={a.id} className="fila entre" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}><div><Prio p={a.prioridad} /> {a.descripcion}<br /><small className="mute">{a.fecha}{a.zona_id ? " · " + nz(a.zona_id) : ""}</small></div><a style={{ cursor: "pointer", fontSize: 13, color: "var(--acct)", whiteSpace: "nowrap" }} onClick={ir(a.ruta)}>Resolver →</a></div>) : <p className="mute">No hay alertas activas.</p>}</div></div>

      <Seccion titulo="Cobranzas" link="Abrir cobranzas" ruta="cobranzas">
        <div className="grid g2" style={{ marginBottom: 12 }}>
          <div className="card"><h2>Distribución de clientes por estado de cuenta</h2>{(() => { const tot = d.estados.reduce((s: number, x: any) => s + x.k, 0); return tot ? <><Donut fmt={v => String(v)} partes={d.estados.filter((x: any) => x.k > 0).map((x: any) => ({ nombre: NOMBRE_EST[x.e], valor: x.k, color: COLOR_EST[x.e] }))} /><p className="mute" style={{ margin: "6px 0 0" }}>Cantidad y porcentaje de clientes; los dados de baja no se incluyen.</p></> : <Vacio>Aún no hay clientes.</Vacio>; })()}</div>
          <div className="card"><h2>Cobrado contra esperado por mes (Bs)</h2>{d.porMes(d.serie(6)).some((x: any) => x.cob > 0) ? <><BarrasAgrupadas alto={200} etiquetas={d.serie(6).map(etiquetaMes)} series={[{ nombre: "Esperado", color: "var(--lil)", datos: d.porMes(d.serie(6)).map((x: any) => x.serv) }, { nombre: "Cobrado", color: "var(--ok)", datos: d.porMes(d.serie(6)).map((x: any) => x.cob) }]} /><Leyenda items={[{ nombre: "Esperado", color: "var(--lil)" }, { nombre: "Cobrado", color: "var(--ok)" }]} /></> : <p className="mute">Aún no hay pagos registrados: se mostrará cuando existan cobros.</p>}</div></div>
        <Tarjetas min={130}><Peq t="Total cobrado" v={bs(d.cobradoRango)} /><Peq t="Total pendiente" v={bs(d.deudaTotal)} /><Peq t="Pagos parciales" v={d.parciales} /><Peq t="Pagos anticipados" v={bs(d.anticipado)} /><Peq t="Porcentaje de cobranza" v={d.pctCobranza === null ? "—" : d.pctCobranza + "%"} /><Peq t="Clientes vencidos" v={d.venc} /></Tarjetas>
        <div className="card tw"><h2>Clientes con deuda</h2>{d.deudores.length ? <table><thead><tr><th>Código</th><th>Cliente</th><th>Zona</th><th>Pendiente</th><th>Antigüedad</th><th>Estado</th></tr></thead>
          <tbody>{d.deudores.slice(0, 8).map((c: any) => <tr key={c.cliente_id}><td>{c.codigo}</td><td>{c.nombre}</td><td>{nz(c.zona_id)}</td><td><b>{bs(c.deuda)}</b></td><td>{c.mas_antiguo ? Math.max(0, Math.round((+new Date(d.H + "T12:00:00") - +new Date(c.mas_antiguo + "T12:00:00")) / 86400000)) + " días" : "—"}</td><td><span className={"pill " + (c.estado_cuenta === "SUSPENDIDO" ? "bad" : "alta")}>{c.estado_cuenta === "SUSPENDIDO" ? "Suspendido" : "En mora"}</span></td></tr>)}</tbody></table> : <p className="mute">Ningún cliente con deuda.</p>}
          {d.deudores.length > 8 && <p className="mute" style={{ margin: "6px 0 0" }}>y {d.deudores.length - 8} más. <a style={{ cursor: "pointer" }} onClick={ir("cobranzas")}>Verlos en Cobranzas</a></p>}</div></Seccion>

      <Seccion titulo="Finanzas" link="Abrir finanzas" ruta="finanzas">
        <Tarjetas min={160}><Peq t="Resultado operativo (OPEX)" v={bs(d.resR)} c={d.resR >= 0 ? "var(--ok)" : "var(--bad)"} /><Peq t="Gastos operativos del mes" v={bs(d.porMes([d.mesB])[0].gas)} /><Peq t="Inversiones realizadas (CAPEX)" v={bs(d.capex)} /><Peq t="Capital recuperado" v={bs(Math.max(0, d.recuperado))} /></Tarjetas>
        <Tarjetas min={160}><Peq t="Ingresos reconocidos (período)" v={bs(d.ingR)} /><Peq t="Margen operativo" v={d.ingR > 0 ? Math.round((d.resR / d.ingR) * 100) + "%" : "—"} c={d.resR >= 0 ? undefined : "var(--bad)"} /><Peq t="Falta recuperar" v={bs(Math.max(0, d.capex - d.recuperado))} /><Peq t="Meses para recuperar" v={(() => { const m6 = d.porMes(d.serie(6)), prom = m6.reduce((s: number, x: any) => s + x.ing - x.gas, 0) / 6; return prom > 0 && d.capex > d.recuperado ? Math.ceil((d.capex - d.recuperado) / prom) : "—"; })()} /></Tarjetas>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", marginBottom: 12 }}>
          <div className="card"><h2>Ingresos reconocidos y gastos operativos por mes (Bs)</h2><BarrasAgrupadas alto={190} etiquetas={d.serie(6).map(etiquetaMes)} series={[{ nombre: "Ingresos reconocidos", color: "var(--lil)", datos: d.porMes(d.serie(6)).map((x: any) => x.ing) }, { nombre: "Gastos operativos", color: "var(--acc)", datos: d.porMes(d.serie(6)).map((x: any) => x.gas) }]} /><Leyenda items={[{ nombre: "Ingresos reconocidos", color: "var(--lil)" }, { nombre: "Gastos operativos", color: "var(--acc)" }]} /></div>
          <div className="card"><h2>Resultado operativo por mes (Bs)</h2><Linea etiquetas={d.serie(6).map(etiquetaMes)} series={[{ nombre: "Resultado", color: "var(--ok)", datos: d.porMes(d.serie(6)).map((x: any) => x.ing - x.gas) }]} /></div>
          <div className="card"><h2>Distribución de gastos operativos de {etiquetaMes(d.mesB).split(" ")[0]} (Bs)</h2>{d.cats.length ? <BarrasH filas={d.cats.slice(0, 6).map(([nombre, valor]: [string, number]) => ({ nombre, valor }))} /> : <p className="mute">Sin gastos operativos en este mes.</p>}<p className="mute" style={{ margin: "6px 0 0" }}>Solo OPEX. Las inversiones (CAPEX) van aparte.</p></div>
          <div className="card"><h2>Resultado por proyecto de {etiquetaMes(d.mesB).split(" ")[0]} (Bs)</h2>{d.porProyecto.length ? <BarrasConSigno filas={d.porProyecto.map((p: any) => ({ nombre: p.etiqueta, valor: p.valor }))} /> : <p className="mute">Sin datos.</p>}</div></div></Seccion>

      <Seccion titulo="Red FTTH" link="Abrir mapa de red" ruta="red">
        {(() => { const N = d.naps, tot = N.reduce((s: number, x: any) => s + Number(x.total || 0), 0), oc = N.reduce((s: number, x: any) => s + Number(x.ocupados || 0), 0), li = N.reduce((s: number, x: any) => s + Number(x.libres || 0), 0), re = N.reduce((s: number, x: any) => s + Number(x.reservados || 0), 0), da = N.reduce((s: number, x: any) => s + Number(x.danados || 0), 0);
          const top = [...N].filter((x: any) => Number(x.total) > 0).sort((a: any, b: any) => b.ocupados / b.total - a.ocupados / a.total).slice(0, 5);
          const alertasTec = [...N.filter((x: any) => x.danados > 0).map((x: any) => ({ el: x.codigo, a: `${x.danados} puerto(s) dañado(s)`, z: x.zona_id })), ...Object.entries(d.falla).map(([nap, k]: [string, any]) => ({ el: nap, a: `${k} falla(s) registrada(s)`, z: N.find((x: any) => x.codigo === nap)?.zona_id }))];
          return <>
            <Tarjetas min={130}><Peq t="NAP registradas" v={N.length} /><Peq t="Total de puertos" v={tot} /><Peq t="Ocupados" v={oc} /><Peq t="Libres" v={li} /><Peq t="Reservados" v={re} /><Peq t="Dañados" v={da} /><Peq t="Ocupación de la red" v={tot ? Math.round((oc / tot) * 100) + "%" : "—"} /><Peq t="Mantenimientos de red pendientes" v={d.mantRedPend} /></Tarjetas>
            <div className="grid g2" style={{ marginBottom: 12 }}>
              <div className="card"><h2>Ocupación de puertos</h2>{tot ? <Donut fmt={v => String(v)} partes={[{ nombre: "Ocupados", valor: oc, color: "var(--lil)" }, { nombre: "Libres", valor: li, color: "var(--ok)" }, { nombre: "Reservados", valor: re, color: "var(--warn)" }, { nombre: "Dañados", valor: da, color: "var(--bad)" }].filter(x => x.valor > 0)} /> : <Vacio>Aún no hay puertos.</Vacio>}</div>
              <div className="card"><h2>NAP con mayor ocupación (puertos)</h2>{top.length ? <BarrasH filas={top.map((x: any) => ({ nombre: x.codigo, valor: Math.round((x.ocupados / x.total) * 100), extra: `${x.ocupados} de ${x.total} (${Math.round((x.ocupados / x.total) * 100)}%)` }))} /> : <Vacio>Aún no hay NAP.</Vacio>}</div></div>
            <div className="card tw"><h2>Alertas técnicas</h2>{alertasTec.length ? <table><thead><tr><th>Elemento</th><th>Alerta</th><th>Zona</th><th /></tr></thead><tbody>{alertasTec.slice(0, 8).map((x, i) => <tr key={i}><td>{x.el}</td><td>{x.a}</td><td>{x.z ? nz(x.z) : "—"}</td><td><a style={{ cursor: "pointer" }} onClick={ir("red")}>Ver →</a></td></tr>)}</tbody></table> : <p className="mute">Sin alertas técnicas.</p>}</div></>; })()}</Seccion>

      <Seccion titulo="Operaciones" link="Abrir panel operativo" ruta="servicios">
        <Tarjetas min={120}><Peq t="Instalaciones pendientes" v={d.ops.instPend} /><Peq t="Instalaciones en proceso" v={d.ops.instProc} /><Peq t="Instalaciones completadas" v={d.ops.instComp} /><Peq t="Mantenimientos abiertos" v={d.ops.mantAb} /><Peq t="Mantenimientos en proceso" v={d.ops.mantProc} /><Peq t="Mantenimientos resueltos" v={d.ops.mantComp} /><Peq t="Órdenes atrasadas" v={d.ops.atrasadas} c={d.ops.atrasadas ? "var(--bad)" : undefined} /><Peq t="Bajas pendientes de procesar" v={d.ops.bajasPend} /><Peq t="Equipos por recuperar" v={d.ops.eqRec} /></Tarjetas>
        <div className="grid g2" style={{ marginBottom: 12, alignItems: "start" }}>
          <div className="card"><h2>Trabajos por estado (cantidad)</h2><BarrasAgrupadas alto={190} fmt={v => String(v)} etiquetas={["Pendiente", "En proceso", "Completado (período)"]} series={[{ nombre: "Instalaciones", color: "var(--lil)", datos: [d.ops.instPend, d.ops.instProc, d.ops.instComp] }, { nombre: "Mantenimientos", color: "var(--acc)", datos: [d.ops.mantPend, d.ops.mantProc, d.ops.mantComp] }, { nombre: "Otros (bajas, reasignaciones)", color: "var(--warn)", datos: [d.ops.bajasPend - d.ops.bajasProc, d.ops.bajasProc, d.ops.bajasComp] }]} /><Leyenda items={[{ nombre: "Instalaciones", color: "var(--lil)" }, { nombre: "Mantenimientos", color: "var(--acc)" }, { nombre: "Otros (bajas, reasignaciones)", color: "var(--warn)" }]} /></div>
          <div className="card"><h2>Trabajos abiertos por técnico</h2>{Object.keys(d.tec).length ? <BarrasH filas={Object.entries(d.tec).sort((a: any, b: any) => b[1] - a[1]).slice(0, 8).map(([nombre, valor]: [string, any]) => ({ nombre, valor, extra: String(valor) }))} /> : <p className="mute">Sin trabajos abiertos asignados.</p>}</div></div></Seccion>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card"><h2>Próximas tareas</h2>{d.tareas.length ? d.tareas.map((x: any, i: number) => <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}><b>{x.fecha}</b> · {x.texto}{x.zona_id ? <small className="mute"> · {nz(x.zona_id)}</small> : null}</div>) : <p className="mute">No hay tareas abiertas.</p>}</div>
        <div className="card"><h2>Actividad reciente</h2>{d.recientes.length ? d.recientes.map((x: any, i: number) => <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}><small className="mute">{x.fecha}</small> {x.trabajo} · {x.cliente}{x.tecnico ? <small className="mute"> · {x.tecnico}</small> : null}</div>) : <p className="mute">Aún no hay actividad registrada.</p>}</div></div>
    </>}
  </>;
}
