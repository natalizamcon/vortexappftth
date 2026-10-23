import { ReactNode, useState } from "react";
import { supabase } from "../lib/supabase";
import { Cargando, Vacio, bs, hoy, useQuery } from "../lib/ui";
import { BarrasH } from "../lib/graficos";
import { mesDesp } from "../lib/datos";
import { rangoMes } from "../lib/reparto";
import { cantEn, totalDe } from "./InventarioAlmacenes";

const n = (x: any) => Number(x) || 0;
const mesLargo = (m: string) => { const t = new Date(m + "-01T12:00:00").toLocaleDateString("es-BO", { month: "long", year: "numeric" }); return t.charAt(0).toUpperCase() + t.slice(1); };
const ENTRADAS = ["ENTRADA", "DEVOLUCION", "AJUSTE_POSITIVO"], CONSUMOS = ["SALIDA", "INSTALACION", "MANTENIMIENTO"], SALIDAS = [...CONSUMOS, "BAJA", "AJUSTE_NEGATIVO"];

function Mini({ t, v, s, info, clase }: { t: string; v: ReactNode; s?: ReactNode; info: string; clase?: string }) {
  return <div className={"kmini " + (clase || "")}><span>{t} <span title={info} style={{ cursor: "help", float: "right", opacity: 0.6 }}>ⓘ</span></span><b>{v}</b>{s && <small>{s}</small>}</div>;
}
export const estadoStock = (s: number, min: number) => (s <= 0 ? ["Agotado", "bad"] : s < min ? ["Stock bajo", "warn"] : ["Disponible", "ok"]);

