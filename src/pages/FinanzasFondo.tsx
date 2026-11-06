import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Cargando, Vacio, bs, hoy, useAlcance, useQuery } from "../lib/ui";
import { FUENTES_INGRESOS, FUENTES_INVERSORES, ambitosFondo, ingresoDisponible, movimientosFondo, rotuloFuente } from "../lib/fondo";

const num = (x: any) => Number(x) || 0;
const mesLargo = (m: string) => new Date(m + "-15T12:00:00").toLocaleDateString("es-BO", { month: "long", year: "numeric" });

function useDinero(mes: string) {
  const { zonaId, proyectoId } = useApp(), al = useAlcance();
  const filas = useQuery(() => al(supabase.from("v_fondo_inversion").select("*"), false), [proyectoId, zonaId]);
  const ing = useQuery(() => al(supabase.from("v_ingresos_disponibles").select("*").eq("mes", mes + "-01"), false), [proyectoId, zonaId, mes]);
  const inv = useQuery(() => al(supabase.from("inversores").select("id, nombre, monto, moneda, monto_original, tipo_cambio, zona_id, proyecto_id, fecha_inicio, proposito").order("fecha_inicio"), false), [proyectoId, zonaId]);
  const gas = useQuery(() => al(supabase.from("v_gasto_fuente").select("id, origen, proyecto_id, zona_id, fecha, monto, fuente, concepto").in("fuente", [...FUENTES_INVERSORES, ...FUENTES_INGRESOS]).order("fecha"), false), [proyectoId, zonaId]);
  return { filas, ing, inv, gas, cargando: filas.loading || ing.loading || inv.loading || gas.loading, error: filas.error || inv.error || gas.error };
}

/** Cuadro corto que se ve arriba en Finanzas: cuánto dinero hay disponible en la zona (fondo de inversores e ingresos del mes) o en todo el proyecto. */
export function BannerFondo({ onVer }: { onVer: () => void }) {
  const { zonaId, zonas, proyectoId } = useApp(), al = useAlcance(), mes = hoy().slice(0, 7);
  const filas = useQuery(() => al(supabase.from("v_fondo_inversion").select("*"), false), [proyectoId, zonaId]), ing = useQuery(() => al(supabase.from("v_ingresos_disponibles").select("*").eq("mes", mes + "-01"), false), [proyectoId, zonaId]);
  const F: any[] = (filas.data as any[]) || [], I: any[] = (ing.data as any[]) || [];
  if (filas.loading || ing.loading) return null;
  const z = zonaId ? F.find(r => r.zona_id === zonaId) : null, g = F.find(r => !r.zona_id), nombre = zonas.find(x => x.id === zonaId)?.nombre;
  const tot = (k: string, lista: any[]) => lista.reduce((s, r) => s + num(r[k]), 0);
  if (!F.length && !I.length && !zonaId) return null;
  const lista = zonaId ? (z ? [z] : []) : F, disp = tot("disponible", lista), dispIng = ingresoDisponible(I, proyectoId || null, zonaId || null, mes);
  return <div className="card" style={{ margin: "0 0 12px", padding: "10px 14px", borderLeft: "5px solid " + (disp < 0 ? "var(--bad)" : "var(--ok)") }}>
    <div className="fila entre"><div><b>💰 Dinero disponible {zonaId ? `de ${nombre}` : "(todas las zonas y el general)"}</b><br />
      <span>Fondo de inversores: <b style={{ fontSize: 18, color: disp < 0 ? "var(--bad)" : "var(--ok)" }}>{bs(disp)}</b></span> <span className="mute">· recibido {bs(tot("recibido", lista))} · gastado {bs(tot("gastado", lista))}</span><br />
      <span>Ingresos de {mesLargo(mes)}: <b style={{ fontSize: 18, color: dispIng < 0 ? "var(--bad)" : "var(--ok)" }}>{bs(dispIng)}</b></span> <span className="mute">disponibles de lo cobrado este mes</span>
      {zonaId && g && <><br /><small className="mute">Fondo general de inversores del proyecto: disponible {bs(g.disponible)}</small></>}
      {zonaId && !z && <><br /><small className="mute">Esta zona todavía no tiene dinero de inversores. Se anota en Inversores y fondos → Inversores.</small></>}</div>
      <button className="btn suave chico" onClick={onVer}>Ver el detalle</button></div></div>;
}

