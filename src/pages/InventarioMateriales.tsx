import { useState } from "react";
import { supabase } from "../lib/supabase";
import { aPapelera } from "../lib/papelera";
import { Aviso, Campo, Vacio, bs, useProyecto } from "../lib/ui";
import { Drawer } from "../lib/drawer";
import { FormModal } from "../lib/formmodal";
import Crud from "../lib/crud";
import { FormIngreso, PROVEEDORES, cantEn } from "./InventarioAlmacenes";

const n = (x: any) => Number(x) || 0;
const CATEGORIAS = ["ONT/ONU", "Cable", "Ferretería", "Accesorio", "Conector", "Herramienta", "Otros"];

export function MaterialesEquipos(p: any) {
  const [sub, setSub] = useState("mat"), pid = useProyecto() || p.pid;
  return <>
    <div className="subtabs">{[["mat", "Materiales"], ["eq", "Equipos con serie"]].map(([k, l]) => <button key={k} className={sub === k ? "on" : ""} onClick={() => setSub(k)}>{l}</button>)}</div>
    {sub === "mat" && <Materiales {...p} />}
    {sub === "eq" && (pid ? <Crud titulo="Equipos con número de serie" tabla="equipos_serie" campos={[{ k: "serie", l: "Serie", req: true }, { k: "modelo", l: "Modelo" }, { k: "mac", l: "MAC" }, { k: "estado", l: "Estado", t: "select", opts: ["ALMACEN", "INSTALADO", "MANTENIMIENTO", "DESCARTE", "PENDIENTE"], def: "ALMACEN" }, { k: "proveedor", l: "Proveedor", def: "Digicorp" }, { k: "cliente_anterior", l: "Cliente anterior" }, { k: "foto_path", l: "Foto del equipo", t: "archivo", bucket: "fotos" }]} columnas={["serie", "modelo", "mac", "estado", "proveedor", "cliente_anterior"]} /> : <Aviso>Primero elige un proyecto o una zona.</Aviso>)}
  </>;
}

