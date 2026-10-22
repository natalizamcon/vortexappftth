import { useState } from "react";
import { supabase, subirArchivo, urlArchivo } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { aPapelera } from "../lib/papelera";
import { Aviso, Campo, Cargando, Kpi, Vacio, bs, hoy, useQuery } from "../lib/ui";
import { FormModal } from "../lib/formmodal";
import { Linea } from "../lib/graficos";

const n = (x: any) => Number(x) || 0;
const nada = Promise.resolve({ data: [], error: null });
const sinZona = <Aviso>Elige una <b>zona</b> arriba para ver y registrar sus costos.</Aviso>;

/* ============================== COSTOS FIJOS ============================== */
export function CostosFijos() {
  const { zonas, zonaId } = useApp(), zona = zonas.find(z => z.id === zonaId);
  const q = useQuery(() => zonaId ? supabase.from("costos_fijos").select("*").eq("zona_id", zonaId).order("concepto") : nada, [zonaId]);
  const vacio = { concepto: "", cantidad: "1", monto: "0" }, [f, setF] = useState(vacio), [msg, setMsg] = useState("");
  const L: any[] = (q.data as any[]) || [], total = L.reduce((s, x) => s + n(x.cantidad) * n(x.monto_unitario), 0);
  if (!zona) return sinZona;

  const guardar = async (x: any, cambios: any) => { setMsg(""); const { error } = await supabase.from("costos_fijos").update(cambios).eq("id", x.id); if (error) setMsg(error.message); else q.recargar(); };
  const agregar = async () => {
    setMsg(""); if (!f.concepto.trim()) return setMsg("Escribe el concepto (por ejemplo: Starlink, alquiler del cuarto).");
    const { error } = await supabase.from("costos_fijos").insert({ proyecto_id: zona.proyecto_id, zona_id: zona.id, concepto: f.concepto.trim(), cantidad: n(f.cantidad) || 1, monto_unitario: n(f.monto) });
    if (error) setMsg(error.message); else { setF(vacio); q.recargar(); }
  };
  const quitar = async (x: any) => { if (!confirm(`¿Mandar "${x.concepto}" a la papelera? Podrás recuperarlo desde Configuración → Papelera.`)) return; try { await aPapelera("costos_fijos", [x.id]); q.recargar(); } catch (e: any) { setMsg(e.message); } };

  return <div className="card tw"><h2>Costos fijos mensuales de la zona {zona.nombre}</h2>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}
    {q.loading ? <Cargando /> : <table><thead><tr><th>Concepto</th><th>Cantidad</th><th>Monto por unidad (Bs)</th><th>Total al mes</th><th /></tr></thead>
      <tbody>{L.length ? L.map(x => <tr key={x.id}>
        <td><input defaultValue={x.concepto} key={x.id + x.concepto} style={{ minWidth: 200 }} onBlur={e => e.target.value.trim() && e.target.value !== x.concepto && guardar(x, { concepto: e.target.value.trim() })} /></td>
        <td><input type="number" min={0} step={0.01} style={{ width: 80 }} defaultValue={n(x.cantidad)} key={x.id + "c" + x.cantidad} onBlur={e => n(e.target.value) !== n(x.cantidad) && guardar(x, { cantidad: n(e.target.value) })} /></td>
        <td><input type="number" min={0} step={0.01} style={{ width: 110 }} defaultValue={n(x.monto_unitario)} key={x.id + "m" + x.monto_unitario} onBlur={e => n(e.target.value) !== n(x.monto_unitario) && guardar(x, { monto_unitario: n(e.target.value) })} /></td>
        <td>{bs(n(x.cantidad) * n(x.monto_unitario))}</td><td><button className="btn suave chico" onClick={() => quitar(x)}>Papelera</button></td></tr>)
        : <tr><td colSpan={5}><Vacio>Esta zona aún no tiene costos fijos.</Vacio></td></tr>}</tbody>
      <tfoot><tr><td colSpan={3}><b>Total de costos fijos al mes</b></td><td colSpan={2}><b>{bs(total)}</b></td></tr></tfoot></table>}
    <div className="fila" style={{ marginTop: 10 }}>
      <input placeholder="Concepto (ej. segunda antena)" value={f.concepto} onChange={e => setF({ ...f, concepto: e.target.value })} style={{ flex: "1 1 220px" }} />
      <input type="number" min={0} step={0.01} value={f.cantidad} style={{ width: 80 }} onChange={e => setF({ ...f, cantidad: e.target.value })} />
      <input type="number" min={0} step={0.01} value={f.monto} style={{ width: 110 }} onChange={e => setF({ ...f, monto: e.target.value })} />
      <button className="btn" onClick={agregar}>+ Agregar costo fijo</button></div>
    <p className="mute">Se editan directamente en la tabla: cambia el número y sal del campo para guardar. Los costos mensuales de servicios que registres en el Historial de la red también aparecen aquí.</p>
  </div>;
}

