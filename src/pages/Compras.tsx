import { useState } from "react";
import { supabase, subirArchivo, urlArchivo } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { aPapelera } from "../lib/papelera";
import { Aviso, Campo, Cargando, Kpi, Vacio, bs, hoy, useQuery } from "../lib/ui";

const n = (x: any) => Number(x) || 0;
const CATEGORIAS = ["Herramienta", "Equipo de medición", "Vehículo", "Mobiliario", "Otros"];
const ESTADOS = ["En uso", "Almacén", "En mantenimiento"];

/** Herramientas y equipos de toda la empresa (fusionadora, escaleras, medidores…). No pertenecen a ninguna zona. */
export default function Compras() {
  const { zonas } = useApp();
  const lista = useQuery(() => supabase.from("compras_empresa").select("*").order("fecha", { ascending: false }).order("creado_en", { ascending: false }).limit(1000), []);
  const ubicaciones = ["Almacén central", ...zonas.map(z => "Almacén " + z.nombre), "Vehículo / técnico", "En uso (técnico)"];
  const vacio = { articulo: "", categoria: "Herramienta", cantidad: "1", costo_unitario: "", fecha: hoy(), proveedor: "", ubicacion: "Almacén central", estado: "En uso" };
  const [f, setF] = useState(vacio), [arch, setArch] = useState<File | null>(null), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false);
  const L: any[] = (lista.data as any[]) || [], total = L.reduce((s, x) => s + n(x.cantidad) * n(x.costo_unitario), 0), piezas = L.reduce((s, x) => s + n(x.cantidad), 0);

  const guardar = async () => {
    setMsg(""); setOk("");
    if (!f.articulo.trim()) return setMsg("Escribe el nombre del artículo.");
    if (n(f.cantidad) < 1) return setMsg("La cantidad debe ser 1 o más.");
    setOcup(true);
    try {
      const foto = arch ? await subirArchivo("comprobantes", "empresa", arch) : null;
      const { error } = await supabase.from("compras_empresa").insert({ articulo: f.articulo.trim(), categoria: f.categoria.trim() || "Otros", cantidad: Math.round(n(f.cantidad)), costo_unitario: n(f.costo_unitario), fecha: f.fecha, proveedor: f.proveedor || null, ubicacion: f.ubicacion || null, estado: f.estado, foto_path: foto });
      if (error) throw new Error(error.message);
      setF({ ...vacio, categoria: f.categoria, ubicacion: f.ubicacion }); setArch(null); setOk("Compra guardada."); lista.recargar();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  const cambiar = async (x: any, cambios: any) => { setMsg(""); const { error } = await supabase.from("compras_empresa").update(cambios).eq("id", x.id); if (error) setMsg(error.message); else lista.recargar(); };
  const quitar = async (x: any) => { if (!confirm(`¿Mandar "${x.articulo}" a la papelera? Nada se elimina: podrás restaurarlo desde el menú Papelera.`)) return; try { await aPapelera("compras_empresa", [x.id]); lista.recargar(); } catch (e: any) { setMsg(e.message); } };
  const ver = async (ruta: string) => { const u = await urlArchivo("comprobantes", ruta); if (u) window.open(u, "_blank"); else setMsg("No se pudo abrir el archivo."); };

  return <>
    <Aviso>Herramientas y equipos de toda la empresa (fusionadora, escaleras, medidores…). Se usan en todas las zonas y no pertenecen a ningún proyecto. Solo los administradores principales lo ven.</Aviso>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="grid gk" style={{ marginBottom: 14 }}><Kpi t="Artículos registrados" v={piezas} /><Kpi t="Inversión total" v={bs(total)} /></div>
    <div className="grid g2">
      <div className="card"><h2>Nueva compra</h2><div className="form" style={{ gridTemplateColumns: "1fr" }}>
        <Campo l="Artículo"><input value={f.articulo} onChange={e => setF({ ...f, articulo: e.target.value })} /></Campo>
        <Campo l="Categoría"><input list="cat-compras" value={f.categoria} onChange={e => setF({ ...f, categoria: e.target.value })} /><datalist id="cat-compras">{CATEGORIAS.map(c => <option key={c} value={c} />)}</datalist></Campo>
        <Campo l="Cantidad"><input type="number" min={1} value={f.cantidad} onChange={e => setF({ ...f, cantidad: e.target.value })} /></Campo>
        <Campo l="Costo por unidad (Bs)"><input type="number" min={0} step={0.01} value={f.costo_unitario} onChange={e => setF({ ...f, costo_unitario: e.target.value })} /></Campo>
        <Campo l="Fecha de compra"><input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></Campo>
        <Campo l="Proveedor"><input value={f.proveedor} onChange={e => setF({ ...f, proveedor: e.target.value })} /></Campo>
        <Campo l="Dónde está o quién lo tiene"><select value={f.ubicacion} onChange={e => setF({ ...f, ubicacion: e.target.value })}>{ubicaciones.map(u => <option key={u}>{u}</option>)}</select></Campo>
        <Campo l="Estado"><select value={f.estado} onChange={e => setF({ ...f, estado: e.target.value })}>{ESTADOS.map(u => <option key={u}>{u}</option>)}</select></Campo>
        <Campo l="Factura o foto"><input type="file" key={String(ok)} onChange={e => setArch(e.target.files?.[0] || null)} /></Campo>
      </div><button className="btn" disabled={ocup} onClick={guardar}>{ocup ? "Guardando…" : "Guardar compra"}</button></div>

      <div className="card tw"><h2>Compras de la empresa</h2>{lista.loading ? <Cargando /> : L.length ? <table style={{ minWidth: 0 }}><thead><tr><th>Artículo</th><th>Cant.</th><th>Total</th><th>Ubicación</th><th>Estado</th><th /></tr></thead>
        <tbody>{L.map(x => <tr key={x.id}><td>{x.articulo}<br /><small className="mute">{x.categoria} · {x.fecha}{x.proveedor ? " · " + x.proveedor : ""}</small></td><td>{x.cantidad}</td><td>{bs(n(x.cantidad) * n(x.costo_unitario))}</td>
          <td><select value={[...ubicaciones, x.ubicacion].includes(x.ubicacion) ? x.ubicacion : ""} onChange={e => cambiar(x, { ubicacion: e.target.value })}>{[...ubicaciones, ...(ubicaciones.includes(x.ubicacion) || !x.ubicacion ? [] : [x.ubicacion])].map(u => <option key={u}>{u}</option>)}</select></td>
          <td><select value={x.estado} onChange={e => cambiar(x, { estado: e.target.value })}>{ESTADOS.map(u => <option key={u}>{u}</option>)}</select></td>
          <td><div className="fila">{x.foto_path && <button className="btn suave chico" onClick={() => ver(x.foto_path)}>Ver</button>}<button className="btn suave chico" onClick={() => quitar(x)}>Papelera</button></div></td></tr>)}</tbody></table> : <Vacio>Aún no hay compras registradas.</Vacio>}
        <p className="mute" style={{ marginTop: 10 }}>Lo que mandes a la papelera lo recuperas desde el menú Papelera. Nada se elimina.</p></div>
    </div>
  </>;
}
