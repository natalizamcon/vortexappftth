import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Aviso, Campo, Cargando, Vacio, bs, useQuery } from "../lib/ui";

const n = (x: any) => Number(x) || 0;
export const PROVEEDORES = ["Digicorp", "Entel", "Tigo", "Viva", "Otro"];
export const cantEn = (S: any[], m: string, a: string) => n(S.find(x => x.material_id === m && x.almacen_id === a)?.cantidad);
export const totalDe = (S: any[], m: string) => S.filter(x => x.material_id === m).reduce((s, x) => s + n(x.cantidad), 0);

/** Ingresar material a un almacén con el precio realmente pagado (si hubo descuento, se anota con ese precio). */
export function FormIngreso({ A, M, S, almacenInicial, materialInicial, onListo }: { A: any[]; M: any[]; S: any[]; almacenInicial?: string; materialInicial?: string; onListo: () => void }) {
  const [f, setF] = useState({ almacen: almacenInicial || A[0]?.id || "", material: materialInicial || "", cantidad: "1", precio: String(n(M.find(x => x.id === materialInicial)?.costo)), proveedor: "Digicorp" });
  const [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false);
  const m = M.find(x => x.id === f.material), antes = m ? totalDe(S, m.id) : 0, cant = n(f.cantidad), precio = n(f.precio);
  const nuevoCosto = m && antes + cant > 0 ? Math.round(((antes * n(m.costo) + cant * precio) / (antes + cant)) * 100) / 100 : precio;
  const elegir = (id: string) => setF(x => ({ ...x, material: id, precio: String(n(M.find(y => y.id === id)?.costo)), proveedor: M.find(y => y.id === id)?.proveedor || x.proveedor }));
  const guardar = async () => {
    setMsg(""); setOk(""); if (!f.almacen) return setMsg("Elige el almacén de destino."); if (!m) return setMsg("Elige el artículo."); if (!(cant > 0)) return setMsg("La cantidad debe ser mayor a 0."); if (f.precio === "" || precio < 0) return setMsg("Escribe el precio unitario pagado (puede ser 0 si fue un regalo).");
    setOcup(true); const { error } = await supabase.rpc("registrar_compra", { p_material: m.id, p_almacen: f.almacen, p_cantidad: cant, p_precio: precio, p_proveedor: f.proveedor || null, p_ref: null }); setOcup(false);
    if (error) return setMsg(error.message); setOk(`Ingresaron ${cant} ${m.unidad} de ${m.nombre} a ${precio ? bs(precio) : "precio 0"} cada una.`); setF({ ...f, cantidad: "1" }); onListo();
  };
  return <div className="card"><h2>Ingresar material a un almacén</h2>{msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="form" style={{ gridTemplateColumns: "1fr" }}>
      <Campo l="Almacén de destino"><select value={f.almacen} onChange={e => setF({ ...f, almacen: e.target.value })}>{A.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></Campo>
      <Campo l="Artículo"><select value={f.material} onChange={e => elegir(e.target.value)} disabled={!!materialInicial}><option value="">Elige…</option>{M.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>
      <Campo l="Cantidad"><input type="number" min={0} step="any" value={f.cantidad} onChange={e => setF({ ...f, cantidad: e.target.value })} /></Campo>
      <Campo l="Precio unitario pagado (Bs)"><input type="number" min={0} step={0.01} value={f.precio} onChange={e => setF({ ...f, precio: e.target.value })} /></Campo>
      <Campo l="Proveedor"><input list="prov-inv" value={f.proveedor} onChange={e => setF({ ...f, proveedor: e.target.value })} /><datalist id="prov-inv">{PROVEEDORES.map(p => <option key={p} value={p} />)}</datalist></Campo></div>
    {m && cant > 0 && <p className="mute" style={{ margin: "8px 0 0" }}>Total de la compra: <b>{bs(cant * precio)}</b>. {n(m.costo) !== precio && antes > 0 ? <>El costo promedio del artículo pasa de {bs(m.costo)} a <b>{bs(nuevoCosto)}</b>.</> : null}{antes === 0 && n(m.costo) !== precio ? <>El costo del artículo pasa a <b>{bs(precio)}</b>.</> : null}</p>}
    <button className="btn" style={{ width: "100%", marginTop: 8 }} disabled={ocup} onClick={guardar}>{ocup ? "Ingresando…" : "Ingresar al almacén"}</button>
    <p className="mute" style={{ margin: "8px 0 0" }}>El precio que escribes queda anotado en este ingreso. Si fue con descuento, escribe lo que pagaste: el costo del artículo se recalcula como promedio con lo que ya tenías.</p></div>;
}

export function Almacenes({ A, M, S, zonaAlmacen, recargar, pid }: any) {
  const [sel, setSel] = useState(zonaAlmacen || A[0]?.id || ""), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false);
  const [mv, setMv] = useState({ material: "", desde: A.find((a: any) => a.tipo === "central")?.id || A[0]?.id || "", hacia: zonaAlmacen || "", cantidad: "1" });
  const movs = useQuery(() => supabase.from("movimientos").select("*, materiales(nombre, unidad), origen:almacenes!movimientos_almacen_origen_fkey(nombre), destino:almacenes!movimientos_almacen_destino_fkey(nombre)").eq("proyecto_id", pid).order("fecha", { ascending: false }).limit(40), [pid, S]);
  const valor = (a: string) => M.reduce((s: number, m: any) => s + cantEn(S, m.id, a) * n(m.costo), 0), arts = (a: string) => M.filter((m: any) => cantEn(S, m.id, a) > 0).length;
  const alm = A.find((a: any) => a.id === sel), hay = M.filter((m: any) => cantEn(S, m.id, sel) > 0);
  const mm = M.find((m: any) => m.id === mv.material), enOrigen = mm ? cantEn(S, mm.id, mv.desde) : 0;
  const mover = async () => {
    setMsg(""); setOk(""); if (!mm) return setMsg("Elige el artículo."); if (!mv.desde || !mv.hacia) return setMsg("Elige el origen y el destino."); if (mv.desde === mv.hacia) return setMsg("El origen y el destino deben ser distintos."); if (!(n(mv.cantidad) > 0)) return setMsg("La cantidad debe ser mayor a 0."); if (n(mv.cantidad) > enOrigen) return setMsg(`En el origen solo hay ${enOrigen}.`);
    setOcup(true); const { error } = await supabase.rpc("registrar_movimiento", { p_tipo: "TRANSFERENCIA", p_material: mm.id, p_origen: mv.desde, p_destino: mv.hacia, p_cantidad: n(mv.cantidad), p_ref: null, p_proveedor: null }); setOcup(false);
    if (error) return setMsg(error.message); setOk(`Se movieron ${mv.cantidad} ${mm.unidad} de ${mm.nombre}.`); recargar();
  };
  const selA = (v: string, f: (x: string) => void) => <select value={v} onChange={e => f(e.target.value)}><option value="">Elige…</option>{A.map((a: any) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select>;
  return <>
    <div className="grid gk" style={{ marginBottom: 14 }}>{A.map((a: any) => <button key={a.id} className="card kpi" style={{ textAlign: "left", cursor: "pointer", color: "var(--ink)", borderTopColor: a.id === sel ? "var(--acc)" : undefined, borderTopWidth: 3 }} onClick={() => setSel(a.id)}><span>{a.nombre}</span><b>{bs(valor(a.id))}</b><small className="mute"><span style={{ color: "var(--acct)" }}>{arts(a.id)} artículos</span> · tocar para ver</small></button>)}</div>
    <div className="card tw"><h2>Qué hay en {alm?.nombre}</h2>{hay.length ? <table><thead><tr><th>Código</th><th>Artículo</th><th>Cantidad</th><th>Costo</th><th>Valor</th></tr></thead><tbody>{hay.map((m: any) => <tr key={m.id}><td>{m.codigo}</td><td><b>{m.nombre}</b></td><td>{cantEn(S, m.id, sel)} {m.unidad}</td><td>{bs(m.costo)}</td><td>{bs(cantEn(S, m.id, sel) * n(m.costo))}</td></tr>)}</tbody></table> : <p className="mute">Este almacén está vacío. Ingresa material o muévelo desde otro almacén.</p>}</div>
    <div className="grid g2" style={{ alignItems: "start" }}>
      <FormIngreso key={sel} A={A} M={M} S={S} almacenInicial={sel} onListo={recargar} />
      <div className="card"><h2>Mover material de un almacén a otro</h2>{msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
        <div className="form" style={{ gridTemplateColumns: "1fr" }}>
          <Campo l="Artículo"><select value={mv.material} onChange={e => setMv({ ...mv, material: e.target.value })}><option value="">Elige…</option>{M.map((m: any) => <option key={m.id} value={m.id}>{m.nombre} (hay {totalDe(S, m.id)})</option>)}</select></Campo>
          <Campo l="Desde">{selA(mv.desde, v => setMv({ ...mv, desde: v }))}</Campo>{mm && <p className="mute" style={{ margin: 0 }}>En el origen hay: <b>{enOrigen}</b></p>}
          <Campo l="Hacia">{selA(mv.hacia, v => setMv({ ...mv, hacia: v }))}</Campo>
          <Campo l="Cantidad"><input type="number" min={0} step="any" value={mv.cantidad} onChange={e => setMv({ ...mv, cantidad: e.target.value })} /></Campo></div>
        <button className="btn" style={{ width: "100%", marginTop: 8 }} disabled={ocup} onClick={mover}>{ocup ? "Moviendo…" : "Mover material"}</button></div></div>
    <div className="card tw"><h2>Material por almacén</h2>{M.length ? <table><thead><tr><th>Artículo</th>{A.map((a: any) => <th key={a.id}>{a.nombre}</th>)}<th>Total</th></tr></thead>
      <tbody>{M.map((m: any) => { const t = totalDe(S, m.id); return <tr key={m.id}><td>{m.nombre}</td>{A.map((a: any) => <td key={a.id} style={cantEn(S, m.id, a.id) ? { color: "var(--acct)", fontWeight: 600 } : { color: "var(--mute)" }}>{cantEn(S, m.id, a.id)}</td>)}<td><b>{t}</b></td></tr>; })}</tbody></table> : <Vacio>Aún no hay materiales. Créalos en Materiales y equipos.</Vacio>}</div>
    <div className="card tw"><h2>Movimientos recientes</h2>{movs.loading ? <Cargando /> : ((movs.data as any[]) || []).length ? <table><thead><tr><th>Fecha</th><th>Tipo</th><th>Artículo</th><th>Cantidad</th><th>Precio</th><th>Desde</th><th>Hacia</th><th>Detalle</th></tr></thead>
      <tbody>{((movs.data as any[]) || []).map(x => <tr key={x.id}><td>{String(x.fecha).slice(0, 10)}</td><td>{x.tipo}</td><td>{x.materiales?.nombre}</td><td>{x.cantidad} {x.materiales?.unidad}</td><td>{x.costo_unitario != null ? bs(x.costo_unitario) : "—"}</td><td>{x.origen?.nombre || "—"}</td><td>{x.destino?.nombre || "—"}</td><td>{x.proveedor ? "Proveedor " + x.proveedor : x.referencia || "—"}</td></tr>)}</tbody></table> : <Vacio>Aún no hay movimientos.</Vacio>}</div>
  </>;
}