/* ============================== COSTOS VARIABLES ============================== */
export function CostosVariables() {
  const { zonas, zonaId } = useApp(), zona = zonas.find(z => z.id === zonaId);
  const lista = useQuery(() => zonaId ? supabase.from("costos_variables").select("*").eq("zona_id", zonaId).order("fecha", { ascending: false }).order("creado_en", { ascending: false }).limit(500) : nada, [zonaId]);
  const mats = useQuery(() => zona ? supabase.from("materiales").select("id, nombre, unidad, costo").eq("proyecto_id", zona.proyecto_id).order("nombre").limit(500) : nada, [zonaId]);
  const alms = useQuery(() => zona ? supabase.from("almacenes").select("id, tipo, zona_id").eq("proyecto_id", zona.proyecto_id) : nada, [zonaId]);
  const trs = useQuery(() => zonaId ? supabase.from("v_troncales_resumen").select("codigo, desde, hasta").eq("zona_id", zonaId).order("codigo") : nada, [zonaId]);
  const naps = useQuery(() => zonaId ? supabase.from("v_naps_ocupacion").select("codigo").eq("zona_id", zonaId).order("codigo") : nada, [zonaId]);
  const pre = useQuery(() => zonaId ? supabase.from("presupuesto_lineas").select("categoria, tipo, cantidad, monto_unitario").eq("zona_id", zonaId).eq("tipo", "INVERSION") : nada, [zonaId]);
  const vacio = { origen: "Inventario", destino: "", material_id: "", cantidad: "1", concepto: "", real_total: "", estimado_total: "", fecha: hoy(), nota: "" };
  const [f, setF] = useState(vacio), [arch, setArch] = useState<File | null>(null), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false), [ed, setEd] = useState<any>(null);
  const stock = useQuery(() => f.material_id ? supabase.from("stock").select("almacen_id, cantidad").eq("material_id", f.material_id) : nada, [f.material_id, lista.data]);

  const L: any[] = (lista.data as any[]) || [], M: any[] = (mats.data as any[]) || [], mat = M.find(x => x.id === f.material_id);
  const almacenes: any[] = (alms.data as any[]) || [], validos = almacenes.filter(a => a.tipo === "central" || (a.tipo === "zona" && a.zona_id === zonaId)).map(a => a.id);
  const disponible = ((stock.data as any[]) || []).filter(s => validos.includes(s.almacen_id)).reduce((s, x) => s + n(x.cantidad), 0);
  const destinos = ["General de la red", ...(((trs.data as any[]) || []).map(t => `${t.codigo}${t.desde || t.hasta ? "  " + [t.desde, t.hasta].filter(Boolean).join(" → ") : ""}`)), ...(((naps.data as any[]) || []).map(x => x.codigo))];
  const presupuesto = ((pre.data as any[]) || []).filter(x => x.categoria !== "Viajes de instalación").reduce((s, x) => s + n(x.cantidad) * n(x.monto_unitario), 0);
  const est = L.reduce((s, x) => s + n(x.estimado_total ?? x.real_total), 0), real = L.reduce((s, x) => s + n(x.real_total), 0), dif = real - est;
  const asc = [...L].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.creado_en).localeCompare(String(b.creado_en))); let ae = 0, ar = 0; const acumE = asc.map(x => (ae += n(x.estimado_total ?? x.real_total))), acumR = asc.map(x => (ar += n(x.real_total)));
  if (!zona) return sinZona;

  const registrar = async () => {
    setMsg(""); setOk("");
    if (f.origen === "Inventario") { if (!f.material_id) return setMsg("Elige el artículo del inventario."); if (n(f.cantidad) > disponible) return setMsg(`No hay suficiente: hay ${disponible} y pides ${n(f.cantidad)}.`); }
    else { if (!f.concepto.trim()) return setMsg("Escribe qué se compró."); if (!(n(f.real_total) > 0)) return setMsg("Escribe el costo real de la compra."); }
    if (!(n(f.cantidad) > 0)) return setMsg("La cantidad debe ser mayor a 0.");
    setOcup(true);
    try {
      const ruta = arch ? await subirArchivo("comprobantes", zona.proyecto_id, arch) : null;
      const { error } = await supabase.rpc("registrar_costo_variable", { p: { zona_id: zona.id, origen: f.origen, destino: f.destino || "General de la red", material_id: f.material_id || null, cantidad: n(f.cantidad), concepto: f.concepto, real_total: f.real_total === "" ? null : n(f.real_total), estimado_total: f.estimado_total === "" ? null : n(f.estimado_total), fecha: f.fecha, comprobante_path: ruta, nota: f.nota } });
      if (error) throw new Error(error.message);
      setF({ ...vacio, origen: f.origen, destino: f.destino }); setArch(null); setOk(f.origen === "Inventario" ? "Registrado y descontado del inventario." : "Gasto registrado."); lista.recargar();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  const quitar = async (x: any) => {
    const texto = x.origen === "Inventario" ? `¿Quitar "${x.concepto}"?\n\nEl material (${n(x.cantidad)}) vuelve al inventario y este registro va a la papelera.` : `¿Mandar "${x.concepto}" a la papelera? Podrás recuperarlo desde Configuración → Papelera.`;
    if (!confirm(texto)) return; setMsg("");
    const { error } = await supabase.rpc("quitar_costo_variable", { p_id: x.id }); if (error) setMsg(error.message); else lista.recargar();
  };
  const ver = async (ruta: string) => { const u = await urlArchivo("comprobantes", ruta); if (u) window.open(u, "_blank"); else setMsg("No se pudo abrir el archivo."); };

  return <>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="grid gk" style={{ marginBottom: 14 }}><Kpi t="Costo estimado" v={bs(est)} /><Kpi t="Costo real" v={bs(real)} /><Kpi t="Diferencia (real − estimado)" v={bs(dif)} c={dif <= 0 ? "var(--ok)" : "var(--bad)"} /><Kpi t="Presupuesto de materiales y red" v={presupuesto ? bs(presupuesto) : "—"} s={presupuesto ? `Usado: ${Math.round((real / presupuesto) * 100)}%` : "Sin guía cargada"} /></div>
    <div className="grid g2">
      <div className="card"><h2>Registrar lo que se usó o gastó</h2><div className="form" style={{ gridTemplateColumns: "1fr" }}>
        <Campo l="Origen"><select value={f.origen} onChange={e => setF({ ...f, origen: e.target.value })}><option value="Inventario">Del inventario (ya tiene precio)</option><option value="Compra directa">Compra directa (sin inventario)</option></select></Campo>
        <Campo l="Para"><select value={f.destino} onChange={e => setF({ ...f, destino: e.target.value })}><option value="">General de la red</option>{destinos.slice(1).map(d => <option key={d}>{d}</option>)}</select></Campo>
        {f.origen === "Inventario" ? <>
          <Campo l="Artículo del inventario"><select value={f.material_id} onChange={e => setF({ ...f, material_id: e.target.value })}><option value="">Elige…</option>{M.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo>
          <Campo l="Cantidad"><input type="number" min={0} step={0.01} value={f.cantidad} onChange={e => setF({ ...f, cantidad: e.target.value })} /></Campo>
          {mat && <div className="aviso ok" style={{ margin: 0 }}>Se descuenta solo del inventario (primero de la zona, luego del almacén central). Disponible: <b>{disponible}</b> {mat.unidad} · costo registrado <b>{bs(mat.costo)}</b> por unidad.</div>}
        </> : <>
          <Campo l="¿Qué se compró?"><input value={f.concepto} onChange={e => setF({ ...f, concepto: e.target.value })} /></Campo>
          <Campo l="Cantidad"><input type="number" min={0} step={0.01} value={f.cantidad} onChange={e => setF({ ...f, cantidad: e.target.value })} /></Campo>
          <Campo l="Costo real total (Bs)"><input type="number" min={0} step={0.01} value={f.real_total} onChange={e => setF({ ...f, real_total: e.target.value })} /></Campo>
        </>}
        <Campo l="Precio estimado total (opcional, para comparar)"><input type="number" min={0} step={0.01} value={f.estimado_total} onChange={e => setF({ ...f, estimado_total: e.target.value })} /></Campo>
        <Campo l="Fecha"><input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></Campo>
        <Campo l="Comprobante (si hay)"><input type="file" key={String(ok)} onChange={e => setArch(e.target.files?.[0] || null)} /></Campo>
      </div><button className="btn" style={{ width: "100%" }} disabled={ocup} onClick={registrar}>{ocup ? "Guardando…" : f.origen === "Inventario" ? "Registrar y descontar del inventario" : "Registrar gasto"}</button></div>

      <div className="card"><h2>Estimado contra real a medida que avanza</h2>
        {asc.length >= 2 ? <><Linea etiquetas={asc.map(x => String(x.fecha).slice(5).split("-").reverse().join("/"))} series={[{ nombre: "Estimado", color: "var(--lil)", datos: acumE }, { nombre: "Real", color: "var(--ok)", datos: acumR }]} />
          <div className="legend"><span style={{ color: "var(--lil)" }}>■ <span style={{ color: "var(--ink)" }}>Estimado</span></span><span style={{ color: "var(--ok)" }}>■ <span style={{ color: "var(--ink)" }}>Real</span></span></div></>
          : <p className="mute">Con 2 o más registros aparece la curva.</p>}
        <h3 style={{ margin: "14px 0 6px" }}>Contra el presupuesto de la guía</h3>
        {presupuesto > 0 ? <><div className="fila" style={{ justifyContent: "space-between" }}><span>Gastado <b>{bs(real)}</b> de <b>{bs(presupuesto)}</b> presupuestados</span><b style={{ color: real > presupuesto ? "var(--bad)" : "var(--ink)" }}>{Math.round((real / presupuesto) * 100)}%</b></div>
          <div className="bar" style={{ height: 12, marginTop: 4 }}><i style={{ width: Math.min(100, (real / presupuesto) * 100) + "%", background: real > presupuesto ? "var(--bad)" : "var(--lil)" }} /></div>
          <p className="mute" style={{ margin: "6px 0 0" }}>Quedan {bs(Math.max(0, presupuesto - real))} del presupuesto de materiales y red (sin los viajes).</p></> : <p className="mute" style={{ margin: 0 }}>Esta zona aún no tiene presupuesto cargado. Cárgalo en Finanzas → Simulador de proyecto → "Guardar simulación como guía".</p>}
        <p className="mute" style={{ margin: "8px 0 0" }}>Las líneas suman lo estimado y lo real registrado, registro por registro.</p></div>
    </div>

    <div className="card tw"><h2>Registro de lo implementado</h2>{lista.loading ? <Cargando /> : L.length ? <table><thead><tr><th>Fecha</th><th>Para</th><th>Concepto</th><th>Origen</th><th>Cant.</th><th>Estimado</th><th>Real</th><th>Diferencia</th><th>Comprobante</th><th /></tr></thead>
      <tbody>{L.map(x => { const e = n(x.estimado_total ?? x.real_total), d = n(x.real_total) - e; return <tr key={x.id}><td>{x.fecha}</td><td>{x.destino || "—"}</td><td>{x.concepto}{x.nota && <><br /><small className="mute">{x.nota}</small></>}</td><td>{x.origen === "Inventario" ? "Inventario" : "Compra directa"}</td><td>{n(x.cantidad)}</td><td>{bs(e)}</td><td>{bs(x.real_total)}</td><td style={{ color: d <= 0 ? "var(--ok)" : "var(--bad)" }}>{bs(d)}</td>
        <td>{x.comprobante_path ? <button className="btn suave chico" onClick={() => ver(x.comprobante_path)}>Ver</button> : "—"}</td>
        <td><div className="fila"><button className="btn suave chico" onClick={() => setEd(x)}>Editar</button><button className="btn suave chico" onClick={() => quitar(x)}>Quitar</button></div></td></tr>; })}</tbody></table> : <Vacio>Aún no registraste lo que se usó o gastó en esta zona.</Vacio>}</div>

    {ed && <FormModal titulo={"Editar · " + ed.concepto} valores={{ ...ed, estimado_total: ed.estimado_total ?? ed.real_total }} onClose={() => setEd(null)}
      campos={[{ k: "fecha", l: "Fecha", t: "date", req: true }, { k: "estimado_total", l: "Precio estimado total (Bs)", t: "number", paso: 0.01 }, ...(ed.origen === "Compra directa" ? [{ k: "real_total", l: "Costo real total (Bs)", t: "number" as const, paso: 0.01, req: true }] : []), { k: "nota", l: "Nota" }]}
      extra={ed.origen === "Inventario" ? <p className="mute">El material y la cantidad no se cambian aquí porque ya se descontaron del inventario. Si te equivocaste, usa "Quitar" (el material vuelve al inventario) y regístralo de nuevo.</p> : null}
      onGuardar={async v => { const c: any = { fecha: v.fecha, estimado_total: v.estimado_total, nota: v.nota }; if (ed.origen === "Compra directa") { c.real_total = v.real_total; c.costo_unitario = n(ed.cantidad) ? Math.round((n(v.real_total) / n(ed.cantidad)) * 100) / 100 : 0; } const { error } = await supabase.from("costos_variables").update(c).eq("id", ed.id); if (error) return error.message; lista.recargar(); }} />}
  </>;
}
