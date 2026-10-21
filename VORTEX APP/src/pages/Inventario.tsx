import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Tabs, Vacio, bs, useAlcance, useQuery, useProyecto } from "../lib/ui";
import Crud from "../lib/crud";

export default function Inventario() {
  const { proyectoId } = useApp(), al = useAlcance(), pid = useProyecto(), [tab, setTab] = useState("alm"), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [mv, setMv] = useState({ tipo: "ENTRADA", material: "", origen: "", destino: "", cant: "1", prov: "Digicorp", ref: "" });
  const alm = useQuery(() => al(supabase.from("almacenes").select("*").order("tipo").order("nombre"), false), [proyectoId]);
  const mat = useQuery(() => al(supabase.from("materiales").select("*").order("nombre"), false), [proyectoId]);
  const stk = useQuery(() => al(supabase.from("stock").select("cantidad, almacen_id, material_id"), false), [proyectoId, ok]);
  const movs = useQuery(() => tab === "mov" ? al(supabase.from("movimientos").select("*, materiales(nombre), origen:almacenes!movimientos_almacen_origen_fkey(nombre), destino:almacenes!movimientos_almacen_destino_fkey(nombre)").order("fecha", { ascending: false }).limit(200), false) : Promise.resolve({ data: [], error: null }), [tab, proyectoId, ok]);
  const A: any[] = (alm.data as any[]) || [], M: any[] = (mat.data as any[]) || [], S: any[] = (stk.data as any[]) || [];
  const cant = (m: string, a: string) => S.find(x => x.material_id === m && x.almacen_id === a)?.cantidad || 0;
  const mover = async () => {
    setMsg(""); setOk(""); if (!mv.material) return setMsg("Elige el material.");
    const { error } = await supabase.rpc("registrar_movimiento", { p_tipo: mv.tipo, p_material: mv.material, p_origen: mv.origen || null, p_destino: mv.destino || null, p_cantidad: +mv.cant, p_ref: mv.ref || null, p_proveedor: mv.tipo === "ENTRADA" ? mv.prov : null });
    if (error) setMsg(error.message); else { setOk("Movimiento registrado."); stk.recargar(); }
  };
  const sal = ["SALIDA", "TRANSFERENCIA", "INSTALACION", "MANTENIMIENTO", "BAJA", "AJUSTE_NEGATIVO"].includes(mv.tipo), ent = ["ENTRADA", "TRANSFERENCIA", "DEVOLUCION", "AJUSTE_POSITIVO"].includes(mv.tipo);
  const selA = (v: string, f: (x: string) => void) => <select value={v} onChange={e => f(e.target.value)}><option value="">—</option>{A.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select>;
  return <>
    <h1>Inventario y almacenes</h1>
    <Tabs items={[["alm", "Almacenes"], ["mat", "Materiales"], ["mov", "Movimientos"], ["eq", "Equipos con serie"]]} valor={tab} onChange={setTab} />
    {tab === "alm" && <>{alm.loading || mat.loading ? <Cargando /> : <>
      <div className="grid gk" style={{ marginBottom: 14 }}>{A.map(a => <div key={a.id} className="card kpi"><span>{a.nombre}</span><b>{bs(M.reduce((s, m) => s + cant(m.id, a.id) * +m.costo, 0))}</b><small className="mute">{M.filter(m => cant(m.id, a.id) > 0).length} artículos</small></div>)}</div>
      <div className="grid g2"><div className="card"><h2>Ingresar, mover o sacar material</h2>{msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
        <Campo l="Tipo de movimiento"><select value={mv.tipo} onChange={e => setMv({ ...mv, tipo: e.target.value })}>{["ENTRADA", "TRANSFERENCIA", "SALIDA", "INSTALACION", "MANTENIMIENTO", "DEVOLUCION", "AJUSTE_POSITIVO", "AJUSTE_NEGATIVO", "BAJA"].map(t => <option key={t}>{t}</option>)}</select></Campo>
        <Campo l="Material"><select value={mv.material} onChange={e => setMv({ ...mv, material: e.target.value })}><option value="">Elige…</option>{M.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></Campo>
        {sal && <Campo l="Desde el almacén">{selA(mv.origen, v => setMv({ ...mv, origen: v }))}</Campo>}{ent && <Campo l="Hacia el almacén">{selA(mv.destino, v => setMv({ ...mv, destino: v }))}</Campo>}
        <Campo l="Cantidad"><input type="number" min="1" value={mv.cant} onChange={e => setMv({ ...mv, cant: e.target.value })} /></Campo>{mv.tipo === "ENTRADA" && <Campo l="Proveedor"><input value={mv.prov} onChange={e => setMv({ ...mv, prov: e.target.value })} /></Campo>}<Campo l="Referencia / motivo"><input value={mv.ref} onChange={e => setMv({ ...mv, ref: e.target.value })} /></Campo>
        <button className="btn" onClick={mover}>Registrar</button><p className="mute">El sistema no deja sacar más de lo que hay en el almacén. Los ajustes y bajas los autoriza el administrador.</p></div>
        <div className="card tw"><h2>Qué hay en cada almacén</h2>{M.length ? <table><thead><tr><th>Material</th>{A.map(a => <th key={a.id}>{a.nombre}</th>)}<th>Total</th></tr></thead><tbody>{M.map(m => { const t = A.reduce((s, a) => s + +cant(m.id, a.id), 0); return <tr key={m.id}><td>{m.nombre}{t < +m.minimo && <span className="tag e-VENCIDO" style={{ marginLeft: 4 }}>Bajo mínimo</span>}</td>{A.map(a => <td key={a.id}>{cant(m.id, a.id)}</td>)}<td><b>{t}</b></td></tr>; })}</tbody></table> : <Vacio>Aún no hay materiales. Créalos en la pestaña Materiales.</Vacio>}</div></div></>}</>}
    {tab === "mat" && <Crud titulo="Materiales" tabla="materiales" orden="nombre" campos={[{ k: "nombre", l: "Nombre", req: true }, { k: "categoria", l: "Categoría" }, { k: "unidad", l: "Unidad", def: "u" }, { k: "costo", l: "Costo unitario (Bs)", t: "number", def: 0 }, { k: "minimo", l: "Stock mínimo", t: "number", def: 0 }, { k: "proveedor", l: "Proveedor", def: "Digicorp" }]} />}
    {tab === "mov" && <div className="card tw"><h2>Movimientos</h2>{movs.loading ? <Cargando /> : ((movs.data as any[]) || []).length ? <table><thead><tr><th>Fecha</th><th>Tipo</th><th>Material</th><th>Cant.</th><th>Desde</th><th>Hacia</th><th>Detalle</th></tr></thead><tbody>{((movs.data as any[]) || []).map(x => <tr key={x.id}><td>{x.fecha.slice(0, 10)}</td><td>{x.tipo}</td><td>{x.materiales?.nombre}</td><td>{x.cantidad}</td><td>{x.origen?.nombre || "—"}</td><td>{x.destino?.nombre || "—"}</td><td>{x.proveedor ? "Proveedor " + x.proveedor : x.referencia || "—"}</td></tr>)}</tbody></table> : <Vacio>Aún no hay movimientos.</Vacio>}</div>}
    {tab === "eq" && pid && <Crud titulo="Equipos con número de serie" tabla="equipos_serie" campos={[{ k: "serie", l: "Serie", req: true }, { k: "modelo", l: "Modelo" }, { k: "mac", l: "MAC" }, { k: "estado", l: "Estado", t: "select", opts: ["ALMACEN", "INSTALADO", "MANTENIMIENTO", "DESCARTE", "PENDIENTE"], def: "ALMACEN" }, { k: "proveedor", l: "Proveedor", def: "Digicorp" }, { k: "cliente_anterior", l: "Cliente anterior" }, { k: "foto_path", l: "Foto del equipo", t: "archivo", bucket: "fotos" }]} columnas={["serie", "modelo", "mac", "estado", "proveedor", "cliente_anterior"]} />}
    {tab === "eq" && !pid && <Aviso>Elige un proyecto arriba para registrar equipos.</Aviso>}
  </>;
}
