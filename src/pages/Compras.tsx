import { useState } from "react";
import { supabase, subirArchivo, urlArchivo } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { aPapelera } from "../lib/papelera";
import { Aviso, Campo, Cargando, Kpi, Vacio, bs, hoy, useQuery } from "../lib/ui";

const n = (x: any) => Number(x) || 0;
const CATEGORIAS = ["Herramienta", "Equipo de medición", "Vehículo", "Mobiliario", "Otros"];
const ESTADOS = ["En uso", "Almacén", "En mantenimiento"];
const orden = (a: any) => (a.tipo === "central" ? 0 : a.tipo === "zona" ? 1 : 2);

/** Herramientas y equipos de la empresa (fusionadora, escaleras, medidores…). Todo lo que se registra aquí entra también al inventario del proyecto, en el almacén que elijas. */
export default function Compras() {
  const { proyectos, proyectoId } = useApp();
  const lista = useQuery(() => supabase.from("compras_empresa").select("*").order("fecha", { ascending: false }).order("creado_en", { ascending: false }).limit(1000), []);
  const alm = useQuery(() => supabase.from("almacenes").select("id, nombre, tipo, proyecto_id").order("nombre"), []);
  const proyDef = proyectoId || proyectos.find(p => p.nombre === "Vortex")?.id || proyectos[0]?.id || "";
  const A: any[] = (alm.data as any[]) || [], almDe = (pid: string) => A.filter(a => a.proyecto_id === pid).sort((a, b) => orden(a) - orden(b) || a.nombre.localeCompare(b.nombre));
  const vacio = { articulo: "", categoria: "Herramienta", cantidad: "1", costo_unitario: "", fecha: hoy(), proveedor: "", proyecto: proyDef, almacen: "", estado: "En uso" };
  const [f, setF] = useState(vacio), [arch, setArch] = useState<File | null>(null), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false);
  const L: any[] = (lista.data as any[]) || [], total = L.reduce((s, x) => s + n(x.cantidad) * n(x.costo_unitario), 0), piezas = L.reduce((s, x) => s + n(x.cantidad), 0);
  const proy = f.proyecto || proyDef, opciones = almDe(proy), almSel = f.almacen || opciones.find(a => a.tipo === "central")?.id || "";
  const nombreProy = (id: string) => proyectos.find(p => p.id === id)?.nombre || "";

  const guardar = async () => {
    setMsg(""); setOk("");
    if (!f.articulo.trim()) return setMsg("Escribe el nombre del artículo.");
    if (n(f.cantidad) < 1) return setMsg("La cantidad debe ser 1 o más.");
    if (!proy) return setMsg("Primero crea un proyecto (Configuración → Socios y proyectos).");
    setOcup(true);
    try {
      const foto = arch ? await subirArchivo("comprobantes", "empresa", arch) : null;
      const { error } = await supabase.rpc("registrar_compra_empresa", { p: { articulo: f.articulo.trim(), categoria: f.categoria.trim() || "Otros", cantidad: Math.round(n(f.cantidad)), costo_unitario: n(f.costo_unitario), fecha: f.fecha, proveedor: f.proveedor || null, estado: f.estado, foto_path: foto, proyecto_id: proy, almacen_id: almSel || null } });
      if (error) throw new Error(error.message);
      setOk(`Compra guardada y agregada al inventario (${opciones.find(a => a.id === almSel)?.nombre || "almacén central"}).`); setF({ ...vacio, categoria: f.categoria, proyecto: f.proyecto, almacen: f.almacen }); setArch(null); lista.recargar();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  const mover = async (x: any, almacen: string) => { setMsg(""); setOk(""); const { error } = await supabase.rpc("mover_compra_empresa", { p_compra: x.id, p_almacen: almacen }); if (error) setMsg(error.message); else { setOk("Lugar cambiado: el material se movió de almacén en el inventario."); lista.recargar(); } };
  const alInventario = async (x: any) => { setMsg(""); setOk(""); const { error: e1 } = await supabase.from("compras_empresa").update({ proyecto_id: proyDef }).eq("id", x.id); if (e1) return setMsg(e1.message); const { error } = await supabase.rpc("ingresar_compra_empresa", { p_compra: x.id }); if (error) setMsg(error.message); else { setOk(`"${x.articulo}" pasó al inventario.`); lista.recargar(); } };
  const cambiar = async (x: any, cambios: any) => { setMsg(""); const { error } = await supabase.from("compras_empresa").update(cambios).eq("id", x.id); if (error) setMsg(error.message); else lista.recargar(); };
  const quitar = async (x: any) => { if (!confirm(`¿Mandar "${x.articulo}" a la papelera?\n\nNada se elimina: podrás restaurarlo desde el menú Papelera. El inventario no cambia; si fue un error, corrígelo en Inventario → Materiales y equipos → Quitar.`)) return; try { await aPapelera("compras_empresa", [x.id]); lista.recargar(); } catch (e: any) { setMsg(e.message); } };
  const ver = async (ruta: string) => { const u = await urlArchivo("comprobantes", ruta); if (u) window.open(u, "_blank"); else setMsg("No se pudo abrir el archivo."); };

  return <>
    <Aviso>Herramientas y equipos de la empresa (fusionadora, escaleras, medidores…). <b>Todo lo que registres aquí entra también al inventario</b> del proyecto que elijas, en el almacén que elijas, con el precio que pagaste. Solo los administradores principales lo ven.</Aviso>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="grid gk" style={{ marginBottom: 14 }}><Kpi t="Artículos registrados" v={piezas} /><Kpi t="Inversión total" v={bs(total)} /></div>
    <div className="grid g2" style={{ alignItems: "start" }}>
      <div className="card"><h2>Nueva compra</h2><div className="form" style={{ gridTemplateColumns: "1fr" }}>
        <Campo l="Artículo"><input value={f.articulo} onChange={e => setF({ ...f, articulo: e.target.value })} /></Campo>
        <Campo l="Categoría"><input list="cat-compras" value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })} /><datalist id="cat-compras">{CATEGORIAS.map(c => <option key={c} value={c} />)}</datalist></Campo>
        <Campo l="Cantidad"><input type="number" min={1} value={f.cantidad} onChange={e => setF({ ...f, cantidad: e.target.value })} /></Campo>
        <Campo l="Costo por unidad (Bs)"><input type="number" min={0} step={0.01} value={f.costo_unitario} onChange={e => setF({ ...f, costo_unitario: e.target.value })} /></Campo>
        <Campo l="Fecha de compra"><input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></Campo>
        <Campo l="Proveedor"><input value={f.proveedor} onChange={e => setF({ ...f, proveedor: e.target.value })} /></Campo>
        {proyectos.length > 1 && <Campo l="Proyecto (de su inventario)"><select value={proy} onChange={e => setF({ ...f, proyecto: e.target.value, almacen: "" })}>{proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>}
        <Campo l="Almacén donde queda (o quién lo tiene)"><select value={almSel} onChange={e => setF({ ...f, almacen: e.target.value })}>{opciones.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></Campo>
        <Campo l="Estado"><select value={f.estado} onChange={e => setF({ ...f, estado: e.target.value })}>{ESTADOS.map(u => <option key={u}>{u}</option>)}</select></Campo>
        <Campo l="Factura o foto"><input type="file" key={String(ok)} onChange={e => setArch(e.target.files?.[0] || null)} /></Campo>
      </div><button className="btn" style={{ width: "100%", marginTop: 8 }} disabled={ocup} onClick={guardar}>{ocup ? "Guardando…" : "Guardar compra"}</button></div>

      <div className="card tw"><h2>Compras de la empresa</h2>{lista.loading || alm.loading ? <Cargando /> : L.length ? <table style={{ minWidth: 0 }}><thead><tr><th>Artículo</th><th>Cant.</th><th>Total</th><th>Almacén (inventario)</th><th>Estado</th><th /></tr></thead>
        <tbody>{L.map(x => <tr key={x.id}><td>{x.articulo}<br /><small className="mute">{x.categoria} · {x.fecha}{x.proveedor ? " · " + x.proveedor : ""}{proyectos.length > 1 && x.proyecto_id ? " · " + nombreProy(x.proyecto_id) : ""}</small></td><td>{x.cantidad}</td><td>{bs(n(x.cantidad) * n(x.costo_unitario))}</td>
          <td>{x.material_id && x.proyecto_id ? <select value={x.almacen_id || ""} onChange={e => mover(x, e.target.value)}>{almDe(x.proyecto_id).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select> : <><small className="mute">{x.ubicacion || "Sin ubicación"} · no está en el inventario</small><br /><button className="btn chico" onClick={() => alInventario(x)}>Pasar al inventario</button></>}</td>
          <td><select value={x.estado} onChange={e => cambiar(x, { estado: e.target.value })}>{ESTADOS.map(u => <option key={u}>{u}</option>)}</select></td>
          <td><div className="fila">{x.foto_path && <button className="btn suave chico" onClick={() => ver(x.foto_path)}>Ver</button>}<button className="btn suave chico" onClick={() => quitar(x)}>Papelera</button></div></td></tr>)}</tbody></table> : <Vacio>Aún no hay compras registradas.</Vacio>}
        <p className="mute" style={{ marginTop: 10 }}>Si cambias el almacén de una compra, el material se mueve también en el inventario. Lo que mandes a la papelera lo recuperas desde Configuración → Papelera.</p></div>
    </div>
  </>;
}