export function PanelInventario({ pid, A, M, S, zonaAlmacen }: any) {
  const actual = hoy().slice(0, 7), [mes, setMes] = useState(actual), [ini, fin] = rangoMes(mes), [alm, setAlm] = useState<string>(zonaAlmacen || ""), [cat, setCat] = useState(""), [est, setEst] = useState(""), [q, setQ] = useState("");
  const movs = useQuery(() => supabase.from("movimientos").select("tipo, material_id, cantidad, costo_unitario").eq("proyecto_id", pid).gte("fecha", ini).lte("fecha", fin + "T23:59:59").limit(5000), [pid, mes]);
  const eqs = useQuery(() => supabase.from("equipos_serie").select("estado").eq("proyecto_id", pid).limit(5000), [pid]);
  if (movs.loading || eqs.loading) return <Cargando />;
  const MV: any[] = (movs.data as any[]) || [], E: any[] = (eqs.data as any[]) || [], matDe = (id: string) => M.find((m: any) => m.id === id);
  const valorTotal = M.reduce((s: number, m: any) => s + totalDe(S, m.id) * n(m.costo), 0), disponibles = M.filter((m: any) => totalDe(S, m.id) > 0).length;
  const bajos = M.filter((m: any) => { const t = totalDe(S, m.id); return t > 0 && t < n(m.minimo); }).length, agotados = M.filter((m: any) => totalDe(S, m.id) <= 0).length;
  const eq = (e: string) => E.filter(x => x.estado === e).length, val = (x: any) => n(x.cantidad) * n(x.costo_unitario);
  const ent = MV.filter(x => ENTRADAS.includes(x.tipo)), sal = MV.filter(x => SALIDAS.includes(x.tipo));
  const consumo: Record<string, { u: number; v: number }> = {}; MV.filter(x => CONSUMOS.includes(x.tipo)).forEach(x => { const c = (consumo[x.material_id] ||= { u: 0, v: 0 }); c.u += n(x.cantidad); c.v += val(x); });
  const masUsados = Object.entries(consumo).sort((a, b) => b[1].u - a[1].u).slice(0, 6), masCaros = Object.entries(consumo).sort((a, b) => b[1].v - a[1].v).filter(x => x[1].v > 0).slice(0, 6);
  const categorias = Array.from(new Set(M.map((m: any) => m.categoria).filter(Boolean))).sort() as string[];
  const stockDe = (m: any) => (alm ? cantEn(S, m.id, alm) : totalDe(S, m.id)), nombreAlm = alm ? A.find((a: any) => a.id === alm)?.nombre : "Todos los almacenes";
  const filas = M.filter((m: any) => (!cat || m.categoria === cat) && (!est || estadoStock(stockDe(m), n(m.minimo))[0] === est) && (m.nombre + " " + (m.codigo || "")).toLowerCase().includes(q.toLowerCase()));
  return <>
    <div className="kpis-mini" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(138px,1fr))" }}>
      <Mini t="Valor estimado del inventario" v={bs(valorTotal)} s="Almacén central + locales + vehículos" info="Lo que cuesta todo el material que hay hoy en todos los almacenes, al costo de cada artículo." />
      <Mini t="Productos disponibles" v={disponibles} s={`de ${M.length} en catálogo`} info="Artículos con stock en algún almacén." clase="ok" />
      <Mini t="Stock bajo" v={bajos} s={bajos ? "Por debajo del mínimo" : "Ninguno"} info="Artículos cuyo total está por debajo del mínimo que definiste." clase={bajos ? "warn" : ""} />
      <Mini t="Agotados" v={agotados} s={agotados ? "Sin stock" : "Ninguno"} info="Artículos sin ninguna unidad en ningún almacén." clase={agotados ? "bad" : ""} />
      <Mini t="Equipos asignados a clientes" v={eq("INSTALADO")} info="Equipos con número de serie instalados en un cliente." />
      <Mini t="Equipos disponibles" v={eq("ALMACEN")} info="Equipos con serie guardados en almacén." clase="ok" />
      <Mini t="Equipos en mantenimiento" v={eq("MANTENIMIENTO")} info="Equipos con serie que están en reparación." clase={eq("MANTENIMIENTO") ? "warn" : ""} />
      <Mini t="Pendientes de recuperación" v={eq("PENDIENTE")} info="Equipos de clientes dados de baja que todavía no regresan." clase={eq("PENDIENTE") ? "warn" : ""} />
      <Mini t="Entradas del mes" v={ent.length ? bs(ent.reduce((s, x) => s + val(x), 0)) : "—"} s={ent.length ? `${ent.length} movimiento${ent.length === 1 ? "" : "s"}` : "Sin movimientos registrados este mes."} info="Compras, devoluciones y ajustes que sumaron material en el mes elegido." />
      <Mini t="Salidas del mes" v={sal.length ? bs(sal.reduce((s, x) => s + val(x), 0)) : "—"} s={sal.length ? `${sal.length} movimiento${sal.length === 1 ? "" : "s"}` : "Sin movimientos registrados este mes."} info="Material usado, perdido o descontado en el mes elegido." /></div>
    <div className="grid g2" style={{ alignItems: "start" }}>
      <div className="card"><h2>Materiales más consumidos</h2>{masUsados.length ? <BarrasH filas={masUsados.map(([id, c]) => ({ nombre: matDe(id)?.nombre || "—", valor: c.u, extra: `${c.u} ${matDe(id)?.unidad || ""}` }))} /> : <p className="mute" style={{ margin: 0 }}>Se llena con las instalaciones y mantenimientos del período.</p>}</div>
      <div className="card"><h2>Mayor costo de consumo</h2>{masCaros.length ? <BarrasH color="var(--acc)" filas={masCaros.map(([id, c]) => ({ nombre: matDe(id)?.nombre || "—", valor: c.v }))} /> : <p className="mute" style={{ margin: 0 }}>Sin consumos registrados en el período.</p>}</div></div>
    <div className="card tw"><div className="fila" style={{ marginBottom: 10 }}><span className="mute">Período</span>
      <select value={mes} onChange={e => setMes(e.target.value)}>{Array.from({ length: 24 }, (_, i) => mesDesp(actual, -i)).map(m => <option key={m} value={m}>{mesLargo(m)}{m === actual ? " (en curso)" : ""}</option>)}</select>
      <select value={alm} onChange={e => setAlm(e.target.value)}><option value="">Todos los almacenes</option>{A.map((a: any) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select>
      <select value={cat} onChange={e => setCat(e.target.value)}><option value="">Todas las categorías</option>{categorias.map(c => <option key={c}>{c}</option>)}</select>
      <select value={est} onChange={e => setEst(e.target.value)}><option value="">Todos los estados</option><option>Disponible</option><option>Stock bajo</option><option>Agotado</option></select>
      <input placeholder="Buscar producto" value={q} onChange={e => setQ(e.target.value)} /></div>
      {filas.length ? <table><thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th>Marca</th><th>Modelo</th><th>Stock</th><th>Mínimo</th><th>Ubicación</th><th>Estado</th></tr></thead>
        <tbody>{filas.map((m: any) => { const s = stockDe(m), [t, c] = estadoStock(s, n(m.minimo)); return <tr key={m.id}><td>{m.codigo}</td><td><b>{m.nombre}</b></td><td>{m.categoria || "—"}</td><td>{m.marca || "—"}</td><td>{m.modelo || "—"}</td><td><b>{s}</b> {m.unidad}</td><td>{n(m.minimo)}</td><td>{nombreAlm}</td><td><span className={"pill " + c}>{t}</span></td></tr>; })}</tbody></table> : <Vacio>No hay productos con estos filtros.</Vacio>}</div>
  </>;
}
