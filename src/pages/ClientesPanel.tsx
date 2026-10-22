import { ReactNode, useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Cargando, Estado, Vacio, bs, hoy, useAlcance, useQuery } from "../lib/ui";
import { BarrasAgrupadas, BarrasH, Leyenda } from "../lib/graficos";
import { etiquetaMes, mesDesp, num, todas } from "../lib/datos";
import { rangoMes } from "../lib/reparto";

const n = num;
const mesLargo = (m: string) => { const t = new Date(m + "-01T12:00:00").toLocaleDateString("es-BO", { month: "long", year: "numeric" }); return t.charAt(0).toUpperCase() + t.slice(1); };
const aDatos = (p: Promise<any[]>) => p.then(data => ({ data, error: null })).catch(e => ({ data: [] as any[], error: { message: e.message } }));
const ESTADOS: [string, string][] = [["PAGADO", "Pagado"], ["POR VENCER", "Por vencer"], ["VENCIDO", "Vencido"], ["SUSPENDIDO", "Suspendido"], ["BAJA", "Baja"]];
const COLOR_ESTADO: Record<string, string> = { "PAGADO": "var(--ok)", "POR VENCER": "var(--warn)", "VENCIDO": "#c4651a", "SUSPENDIDO": "var(--bad)", "BAJA": "#8a909c" };

function Mini({ t, v, s, info, ver, clase }: { t: string; v: ReactNode; s?: ReactNode; info: string; ver?: () => void; clase?: string }) {
  return <div className={"kmini " + (clase || "")}><span>{t} <span title={info} style={{ cursor: "help", float: "right", opacity: 0.6 }}>ⓘ</span></span><b>{v}</b>{s && <small>{s}</small>}{ver && <a onClick={ver}>Ver detalle →</a>}</div>;
}

