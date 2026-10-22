import { useState } from "react";
import { Cargando, Kpi, Vacio } from "../lib/ui";
import { Alerta, Area, Nivel, useAlertas } from "../lib/alertas";

export const NIVELES: Record<Nivel, { nombre: string; color: string; fondo: string }> = {
  critica: { nombre: "Urgente", color: "var(--bad)", fondo: "var(--badb)" },
  atencion: { nombre: "Atención", color: "var(--warn)", fondo: "var(--warnb)" },
  info: { nombre: "Aviso", color: "var(--acct)", fondo: "#d9f6f7" },
};
const AREAS: Area[] = ["Cobranza", "Red", "Operación", "Inventario", "Finanzas"];

export function TarjetaAlerta({ a }: { a: Alerta }) {
  const N = NIVELES[a.nivel];
  return <div className="card" style={{ borderLeft: `5px solid ${N.color}` }}>
    <div className="fila entre"><div className="fila"><span className="tag" style={{ background: N.fondo, color: N.color }}>{N.nombre}</span><span className="mute">{a.area}</span></div>
      <a className="btn suave chico" href={"#/" + a.ruta}>Ir a resolver</a></div>
    <h2 style={{ margin: "8px 0 4px" }}>{a.titulo}</h2>
    <ul style={{ margin: 0, paddingLeft: 18 }}>{a.detalle.map((d, i) => <li key={i}>{d}</li>)}</ul>
  </div>;
}

export default function Alertas() {
  const { alertas, cargando, actualizadaA, recargar } = useAlertas();
  const [area, setArea] = useState<"" | Area>(""), [nivel, setNivel] = useState<"" | Nivel>("");
  const lista = alertas.filter(a => (!area || a.area === area) && (!nivel || a.nivel === nivel));
  const k = (v: Nivel) => alertas.filter(a => a.nivel === v).length;
  return <>
    <div className="fila entre"><h1>Centro de alertas</h1><button className="btn suave" disabled={cargando} onClick={recargar}>{cargando ? "Actualizando…" : "Actualizar"}</button></div>
    <p className="mute">Se calcula en el momento con los datos de la zona que elegiste arriba (o de todas) y solo con lo que tu usuario puede ver. Se actualiza sola cada 5 minutos{actualizadaA ? ` · última vez: ${actualizadaA.toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit" })}` : ""}.</p>
    <div className="grid gk" style={{ marginBottom: 14 }}>
      <Kpi t="Urgentes" v={k("critica")} c={k("critica") ? "var(--bad)" : undefined} s="Resolver hoy" /><Kpi t="Atención" v={k("atencion")} c={k("atencion") ? "var(--warn)" : undefined} s="Revisar pronto" /><Kpi t="Avisos" v={k("info")} s="Para tener en cuenta" />
    </div>
    <div className="fila" style={{ marginBottom: 12 }}>
      <select value={area} onChange={e => setArea(e.target.value as any)}><option value="">Todas las áreas</option>{AREAS.map(x => <option key={x}>{x}</option>)}</select>
      <select value={nivel} onChange={e => setNivel(e.target.value as any)}><option value="">Todos los niveles</option><option value="critica">Urgentes</option><option value="atencion">Atención</option><option value="info">Avisos</option></select>
    </div>
    {cargando && !alertas.length ? <Cargando /> : lista.length ? <div style={{ display: "grid", gap: 12 }}>{lista.map(a => <TarjetaAlerta key={a.id} a={a} />)}</div>
      : <div className="card"><Vacio>{alertas.length ? "No hay alertas con ese filtro." : "Todo en orden: no hay alertas por ahora."}</Vacio></div>}
  </>;
}