/** Dinero disponible: el fondo de los inversores (por zona y general) y los ingresos del mes, con cada movimiento y el saldo después de cada uno. */
export function FondoInversion() {
  const { zonaId, zonas, proyectoId } = useApp(), [mes, setMes] = useState(hoy().slice(0, 7)), { filas, ing, inv, gas, cargando, error } = useDinero(mes);
  const F: any[] = (filas.data as any[]) || [], IG: any[] = (ing.data as any[]) || [], I: any[] = (inv.data as any[]) || [], G: any[] = (gas.data as any[]) || [], Gi = G.filter(g => (FUENTES_INVERSORES as readonly string[]).includes(g.fuente));
  const ambitos = useMemo(() => { const a = new Set(ambitosFondo(I, Gi)); if (zonaId) { a.add(zonaId); return [zonaId, ...(a.has("general") ? ["general"] : [])]; } return Array.from(a).sort((x, y) => (x === "general" ? 1 : y === "general" ? -1 : (zonas.find(z => z.id === x)?.nombre || "").localeCompare(zonas.find(z => z.id === y)?.nombre || ""))); }, [I, Gi, zonaId, zonas.length]);
  if (cargando) return <Cargando />;
  const zonaIng = IG.filter(r => r.zona_id && (!zonaId || r.zona_id === zonaId)), gastosIng = G.filter(g => (FUENTES_INGRESOS as readonly string[]).includes(g.fuente) && String(g.fecha).slice(0, 7) === mes && (!zonaId || g.zona_id === zonaId || g.fuente === "Ingresos del mes (proyecto)")), poolProyecto = ingresoDisponible(IG, proyectoId || null, null, mes);
  return <>
    {error && <Aviso tipo="mal">No se pudo cargar el dinero disponible: {String(error)}. Si todavía no corriste en Supabase los archivos <b>29_fondo_inversion.sql</b> y <b>30_dinero_disponible.sql</b>, córrelos y recarga la página.</Aviso>}
    <Aviso>Aquí ves el <b>dinero disponible</b>. <b>Fondo de inversores:</b> lo que cada inversor invierte en una zona suma al fondo de esa zona, y lo de un inversor "general" suma al fondo general. <b>Ingresos del mes:</b> lo cobrado a los clientes de cada zona en el mes. Al registrar una compra o un gasto eliges de cuál sale, y se descuenta aquí.</Aviso>
    <h2 style={{ margin: "14px 0 6px" }}>Fondo de inversores</h2>
    {!ambitos.length ? <Vacio>Todavía no hay dinero de inversores. Anótalos en <b>Inversores y fondos → Inversores</b> y aparecerán aquí.</Vacio> : ambitos.map(a => {
      const zid = a === "general" ? null : a, fila = F.find(r => (r.zona_id || null) === zid && (!proyectoId || r.proyecto_id === proyectoId)), movs = movimientosFondo({ inversores: I, gastos: Gi, proyectoId: proyectoId || null, zonaId: zid }), rec = num(fila?.recibido), gast = num(fila?.gastado), disp = num(fila?.disponible);
      return <div key={a} className="card tw" style={{ marginBottom: 14 }}><h2 style={{ marginTop: 0 }}>{zid ? `Zona ${zonas.find(z => z.id === zid)?.nombre || ""}` : "Fondo general del proyecto"}</h2>
        <div className="grid gk" style={{ marginBottom: 10 }}><div className="card kpi"><span>Recibido de inversores</span><b>{bs(rec)}</b></div><div className="card kpi"><span>Gastado del fondo</span><b>{bs(gast)}</b></div><div className="card kpi"><span>Disponible</span><b style={{ color: disp < 0 ? "var(--bad)" : "var(--ok)" }}>{bs(disp)}</b></div></div>
        {movs.length ? <table><thead><tr><th>Fecha</th><th>Movimiento</th><th>Entra</th><th>Sale</th><th>Saldo del fondo</th></tr></thead>
          <tbody>{[...movs].reverse().map(m => <tr key={m.id}><td>{m.fecha}</td><td><b>{m.concepto}</b>{m.detalle && <><br /><small className="mute">{m.detalle}</small></>}</td><td style={{ color: "var(--ok)" }}>{m.tipo === "Entrada" ? "+ " + bs(m.monto) : ""}</td><td style={{ color: "var(--bad)" }}>{m.tipo === "Salida" ? "− " + bs(m.monto) : ""}</td><td><b>{bs(m.saldo)}</b></td></tr>)}</tbody></table>
          : <Vacio>Sin movimientos en este fondo.</Vacio>}</div>; })}

    <div className="fila entre" style={{ margin: "18px 0 6px" }}><h2 style={{ margin: 0 }}>Ingresos del mes</h2><label className="fila">Mes <input type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} /></label></div>
    <div className="card tw"><p className="mute" style={{ marginTop: 0 }}>Lo cobrado a los clientes (y otros ingresos registrados) en <b>{mesLargo(mes)}</b>, menos lo que se gastó eligiendo "Ingresos del mes". El disponible de todo el proyecto descuenta también lo gastado de los ingresos de cualquier zona.</p>
      {zonaIng.length || gastosIng.length ? <>
        <table><thead><tr><th>Zona</th><th>Ingresos del mes</th><th>Gastado de ellos</th><th>Disponible</th></tr></thead>
          <tbody>{zonaIng.map(r => <tr key={r.zona_id}><td><b>{r.zona_nombre || zonas.find(z => z.id === r.zona_id)?.nombre}</b></td><td>{bs(r.ingreso)}</td><td>{bs(r.gastado)}</td><td><b style={{ color: num(r.disponible) < 0 ? "var(--bad)" : "var(--ok)" }}>{bs(r.disponible)}</b></td></tr>)}
            {!zonaId && <tr><td><b>Todo el proyecto</b></td><td>{bs(zonaIng.reduce((s, r) => s + num(r.ingreso), 0))}</td><td>{bs(zonaIng.reduce((s, r) => s + num(r.gastado), 0) + IG.filter(r => !r.zona_id).reduce((s, r) => s + num(r.gastado), 0))}</td><td><b style={{ color: poolProyecto < 0 ? "var(--bad)" : "var(--ok)" }}>{bs(poolProyecto)}</b></td></tr>}</tbody></table>
        {gastosIng.length > 0 && <><h3 style={{ margin: "12px 0 4px" }}>Gastos pagados con ingresos de {mesLargo(mes)}</h3><table><thead><tr><th>Fecha</th><th>Gasto</th><th>De</th><th>Monto</th></tr></thead>
          <tbody>{[...gastosIng].reverse().map(g => <tr key={g.origen + g.id}><td>{g.fecha}</td><td><b>{g.concepto || "Gasto"}</b></td><td><small>{rotuloFuente(g.fuente)}{g.zona_id ? " · " + (zonas.find(z => z.id === g.zona_id)?.nombre || "") : ""}</small></td><td style={{ color: "var(--bad)" }}>− {bs(g.monto)}</td></tr>)}</tbody></table></>}</>
        : <Vacio>No hay ingresos registrados en este mes todavía.</Vacio>}</div>
  </>;
}
