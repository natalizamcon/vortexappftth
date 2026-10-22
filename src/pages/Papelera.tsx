import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Cargando, Vacio, bs, useQuery } from "../lib/ui";
import { restaurarDePapelera } from "../lib/papelera";

const TIPOS: Record<string, [string, (d: any) => string]> = {
  proyectos: ["Espacio", d => d.nombre],
  zonas: ["Zona", d => d.nombre],
  costos_fijos: ["Costo fijo", d => `${d.concepto} · ${bs(Number(d.cantidad) * Number(d.monto_unitario))}`],
  equipos_serie: ["Equipo", d => `${d.serie}${d.modelo ? " · " + d.modelo : ""}`],
  fin_movimientos: ["Ingreso o gasto", d => `${d.fecha} · ${String(d.tipo).toLowerCase().replace("_", " ")} · ${d.categoria || "sin categoría"} · ${bs(d.monto)}`],
  fondos_movimientos: ["Movimiento de fondo", d => `${d.fondo} · ${d.tipo} · ${bs(d.monto)}`],
  historial_red: ["Historial de red", d => `${d.tipo}${d.descripcion ? " · " + d.descripcion : ""}`],
  materiales: ["Material", d => d.nombre],
  pagos_personal: ["Pago al personal", d => `${d.trabajador} · ${bs(d.monto)}`],
  presupuesto_lineas: ["Línea de presupuesto", d => `${d.concepto} · ${bs(Number(d.cantidad) * Number(d.monto_unitario))}`],
  simulaciones: ["Simulación", d => d.nombre],
  inversores: ["Inversor", d => `${d.nombre} · ${bs(d.monto)}`],
  gastos_empresa: ["Gasto de la empresa", d => `${d.fecha} · ${d.categoria} · ${d.concepto} · ${bs(d.monto)}`],
  costos_compartidos: ["Costo compartido", d => `${d.nombre} · ${bs(d.monto_mensual)} por mes`],
  fondos_empresa: ["Movimiento de fondo", d => `${d.fondo} · ${d.tipo} · ${bs(d.monto)}${d.nota ? " · " + d.nota : ""}`],
  compras_empresa: ["Compra de la empresa", d => `${d.articulo} · ${d.cantidad} × ${bs(d.costo_unitario)}`],
  naps: ["NAP", d => `${d.codigo} · ${d.tipo} · ${d.puertos} puertos`],
  costos_variables: ["Costo de la red", d => `${d.concepto}${d.destino ? " → " + d.destino : ""} · ${bs(d.real_total)}`],
  olts: ["OLT", d => `${d.nombre}${d.marca || d.modelo ? " · " + [d.marca, d.modelo].filter(Boolean).join(" ") : ""}`],
  troncales: ["Troncal", d => `${d.codigo} · ${[d.desde, d.hasta].filter(Boolean).join(" → ") || "sin recorrido"} · ${d.hilos} hilos`],
  fusiones: ["Fusión", d => `Hilo ${d.hilo_entrada ?? "?"}${d.caja_empalme ? " · " + d.caja_empalme : ""}${d.perdida_db != null ? " · " + d.perdida_db + " dB" : ""}`],
  postes: ["Poste", d => `${d.codigo}${d.tipo ? " · " + d.tipo : ""}`],
};

export default function Papelera() {
  const { recargar } = useApp();
  const q = useQuery(() => supabase.rpc("listar_papelera"), []);
  const [filtro, setFiltro] = useState(""), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState("");
  const filas: any[] = ((q.data as any[]) || []).filter(x => !filtro || x.tabla === filtro).sort((a, b) => String(b.eliminado_en).localeCompare(String(a.eliminado_en)));

  const restaurar = async (x: any) => {
    setMsg(""); setOk(""); setOcup(x.id);
    try { await restaurarDePapelera(x.tabla, [x.id]); await recargar(); q.recargar(); setOk("Restaurado: ya vuelve a verse en la app."); } catch (e: any) { setMsg(e.message); }
    setOcup("");
  };

  return <>
    <h1>Papelera</h1>
    <Aviso>Aquí está todo lo que mandaste a la papelera. <b>Nada se elimina de verdad</b>: puedes restaurarlo cuando quieras. Solo el administrador ve esta pantalla.</Aviso>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="fila" style={{ margin: "10px 0" }}>
      <select value={filtro} onChange={e => setFiltro(e.target.value)}><option value="">Todo</option>{Object.entries(TIPOS).map(([k, [n]]) => <option key={k} value={k}>{n}</option>)}</select>
      <span className="mute">{filas.length} {filas.length === 1 ? "elemento" : "elementos"}</span>
    </div>
    <div className="card tw">{q.loading ? <Cargando /> : q.error ? <Aviso tipo="mal">{q.error}</Aviso> : filas.length ? <table>
      <thead><tr><th>Tipo</th><th>Qué es</th><th>Dónde estaba</th><th>Enviado</th><th>Motivo</th><th /></tr></thead>
      <tbody>{filas.map(x => { const [tipo, nombre] = TIPOS[x.tabla] || [x.tabla, () => x.id]; return <tr key={x.tabla + x.id}>
        <td><span className="tag">{tipo}</span></td><td><b>{nombre(x.datos || {})}</b></td>
        <td>{x.tabla === "proyectos" ? "—" : [x.espacio, x.zona].filter(Boolean).join(" › ") || "—"}</td>
        <td>{String(x.eliminado_en).slice(0, 10)}{x.eliminado_por && <><br /><span className="mute">{x.eliminado_por}</span></>}</td>
        <td>{x.motivo || "—"}</td>
        <td><button className="btn suave chico" disabled={ocup === x.id} onClick={() => restaurar(x)}>{ocup === x.id ? "Restaurando…" : "Restaurar"}</button></td></tr>; })}</tbody></table> : <Vacio>La papelera está vacía.</Vacio>}</div>
  </>;
}