function Materiales({ pid, A, M, S, recargar }: any) {
  const central = A.find((a: any) => a.tipo === "central")?.id || A[0]?.id || "";
  const [alm, setAlm] = useState(central), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [panel, setPanel] = useState<any>(null), [ed, setEd] = useState<any>(null), [ocup, setOcup] = useState(false);
  const vacio = { nombre: "", categoria: "Otros", unidad: "u", stock: "0", minimo: "0", costo: "0", destino: central, proveedor: "Digicorp", marca: "", modelo: "" }, [f, setF] = useState(vacio);
  const nombreAlm = A.find((a: any) => a.id === alm)?.nombre;

  const agregar = async () => {
    setMsg(""); setOk(""); if (!f.nombre.trim()) return setMsg("Escribe el nombre del material.");
    setOcup(true);
    try {
      const { data, error } = await supabase.from("materiales").insert({ proyecto_id: pid, nombre: f.nombre.trim(), categoria: f.categoria || null, unidad: f.unidad || "u", minimo: n(f.minimo), costo: n(f.costo), proveedor: f.proveedor || null, marca: f.marca || null, modelo: f.modelo || null }).select("id").single();
      if (error) throw new Error(/duplicate key|unique/i.test(error.message) ? "Ya existe un material con ese nombre." : error.message);
      if (n(f.stock) > 0) { const r = await supabase.rpc("registrar_compra", { p_material: (data as any).id, p_almacen: f.destino || central, p_cantidad: n(f.stock), p_precio: n(f.costo), p_proveedor: f.proveedor || null, p_ref: "Stock inicial" }); if (r.error) throw new Error("El material se creó, pero no se pudo ingresar el stock: " + r.error.message); }
      setOk(`"${f.nombre.trim()}" agregado al catálogo.`); setF({ ...vacio, destino: f.destino }); recargar();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  const guardar = async (m: any, cambios: any) => { setMsg(""); const { error } = await supabase.from("materiales").update(cambios).eq("id", m.id); if (error) setMsg(error.message); else recargar(); };
  const quitar = async (m: any) => { if (!confirm(`¿Mandar "${m.nombre}" a la papelera? Podrás recuperarlo desde Configuración → Papelera.`)) return; try { await aPapelera("materiales", [m.id]); recargar(); } catch (e: any) { setMsg(e.message); } };
  const set = (k: string, v: any) => setF(x => ({ ...x, [k]: v }));

  return <>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="card"><h2>Nuevo material</h2>
      <div className="form" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
        <Campo l="Nombre"><input value={f.nombre} onChange={e => set("nombre", e.target.value)} /></Campo>
        <Campo l="Categoría"><input list="cat-mat" value={f.categoria} onChange={e => set("categoria", e.target.value)} /><datalist id="cat-mat">{CATEGORIAS.map(c => <option key={c} value={c} />)}</datalist></Campo>
        <Campo l="Unidad"><input value={f.unidad} onChange={e => set("unidad", e.target.value)} /></Campo>
        <Campo l="Stock inicial"><input type="number" min={0} step="any" value={f.stock} onChange={e => set("stock", e.target.value)} /></Campo>
        <Campo l="Stock mínimo"><input type="number" min={0} step="any" value={f.minimo} onChange={e => set("minimo", e.target.value)} /></Campo>
        <Campo l="Costo (Bs)"><input type="number" min={0} step={0.01} value={f.costo} onChange={e => set("costo", e.target.value)} /></Campo>
        <Campo l="Almacén de destino"><select value={f.destino} onChange={e => set("destino", e.target.value)}>{A.map((a: any) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></Campo>
        <Campo l="Proveedor"><input list="prov-mat" value={f.proveedor} onChange={e => set("proveedor", e.target.value)} /><datalist id="prov-mat">{PROVEEDORES.map(x => <option key={x} value={x} />)}</datalist></Campo>
        <Campo l="Marca (opcional)"><input value={f.marca} onChange={e => set("marca", e.target.value)} /></Campo>
        <Campo l="Modelo (opcional)"><input value={f.modelo} onChange={e => set("modelo", e.target.value)} /></Campo>
        <div style={{ alignSelf: "end" }}><button className="btn" style={{ width: "100%" }} disabled={ocup} onClick={agregar}>{ocup ? "Agregando…" : "Agregar al catálogo"}</button></div></div></div>

    <div className="card tw"><div className="fila entre"><h2>Stock de {nombreAlm}</h2><select value={alm} onChange={e => setAlm(e.target.value)}>{A.map((a: any) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></div>
      <p className="mute" style={{ marginTop: 0 }}>Las instalaciones y los mantenimientos descuentan solos. Aquí agregas compras o quitas por pérdida o ajuste. El costo de cada artículo se puede cambiar directamente (por ejemplo, si lo compraste con descuento).</p>
      {M.length ? <table><thead><tr><th>Artículo</th><th>Categoría</th><th>Stock</th><th>Mínimo</th><th>Costo (Bs)</th><th>Acciones</th></tr></thead>
        <tbody>{M.map((m: any) => { const s = cantEn(S, m.id, alm); return <tr key={m.id}><td><b>{m.nombre}</b><br /><small className="mute">{m.codigo}{m.marca ? " · " + m.marca : ""}{m.modelo ? " " + m.modelo : ""}</small></td><td>{m.categoria || "—"}</td>
          <td><b>{s}</b> {m.unidad} {s < n(m.minimo) && <span className="pill warn" style={{ marginLeft: 4 }}>Bajo mínimo</span>}</td>
          <td><input type="number" min={0} step="any" style={{ width: 80 }} defaultValue={n(m.minimo)} key={m.id + "min" + m.minimo} onBlur={e => n(e.target.value) !== n(m.minimo) && guardar(m, { minimo: n(e.target.value) })} /></td>
          <td><input type="number" min={0} step={0.01} style={{ width: 90 }} defaultValue={n(m.costo)} key={m.id + "c" + m.costo} title="Costo por unidad: se puede cambiar" onBlur={e => n(e.target.value) !== n(m.costo) && guardar(m, { costo: n(e.target.value) })} /></td>
          <td><div className="fila"><button className="btn chico" onClick={() => setPanel({ t: "comprar", m })}>Comprar</button><button className="btn suave chico" onClick={() => setPanel({ t: "quitar", m })}>Quitar</button><button className="btn suave chico" onClick={() => setEd(m)}>Editar</button><button className="btn suave chico" onClick={() => quitar(m)}>Papelera</button></div></td></tr>; })}</tbody></table> : <Vacio>Aún no hay materiales. Agrega el primero arriba.</Vacio>}</div>

    {panel?.t === "comprar" && <Drawer titulo={"Comprar · " + panel.m.nombre} onClose={() => setPanel(null)}><FormIngreso A={A} M={M} S={S} almacenInicial={alm} materialInicial={panel.m.id} onListo={recargar} /></Drawer>}
    {panel?.t === "quitar" && <Drawer titulo={"Quitar · " + panel.m.nombre} onClose={() => setPanel(null)}><FormQuitar m={panel.m} A={A} S={S} almInicial={alm} onListo={() => { recargar(); }} /></Drawer>}
    {ed && <FormModal titulo={"Editar · " + ed.nombre} valores={ed} onClose={() => setEd(null)} campos={[{ k: "nombre", l: "Nombre", req: true }, { k: "categoria", l: "Categoría" }, { k: "unidad", l: "Unidad", req: true }, { k: "marca", l: "Marca" }, { k: "modelo", l: "Modelo" }, { k: "proveedor", l: "Proveedor" }]}
      onGuardar={async v => { const { error } = await supabase.from("materiales").update(v).eq("id", ed.id); if (error) return /duplicate key|unique/i.test(error.message) ? "Ya existe un material con ese nombre." : error.message; recargar(); }} />}
  </>;
}

const TIPOS_QUITAR: [string, string, string][] = [["BAJA", "Pérdida o daño", "Se pierde, se daña o se descarta."], ["SALIDA", "Salida manual", "Sale del almacén por un motivo que anotas."], ["AJUSTE_NEGATIVO", "Corregir conteo: había menos", "El conteo real es menor al del sistema."], ["AJUSTE_POSITIVO", "Corregir conteo: había más", "El conteo real es mayor al del sistema."]];
function FormQuitar({ m, A, S, almInicial, onListo }: { m: any; A: any[]; S: any[]; almInicial: string; onListo: () => void }) {
  const [f, setF] = useState({ tipo: "BAJA", almacen: almInicial, cantidad: "1", motivo: "" }), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false);
  const hay = cantEn(S, m.id, f.almacen), suma = f.tipo === "AJUSTE_POSITIVO";
  const guardar = async () => {
    setMsg(""); setOk(""); if (!(n(f.cantidad) > 0)) return setMsg("La cantidad debe ser mayor a 0."); if (!suma && n(f.cantidad) > hay) return setMsg(`En ese almacén solo hay ${hay}.`); if (!f.motivo.trim()) return setMsg("Escribe el motivo: queda registrado.");
    setOcup(true); const { error } = await supabase.rpc("registrar_movimiento", { p_tipo: f.tipo, p_material: m.id, p_origen: suma ? null : f.almacen, p_destino: suma ? f.almacen : null, p_cantidad: n(f.cantidad), p_ref: f.motivo.trim(), p_proveedor: null }); setOcup(false);
    if (error) return setMsg(error.message); setOk("Registrado."); setF({ ...f, cantidad: "1", motivo: "" }); onListo();
  };
  return <div>{msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="form" style={{ gridTemplateColumns: "1fr" }}>
      <Campo l="¿Qué pasó?"><select value={f.tipo} onChange={e => setF({ ...f, tipo: e.target.value })}>{TIPOS_QUITAR.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Campo>
      <Campo l="Almacén"><select value={f.almacen} onChange={e => setF({ ...f, almacen: e.target.value })}>{A.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></Campo><p className="mute" style={{ margin: 0 }}>Ahí hay: <b>{hay}</b> {m.unidad}</p>
      <Campo l="Cantidad"><input type="number" min={0} step="any" value={f.cantidad} onChange={e => setF({ ...f, cantidad: e.target.value })} /></Campo>
      <Campo l="Motivo"><input value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })} placeholder="Ej.: se mojó, se perdió en el viaje" /></Campo></div>
    <p className="mute">{TIPOS_QUITAR.find(t => t[0] === f.tipo)?.[2]} Las pérdidas y los ajustes los autoriza el administrador.</p>
    <button className="btn" style={{ width: "100%" }} disabled={ocup} onClick={guardar}>{ocup ? "Guardando…" : "Registrar"}</button></div>;
}
