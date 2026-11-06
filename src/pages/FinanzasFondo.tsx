import { useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Cargando, Vacio, bs, useAlcance, useQuery } from "../lib/ui";
import { ambitosFondo, movimientosFondo } from "../lib/fondo";

const num = (x: any) => Number(x) || 0;

function useFondo() {
  const { zonaId, proyectoId } = useApp(), al = useAlcance();
  const filas = useQuery(() => al(supabase.from("v_fondo_inversion").select("*"), false), [proyectoId, zonaId]);
  const inv = useQuery(() => al(supabase.from("inversores").select("id, nombre, monto, moneda, monto_original, tipo_cambio, zona_id, proyecto_id, fecha_inicio, proposito").order("fecha_inicio"), false), [proyectoId, zonaId]);
  const gas = useQuery(() => al(supabase.from("fin_movimientos").select("id, fecha, tipo, categoria, descripcion, monto, fuente, fuente_detalle, zona_id, proyecto_id").in("fuente", ["Fondo de la zona", "Fondo general"]).order("fecha"), false), [proyectoId, zonaId]);
  return { filas, inv, gas, cargando: filas.loading || inv.loading || gas.loading, error: filas.error || inv.error || gas.error };
}

/** Cuadro corto que se ve arriba en Finanzas: cuánto hay en el fondo de inversión de la zona (o de todo el proyecto). */
export function BannerFondo({ onVer }: { onVer: () => void }) {
  const { zonaId, zonas, proyectoId } = useApp(), al = useAlcance(), filas = useQuery(() => al(supabase.from("v_fondo_inversion").select("*"), false), [proyectoId, zonaId]), cargando = filas.loading, F: any[] = (filas.data as any[]) || [];
  if (cargando) return null;
  const z = zonaId ? F.find(r => r.zona_id === zonaId) : null, g = F.find(r => !r.zona_id), nombre = zonas.find(x => x.id === zonaId)?.nombre;
  const tot = (k: string, lista: any[]) => lista.reduce((s, r) => s + num(r[k]), 0);
  if (!F.length && !zonaId) return null;
  const lista = zonaId ? (z ? [z] : []) : F, disp = tot("disponible", lista);
  return <div className="card" style={{ margin: "0 0 12px", padding: "10px 14px", borderLeft: "5px solid " + (disp < 0 ? "var(--bad)" : "var(--ok)") }}>
    <div className="fila entre"><div><b>💰 Fondo de inversión {zonaId ? `de ${nombre}` : "(todas las zonas y el general)"}</b><br />
      <span>Disponible: <b style={{ fontSize: 18, color: disp < 0 ? "var(--bad)" : "var(--ok)" }}>{bs(disp)}</b></span> <span className="mute">· recibido {bs(tot("recibido", lista))} · gastado {bs(tot("gastado", lista))}</span>
      {zonaId && g && <><br /><small className="mute">Fondo general del proyecto: disponible {bs(g.disponible)}</small></>}
      {zonaId && !z && <><br /><small className="mute">Esta zona todavía no tiene dinero de inversores. Se anota en Inversores y fondos → Inversores.</small></>}</div>
      <button className="btn suave chico" onClick={onVer}>Ver el detalle</button></div></div>;
}

/** Detalle del fondo de inversión: lo que entró de cada inversor y lo que se fue gastando, con el saldo después de cada movimiento. */
export function FondoInversion() {
  const { zonaId, zonas, proyectoId } = useApp(), { filas, inv, gas, cargando, error } = useFondo();
  const F: any[] = (filas.data as any[]) || [], I: any[] = (inv.data as any[]) || [], G: any[] = (gas.data as any[]) || [];
  const ambitos = useMemo(() => { const a = new Set(ambitosFondo(I, G)); if (zonaId) { a.add(zonaId); return [zonaId, ...(a.has("general") ? ["general"] : [])]; } return Array.from(a).sort((x, y) => (x === "general" ? 1 : y === "general" ? -1 : (zonas.find(z => z.id === x)?.nombre || "").localeCompare(zonas.find(z => z.id === y)?.nombre || ""))); }, [I, G, zonaId, zonas.length]);
  if (cargando) return <Cargando />;
  return <>
    {error && <Aviso tipo="mal">No se pudo cargar el fondo: {String(error)}. Si todavía no corriste en Supabase el archivo <b>29_fondo_inversion.sql</b>, córrelo y recarga la página.</Aviso>}
    <Aviso>El <b>fondo de inversión</b> es el dinero que ponen los inversores: lo que cada inversor invierte en una zona suma al fondo de esa zona, y lo que invierte un inversor "general" suma al fondo general del proyecto. Al registrar una compra o un gasto eliges si sale del fondo (y se descuenta aquí) o de otra fuente.</Aviso>
    {!ambitos.length ? <Vacio>Todavía no hay dinero de inversores. Anótalos en <b>Inversores y fondos → Inversores</b> y aparecerán aquí.</Vacio> : ambitos.map(a => {
      const zid = a === "general" ? null : a, fila = F.find(r => (r.zona_id || null) === zid && (!proyectoId || r.proyecto_id === proyectoId)), movs = movimientosFondo({ inversores: I, gastos: G, proyectoId: proyectoId || null, zonaId: zid }), rec = num(fila?.recibido), gast = num(fila?.gastado), disp = num(fila?.disponible);
      return <div key={a} className="card tw" style={{ marginBottom: 14 }}><h2 style={{ marginTop: 0 }}>{zid ? `Zona ${zonas.find(z => z.id === zid)?.nombre || ""}` : "Fondo general del proyecto"}</h2>
        <div className="grid gk" style={{ marginBottom: 10 }}><div className="card kpi"><span>Recibido de inversores</span><b>{bs(rec)}</b></div><div className="card kpi"><span>Gastado del fondo</span><b>{bs(gast)}</b></div><div className="card kpi"><span>Disponible</span><b style={{ color: disp < 0 ? "var(--bad)" : "var(--ok)" }}>{bs(disp)}</b></div></div>
        {movs.length ? <table><thead><tr><th>Fecha</th><th>Movimiento</th><th>Entra</th><th>Sale</th><th>Saldo del fondo</th></tr></thead>
          <tbody>{[...movs].reverse().map(m => <tr key={m.id}><td>{m.fecha}</td><td><b>{m.concepto}</b>{m.detalle && <><br /><small className="mute">{m.detalle}</small></>}</td><td style={{ color: "var(--ok)" }}>{m.tipo === "Entrada" ? "+ " + bs(m.monto) : ""}</td><td style={{ color: "var(--bad)" }}>{m.tipo === "Salida" ? "− " + bs(m.monto) : ""}</td><td><b>{bs(m.saldo)}</b></td></tr>)}</tbody></table>
          : <Vacio>Sin movimientos en este fondo.</Vacio>}</div>; })}
  </>;
}