export function PanelClientes({ ir }: { ir: (tab: string, filtro?: string) => void }) {
  const { zonas, proyectos, proyectoId, zonaId } = useApp(), al = useAlcance(), dep = [proyectoId, zonaId], actual = hoy().slice(0, 7);
  const [mes, setMes] = useState(actual), [ini, fin] = rangoMes(mes), zona = zonas.find(z => z.id === zonaId);
  const cli = useQuery(() => aDatos(todas(() => al(supabase.from("clientes").select("zona_id, plan_nombre, mbps, estado, fecha_instalacion, fecha_baja").order("id")))), dep);
  const cob = useQuery(() => aDatos(todas(() => al(supabase.from("v_cobranza").select("cliente_id, nombre, estado_cuenta, deuda, meses_deuda").order("nombre")))), dep);
  const naps = useQuery(() => al(supabase.from("v_naps_ocupacion").select("nap_id, codigo, total, ocupados, reservados, zona_id").order("codigo").limit(200)), dep);
  const puertos = useQuery(() => al(supabase.from("puertos").select("numero, nap_id, clientes!puertos_cliente_fk(nombre)").eq("estado", "OCUPADO").order("numero").limit(3000), false), [proyectoId, naps.data]);
  const mant = useQuery(() => al(supabase.from("mantenimientos").select("id", { count: "exact", head: true }).in("estado", ["PENDIENTE", "EN PROCESO", "PAUSADO"])).then((r: any) => ({ data: r.count ?? 0, error: r.error })), dep);
  const planes = useQuery(() => zonaId ? supabase.from("planes").select("nombre, mbps").eq("zona_id", zonaId).eq("activo", true).order("precio") : Promise.resolve({ data: [], error: null }), [zonaId]);
  if (cli.loading || cob.loading || naps.loading) return <Cargando />;

  const C: any[] = (cli.data as any[]) || [], F: any[] = (cob.data as any[]) || [], N: any[] = (naps.data as any[]) || [], P: any[] = (puertos.data as any[]) || [];
  const zv = zonas.filter(z => (!proyectoId || z.proyecto_id === proyectoId) && (!zonaId || z.id === zonaId));
  const activoEn = (c: any) => (!c.fecha_instalacion || c.fecha_instalacion <= fin) && (c.estado !== "BAJA" || (c.fecha_baja && c.fecha_baja > fin));
  const activos = C.filter(activoEn), nuevos = C.filter(c => c.fecha_instalacion && c.fecha_instalacion >= ini && c.fecha_instalacion <= fin), bajas = C.filter(c => c.fecha_baja && c.fecha_baja >= ini && c.fecha_baja <= fin);
  const inactivos = F.filter(c => c.estado_cuenta === "SUSPENDIDO"), vencidos = F.filter(c => c.estado_cuenta === "VENCIDO").sort((a, b) => n(b.deuda) - n(a.deuda));
  const reservados = N.reduce((s, x) => s + n(x.reservados), 0);
  const meses = [-5, -4, -3, -2, -1, 0].map(k => mesDesp(mes, k)), altasM = meses.map(m => C.filter(c => c.fecha_instalacion?.slice(0, 7) === m).length), bajasM = meses.map(m => C.filter(c => c.fecha_baja?.slice(0, 7) === m).length);
  const planesC: Record<string, number> = {}; ((planes.data as any[]) || []).forEach(p => { planesC[`${p.nombre} · ${p.mbps} Mbps`] = 0; }); C.filter(c => c.estado !== "BAJA").forEach(c => { const k = `${c.plan_nombre || "Sin plan"}${c.mbps ? " · " + c.mbps + " Mbps" : ""}`; planesC[k] = (planesC[k] || 0) + 1; });
  const nombreZona = (id: string) => zonas.find(z => z.id === id)?.nombre || "";
  const nombreProy = (id: string) => proyectos.find(p => p.id === id)?.nombre || "";
  const opcionesMes = Array.from({ length: 24 }, (_, i) => mesDesp(actual, -i));

  return <>
    <div className="fila" style={{ marginBottom: 12 }}><b>Período:</b><select value={mes} onChange={e => setMes(e.target.value)}>{opcionesMes.map(m => <option key={m} value={m}>{mesLargo(m)}{m === actual ? " (en curso)" : ""}</option>)}</select>
      <span className="mute">{zona ? "Cartera de la zona " + zona.nombre : "Cartera de todas las zonas"}</span></div>

    <div className="kpis-mini" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>
      <Mini t="Clientes activos" v={activos.length} s="Ya operando, incluidos suspendidos" info="Clientes que tenían servicio al final del período elegido." ver={() => ir("lista", "ACTIVO")} />
      <Mini t="Clientes nuevos" v={nuevos.length} s="En el período elegido" clase="ok" info="Instalaciones hechas dentro del mes elegido." ver={() => ir("lista", "")} />
      <Mini t="Clientes inactivos" v={inactivos.length} s="Servicio suspendido o cortado" clase={inactivos.length ? "warn" : ""} info="Clientes suspendidos ahora mismo." ver={() => ir("lista", "SUSPENDIDO")} />
      <Mini t="Dados de baja" v={bajas.length} s="En el período elegido" clase={bajas.length ? "bad" : ""} info="Clientes que se dieron de baja dentro del mes elegido." ver={() => ir("lista", "BAJA")} />
      <Mini t="Con pagos vencidos" v={vencidos.length} s={vencidos.length ? `Deuda ${bs(vencidos.reduce((s, x) => s + n(x.deuda), 0))}` : "Ninguno en mora"} clase={vencidos.length ? "bad" : "ok"} info="Clientes con un mes vencido sin pagar." ver={() => ir("cobranzas", "VENCIDO")} />
      <Mini t="Instalaciones pendientes" v={reservados} s={reservados ? "Puertos reservados por instalar" : "Ninguna pendiente"} clase={reservados ? "warn" : ""} info="Puertos reservados para clientes que aún no se instalan." ver={() => { location.hash = "#/red"; }} />
      <Mini t="Mantenimiento pendiente" v={mant.data ?? 0} s={n(mant.data) ? "Por atender" : "Ninguno pendiente"} clase={n(mant.data) ? "warn" : ""} info="Mantenimientos sin completar." ver={() => { location.hash = "#/campo"; }} /></div>

    <div className="mitades">
      <div className="card"><h2>Altas y bajas por mes</h2><BarrasAgrupadas alto={240} fmt={v => String(v)} etiquetas={meses.map(m => etiquetaMes(m))} series={[{ nombre: "Altas", color: "var(--ok)", datos: altasM }, { nombre: "Bajas", color: "var(--bad)", datos: bajasM }]} /><Leyenda items={[{ nombre: "Altas", color: "var(--ok)" }, { nombre: "Bajas", color: "var(--bad)" }]} /></div>
      <div className="card"><h2>Estado de cuenta</h2>
        <div style={{ display: "flex", gap: 6 }}>{ESTADOS.map(([k, l]) => <div key={k} style={{ flex: 1, textAlign: "center", padding: "7px 4px", borderRadius: 99, background: `color-mix(in srgb, ${COLOR_ESTADO[k]} 18%, white)`, color: "var(--ink)", fontWeight: 700 }} title={l}>{F.filter(c => c.estado_cuenta === k).length}</div>)}</div>
        <div className="leyenda-puertos">{ESTADOS.map(([k, l]) => <span key={k}><span style={{ color: COLOR_ESTADO[k] }}>●</span> {l}</span>)}</div>
        <h3 style={{ margin: "12px 0 6px" }}>Clientes por plan</h3>{Object.keys(planesC).length ? <BarrasH filas={Object.entries(planesC).map(([nombre, valor]) => ({ nombre, valor, extra: String(valor) }))} /> : <Vacio>Sin clientes todavía.</Vacio>}</div>
      <div className="card tw"><h2>Clientes por zona</h2>{zv.length ? <table style={{ minWidth: 0 }}><thead><tr>{proyectos.length > 1 && <th>Espacio</th>}<th>Zona</th><th>Activos</th><th>Bajas</th></tr></thead>
        <tbody>{zv.map(z => <tr key={z.id}>{proyectos.length > 1 && <td>{nombreProy(z.proyecto_id)}</td>}<td><b>{z.nombre}</b></td><td>{C.filter(c => c.zona_id === z.id && c.estado !== "BAJA").length}</td><td>{C.filter(c => c.zona_id === z.id && c.estado === "BAJA").length}</td></tr>)}</tbody></table> : <Vacio>Aún no hay zonas.</Vacio>}</div>
      <div className="card"><h2>Clientes con pagos vencidos</h2>{vencidos.length ? <>{vencidos.slice(0, 8).map(c => <div key={c.cliente_id} className="fila entre" style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}><span><b>{c.nombre}</b> <small className="mute">{n(c.meses_deuda)} mes{n(c.meses_deuda) === 1 ? "" : "es"}</small></span><b style={{ color: "var(--bad)" }}>{bs(c.deuda)}</b></div>)}{vencidos.length > 8 && <p className="mute" style={{ margin: "6px 0 0" }}>y {vencidos.length - 8} más. <a style={{ cursor: "pointer" }} onClick={() => ir("cobranzas", "VENCIDO")}>Verlos en Cobranzas</a></p>}</> : <p className="mute">Ningún cliente en mora.</p>}</div>
    </div>

    <div className="card"><h2>Clientes por NAP y puerto</h2>{N.length ? N.slice(0, 12).map(x => { const ps = P.filter(p => p.nap_id === x.nap_id); return <div key={x.nap_id} style={{ marginBottom: 10 }}>
      <b>{x.codigo}</b> <span className="mute">· {n(x.ocupados)} de {n(x.total)} puertos ocupados{!zona ? " · " + nombreZona(x.zona_id) : ""}</span>
      <div className="fila" style={{ marginTop: 4, gap: 6 }}>{ps.length ? ps.map(p => <span key={p.numero} className="pill">P{p.numero} · {p.clientes?.nombre || "—"}</span>) : <small className="mute">Sin clientes conectados.</small>}</div></div>; }) : <Vacio>Aún no hay NAP.</Vacio>}
      {N.length > 12 && <p className="mute" style={{ margin: 0 }}>Se muestran 12 de {N.length} NAP. Elige una zona arriba para ver las de una sola zona.</p>}</div>
  </>;
}
