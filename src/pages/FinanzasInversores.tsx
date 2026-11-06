import { useEffect, useRef, useState } from "react";
import { supabase, subirArchivo, urlArchivo } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Vacio, bs, hoy, useAlcance, useQuery } from "../lib/ui";
import { aPapelera } from "../lib/papelera";
import { Drawer } from "../lib/drawer";
import { BaseInteres, Moneda, ModoInteres, calcularInversion, resumenGuardado } from "../lib/inversion";
import { saldoDe } from "../lib/fondo";

const num = (x: any) => Number(x) || 0;
const fmt = (n: number, m: Moneda) => (m === "USD" ? "USD " : "Bs ") + n.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => n.toLocaleString("es-BO", { maximumFractionDigits: 2 }) + "%";
const BASE_TXT: Record<string, string> = { mensual: "por mes", anual: "por año", total: "en total" };
export const GENERAL = "__general";

export type FormInv = { nombre: string; zona: string; proyecto: string; moneda: Moneda; cap: string; tc: string; plazo: string; fecha: string; modo: ModoInteres; valor: string; base: BaseInteres; proposito: string };
export const formVacio = (zona: string, proyecto: string): FormInv => ({ nombre: "", zona, proyecto, moneda: "BOB", cap: "", tc: "", plazo: "12", fecha: hoy(), modo: "porcentaje", valor: "", base: "mensual", proposito: "" });
/** Lo guardado de un inversor, convertido a lo que se ve en el formulario (para poder corregirlo todo). */
export const formDe = (x: any): FormInv => { const modo: ModoInteres = x.interes_modo === "monto" && x.interes_monto != null ? "monto" : "porcentaje"; return { nombre: x.nombre || "", zona: x.zona_id || GENERAL, proyecto: x.proyecto_id || "", moneda: x.moneda === "USD" ? "USD" : "BOB", cap: String(x.monto_original ?? x.monto ?? ""), tc: x.tipo_cambio != null ? String(x.tipo_cambio) : "", plazo: String(x.plazo_meses ?? 12), fecha: String(x.fecha_inicio || hoy()).slice(0, 10), modo, valor: String(modo === "monto" ? x.interes_monto : x.interes ?? ""), base: (modo === "monto" ? x.interes_base || "total" : x.periodo_interes || "mensual") as BaseInteres, proposito: x.proposito || "" }; };

/** Los campos del inversor: se usan igual para anotar uno nuevo y para corregir uno que ya está guardado. */
function CamposInversor({ f, setF }: { f: FormInv; setF: (g: (x: FormInv) => FormInv) => void }) {
  const { zonas, proyectos, proyectoId } = useApp(), set = (k: keyof FormInv, v: any) => setF(x => ({ ...x, [k]: v }));
  const calc = calcularInversion({ moneda: f.moneda, cap: num(f.cap), tc: num(f.tc), plazo: num(f.plazo), modo: f.modo, valor: num(f.valor), base: f.base });
  const filas = useQuery(() => supabase.from("v_fondo_inversion").select("*"), []), disp = (filas.data as any[]) || [];
  const proy = f.zona === GENERAL ? f.proyecto || proyectoId || (proyectos.length === 1 ? proyectos[0].id : "") : zonas.find(z => z.id === f.zona)?.proyecto_id || "";
  const modoBtn = (m: ModoInteres, t: string) => <button type="button" className={"btn chico " + (f.modo === m ? "" : "suave")} onClick={() => setF(x => ({ ...x, modo: m, base: m === "porcentaje" && x.base === "total" ? "mensual" : x.base }))}>{t}</button>;
  return <>
    <div className="form"><Campo l="Zona del inversor"><select value={f.zona} onChange={e => set("zona", e.target.value)}><option value="">Elige la zona…</option>{zonas.filter(z => !proyectoId || z.proyecto_id === proyectoId).map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}<option value={GENERAL}>General del proyecto (no es de una zona)</option></select></Campo>
      {f.zona === GENERAL && proyectos.length > 1 && <Campo l="Proyecto"><select value={f.proyecto || proyectoId} onChange={e => set("proyecto", e.target.value)}><option value="">Elige…</option>{proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>}
      <Campo l="Nombre"><input value={f.nombre} onChange={e => set("nombre", e.target.value)} /></Campo>
      <Campo l="Invirtió en"><select value={f.moneda} onChange={e => set("moneda", e.target.value)}><option value="BOB">Bolivianos (Bs)</option><option value="USD">Dólares (USD)</option></select></Campo>
      <Campo l={`Monto invertido (${f.moneda === "USD" ? "USD" : "Bs"})`}><input type="number" min={0} step="0.01" value={f.cap} onChange={e => set("cap", e.target.value)} /></Campo>
      {f.moneda === "USD" && <Campo l="Tipo de cambio que se usó (Bs por 1 USD)"><input type="number" min={0} step="0.01" placeholder="por ejemplo 6.96" value={f.tc} onChange={e => set("tc", e.target.value)} /></Campo>}
      <Campo l="Plazo (meses)"><input type="number" min={1} value={f.plazo} onChange={e => set("plazo", e.target.value)} /></Campo>
      <Campo l="Fecha en que invirtió"><input type="date" value={f.fecha} onChange={e => set("fecha", e.target.value)} /></Campo></div>
    {f.zona && calc.ok && <p className="mute" style={{ margin: "6px 0" }}>💰 Este dinero entra al <b>fondo de inversión {f.zona === GENERAL ? "general del proyecto" : "de " + (zonas.find(z => z.id === f.zona)?.nombre || "la zona")}</b>, que hoy tiene {bs(saldoDe(disp, proy || null, f.zona === GENERAL ? null : f.zona))}.</p>}
    <h3 style={{ margin: "10px 0 4px" }}>Interés que le vas a pagar</h3>
    <div className="fila" style={{ marginBottom: 6 }}>{modoBtn("porcentaje", "Lo pongo en porcentaje (%)")}{modoBtn("monto", "Lo pongo en monto")}</div>
    <div className="form"><Campo l={f.modo === "porcentaje" ? "Porcentaje (%)" : `Monto de interés (${f.moneda === "USD" ? "USD" : "Bs"})`}><input type="number" min={0} step="0.01" value={f.valor} onChange={e => set("valor", e.target.value)} /></Campo>
      <Campo l="El interés es"><select value={f.base} onChange={e => set("base", e.target.value)}><option value="mensual">por mes</option><option value="anual">por año</option>{f.modo === "monto" && <option value="total">en total (todo el plazo)</option>}</select></Campo></div>
    {calc.ok ? <div style={{ background: "var(--lilb)", borderRadius: 10, padding: 10, margin: "8px 0", fontSize: 13 }}>
      {f.moneda === "USD" && <div>Capital en bolivianos: <b>{bs(calc.montoBs)}</b> <span className="mute">({fmt(num(f.cap), "USD")} × {num(f.tc)})</span></div>}
      <div>Interés equivalente: <b>{pct(calc.pctMes)} por mes</b> · <b>{pct(calc.pctAnio)} por año</b></div>
      <div>Pagarás <b>{fmt(calc.porMes, f.moneda)}</b> por mes · <b>{fmt(calc.interesTotal, f.moneda)}</b> de interés en {num(f.plazo)} meses</div>
      <div>Total a devolver: <b>{fmt(calc.totalDevolver, f.moneda)}</b>{f.moneda === "USD" && <> ≈ <b>{bs(calc.totalDevolver * calc.factor)}</b></>}</div></div> : <p className="mute" style={{ margin: "8px 0" }}>{calc.error}</p>}
    <div className="form" style={{ gridTemplateColumns: "1fr" }}><Campo l="¿Para qué es esta inversión? (opcional)"><input placeholder="Por ejemplo: compra de ONU y fibra para la zona norte" value={f.proposito} onChange={e => set("proposito", e.target.value)} /></Campo></div>
  </>;
}

/** Arma la fila para guardar. Devuelve el texto del error si falta algo. */
export function filaDe(f: FormInv, zonas: any[], proyectoId: string, proyectos: any[]): { fila?: any; error?: string } {
  const calc = calcularInversion({ moneda: f.moneda, cap: num(f.cap), tc: num(f.tc), plazo: num(f.plazo), modo: f.modo, valor: num(f.valor), base: f.base });
  if (!f.zona) return { error: "Elige la zona del inversor (o \"General del proyecto\")." }; if (!f.nombre.trim()) return { error: "Escribe el nombre del inversor." }; if (!calc.ok) return { error: calc.error || "Revisa los datos." };
  const z = f.zona === GENERAL ? null : zonas.find(x => x.id === f.zona), proy = z ? z.proyecto_id : f.proyecto || proyectoId || (proyectos.length === 1 ? proyectos[0].id : "");
  if (!proy) return { error: "Elige el proyecto del inversor general." };
  return { fila: { proyecto_id: proy, zona_id: z ? z.id : null, nombre: f.nombre.trim(), monto: calc.montoBs, interes: calc.interes, periodo_interes: calc.periodo, plazo_meses: Math.round(num(f.plazo)), fecha_inicio: f.fecha, proposito: f.proposito.trim() || null, moneda: f.moneda, monto_original: num(f.cap), tipo_cambio: f.moneda === "USD" ? num(f.tc) : null, interes_modo: f.modo, interes_monto: f.modo === "monto" ? num(f.valor) : null, interes_base: f.modo === "monto" ? f.base : null } };
}

/** Corregir cualquier dato de un inversor ya guardado. */
function EditarInversor({ x, onClose, onGuardado }: { x: any; onClose: () => void; onGuardado: (t: string) => void }) {
  const { zonas, proyectoId, proyectos } = useApp(), [f, setF] = useState<FormInv>(formDe(x)), [nuevo, setNuevo] = useState<File | null>(null), [quitar, setQuitar] = useState(false), [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false);
  const ver = async () => { const u = await urlArchivo("comprobantes", x.comprobante_path); if (u) window.open(u, "_blank"); else setMsg("No se pudo abrir el comprobante."); };
  const guardar = async () => {
    setMsg(""); const r = filaDe(f, zonas, proyectoId, proyectos); if (r.error) return setMsg(r.error); setOcup(true);
    try {
      const fila: any = { ...r.fila }; delete fila.proyecto_id; if (!r.fila.zona_id) fila.proyecto_id = r.fila.proyecto_id; // con zona, el proyecto lo pone la base de datos
      if (nuevo) fila.comprobante_path = await subirArchivo("comprobantes", r.fila.proyecto_id, nuevo); else if (quitar) fila.comprobante_path = null;
      const { error } = await supabase.from("inversores").update(fila).eq("id", x.id); if (error) throw new Error(error.message);
      onGuardado(`✅ Se guardaron los cambios de "${f.nombre.trim()}".`);
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  return <Drawer titulo={`Corregir a ${x.nombre}`} ancho={520} onClose={onClose}>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}
    <CamposInversor f={f} setF={setF} />
    <div className="form" style={{ gridTemplateColumns: "1fr" }}><Campo l="Comprobante de lo que invirtió">
      {x.comprobante_path && !quitar && !nuevo && <div className="fila" style={{ marginBottom: 6 }}><button type="button" className="btn suave chico" onClick={ver}>Ver el comprobante actual</button><label className="fila"><input type="checkbox" checked={quitar} onChange={e => setQuitar(e.target.checked)} /> Quitarlo</label></div>}
      {quitar && <p className="mute" style={{ margin: "0 0 6px" }}>Se quitará el comprobante al guardar. <button type="button" className="btn suave chico" onClick={() => setQuitar(false)}>Deshacer</button></p>}
      <input type="file" accept="image/*,.pdf" onChange={e => setNuevo(e.target.files?.[0] || null)} /><small className="mute">{x.comprobante_path ? "Si eliges un archivo, reemplaza al actual." : "Puedes subir la foto o el PDF."}</small></Campo></div>
    <div className="fila" style={{ marginTop: 10 }}><button className="btn" disabled={ocup} onClick={guardar}>{ocup ? "Guardando…" : "Guardar cambios"}</button><button className="btn suave" onClick={onClose}>Cancelar</button></div>
    <p className="mute" style={{ marginTop: 8 }}>Si cambias el monto o la zona, el fondo de inversión se corrige solo. No se permite dejar el fondo en negativo si ya se gastó de él.</p>
  </Drawer>;
}

/** Inversores: capital en bolivianos o dólares, interés por % o por monto, comprobante, y su efecto en el fondo de inversión. Se puede corregir todo después. */
export function Inversores() {
  const { zonaId, setZonaId, proyectoId, zonas, proyectos } = useApp(), al = useAlcance();
  const inv = useQuery(() => al(supabase.from("inversores").select("*, zonas(nombre)").order("nombre")), [proyectoId, zonaId]), pag = useQuery(() => al(supabase.from("pagos_inversores").select("*").order("fecha", { ascending: false }), false), [proyectoId, inv.data]);
  const fondo = useQuery(() => al(supabase.from("v_fondo_inversion").select("*"), false), [proyectoId, inv.data]);
  const esq = useQuery(() => supabase.from("inversores").select("moneda, proposito, comprobante_path, interes_modo").limit(1), []), faltaEsquema = !esq.loading && !!esq.error;
  const [mf, setMf] = useState(""), [okf, setOkf] = useState(""), [f, setF] = useState<FormInv>(formVacio(zonaId || "", proyectoId)), avisoForm = useRef<HTMLDivElement>(null), [editando, setEditando] = useState<any>(null);
  useEffect(() => { if (zonaId) setF(x => ({ ...x, zona: zonaId })); }, [zonaId]);
  const mostrar = (bien: boolean, t: string) => { if (bien) { setOkf(t); setMf(""); } else { setMf(t); setOkf(""); } setTimeout(() => avisoForm.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); };
  const [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false), [comp, setComp] = useState<File | null>(null), [clave, setClave] = useState(0);
  const [g, setG] = useState({ inversor_id: "", fecha: hoy(), monto: "", nota: "" }), [arch, setArch] = useState<File | null>(null);
  const I: any[] = (inv.data as any[]) || [], P: any[] = (pag.data as any[]) || [], FD: any[] = (fondo.data as any[]) || [], pagado = (id: string) => P.filter(p => p.inversor_id === id).reduce((s, p) => s + num(p.monto), 0);
  const totalInt = (x: any) => resumenGuardado(x).interes * resumenGuardado(x).factor, totalBs = (x: any) => num(x.monto) + totalInt(x);
  const calc = calcularInversion({ moneda: f.moneda, cap: num(f.cap), tc: num(f.tc), plazo: num(f.plazo), modo: f.modo, valor: num(f.valor), base: f.base });

  const crear = async () => {
    setMf(""); setOkf(""); const r = filaDe(f, zonas, proyectoId, proyectos); if (r.error) return mostrar(false, r.error); setOcup(true);
    try {
      const ruta = comp ? await subirArchivo("comprobantes", r.fila.proyecto_id, comp) : null; const basico = { proyecto_id: r.fila.proyecto_id, zona_id: r.fila.zona_id, nombre: r.fila.nombre, monto: r.fila.monto, interes: r.fila.interes, periodo_interes: r.fila.periodo_interes, plazo_meses: r.fila.plazo_meses, fecha_inicio: r.fila.fecha_inicio };
      let { error } = await supabase.from("inversores").insert({ ...r.fila, comprobante_path: ruta }); let aviso = "";
      if (error && /column|schema cache|does not exist/i.test(error.message)) {
        // Falta actualizar la base de datos (archivos 23 y 24). Si es un inversor sencillo en bolivianos se guarda igual; si usa dólares, propósito o comprobante, se avisa.
        if (f.moneda === "BOB" && !f.proposito.trim() && !ruta && f.modo === "porcentaje") { const r2 = await supabase.from("inversores").insert(basico); error = r2.error; if (!error) aviso = " Se guardó sin las funciones nuevas porque falta actualizar la base de datos: en Supabase corre 23_inversores_moneda.sql y 24_eliminar_y_propositos.sql."; }
        else throw new Error("No se pudo guardar porque falta actualizar la base de datos. En Supabase → SQL Editor corre los archivos 23_inversores_moneda.sql y 24_eliminar_y_propositos.sql, recarga la página y vuelve a intentar. (Detalle: " + error.message + ")");
      }
      if (error) throw new Error(/zona_id.*null|not-null/i.test(error.message) ? "Para anotar inversores generales falta correr en Supabase el archivo 29_fondo_inversion.sql." : error.message);
      mostrar(true, `✅ Inversor "${r.fila.nombre}" agregado${r.fila.zona_id ? " en la zona " + (zonas.find(z => z.id === r.fila.zona_id)?.nombre || "") : " como inversor general del proyecto"}${ruta ? " con su comprobante" : ""}. Ya aparece en la lista de arriba y suma al fondo de inversión.${aviso}`);
      setF({ ...f, nombre: "", cap: "", valor: "", proposito: "" }); setComp(null); setClave(k => k + 1);
      if (zonaId && r.fila.zona_id && zonaId !== r.fila.zona_id) setZonaId(r.fila.zona_id); // para que se vea en la lista aunque estuvieras mirando otra zona
      inv.recargar();
    } catch (e: any) { mostrar(false, e.message); }
    setOcup(false);
  };
  const pagar = async () => { setMsg(""); setOk(""); const inversor = I.find(x => x.id === g.inversor_id); if (!inversor) return setMsg("Elige al inversor."); try { const ruta = arch ? await subirArchivo("comprobantes", inversor.proyecto_id, arch) : null; const { error } = await supabase.from("pagos_inversores").insert({ inversor_id: g.inversor_id, proyecto_id: inversor.proyecto_id, fecha: g.fecha, monto: num(g.monto), nota: g.nota, comprobante_path: ruta }); if (error) throw new Error(error.message); setG({ ...g, monto: "", nota: "" }); setArch(null); pag.recargar(); } catch (e: any) { setMsg(e.message); } };
  const ver = async (ruta: string) => { const u = await urlArchivo("comprobantes", ruta); if (u) window.open(u, "_blank"); else setMsg("No se pudo abrir el archivo."); };
  const debe = I.reduce((s, x) => s + totalBs(x) - pagado(x.id), 0), disponible = (zonaId ? FD.filter(r => r.zona_id === zonaId) : FD).reduce((s, r) => s + num(r.disponible), 0);

  return <>{faltaEsquema && <Aviso tipo="mal">⚠️ Falta actualizar la base de datos para usar dólares, el propósito y el comprobante. En Supabase → SQL Editor corre <b>23_inversores_moneda.sql</b> y <b>24_eliminar_y_propositos.sql</b>, y recarga esta página. Mientras tanto solo se pueden guardar inversores sencillos en bolivianos.</Aviso>}
    {inv.error && <Aviso tipo="mal">No se pudo cargar la lista de inversores: {inv.error}</Aviso>}{msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="grid gk" style={{ marginBottom: 14 }}><div className="card kpi"><span>Capital recibido</span><b>{bs(I.reduce((s, x) => s + num(x.monto), 0))}</b></div><div className="card kpi"><span>Disponible en el fondo de inversión</span><b style={{ color: disponible > 0 ? "var(--ok)" : undefined }}>{bs(disponible)}</b></div><div className="card kpi"><span>Intereses a devolver</span><b>{bs(I.reduce((s, x) => s + totalInt(x), 0))}</b></div><div className="card kpi"><span>Pagado a inversores</span><b>{bs(P.reduce((s, x) => s + num(x.monto), 0))}</b></div><div className="card kpi"><span>Lo que debo ahora</span><b style={{ color: debe > 0 ? "var(--bad)" : "var(--ok)" }}>{bs(debe)}</b></div></div>
    <div className="card tw"><h2>Inversores</h2>{I.length ? <table><thead><tr><th>Inversor</th><th>Zona</th><th>Capital</th><th>Interés</th><th>Plazo</th><th>Total a devolver</th><th>Cuota mensual</th><th>Pagado</th><th>Saldo</th><th>Comprobante</th><th /></tr></thead><tbody>{I.map(x => {
      const r = resumenGuardado(x), t = totalBs(x), usd = x.moneda === "USD";
      return <tr key={x.id}><td>{x.nombre}<br /><small className="mute">desde {String(x.fecha_inicio).slice(0, 10)}</small>{x.proposito ? <><br /><small>🎯 {x.proposito}</small></> : null}</td><td>{x.zonas?.nombre || <span className="pill acc">General</span>}</td>
        <td>{usd ? <><b>{fmt(r.cap, "USD")}</b><br /><small className="mute">T/C {r.factor} → {bs(x.monto)}</small></> : bs(x.monto)}</td>
        <td><b>{pct(r.pctMes)}</b> por mes<br /><small className="mute">{pct(r.pctAnio)} por año{x.interes_modo === "monto" && x.interes_monto ? ` · pactado ${fmt(num(x.interes_monto), usd ? "USD" : "BOB")} ${BASE_TXT[x.interes_base || "total"]}` : ""}</small></td>
        <td>{x.plazo_meses} meses</td><td>{bs(t)}{usd && <><br /><small className="mute">{fmt(r.total, "USD")}</small></>}</td><td>{bs(t / (num(x.plazo_meses) || 1))}</td><td>{bs(pagado(x.id))}</td><td><b>{bs(Math.max(0, t - pagado(x.id)))}</b></td>
        <td>{x.comprobante_path ? <button className="btn suave chico" onClick={() => ver(x.comprobante_path)}>Ver comprobante</button> : <small className="mute">Sin comprobante</small>}</td>
        <td><div className="fila"><button className="btn suave chico" onClick={() => setEditando(x)}>✏️ Editar</button><button className="btn suave chico" onClick={async () => { if (!confirm(`¿Mandar a "${x.nombre}" a la papelera? Sus pagos también se ocultan y podrás recuperarlo desde el menú Papelera.`)) return; try { await aPapelera("inversores", [x.id]); inv.recargar(); } catch (e: any) { setMsg(e.message); } }}>A la papelera</button></div></td></tr>; })}</tbody></table>
      : <Vacio>{inv.error ? "No se pudo cargar la lista." : zonaId ? `No hay inversores en la zona ${zonas.find(z => z.id === zonaId)?.nombre || ""}. Si agregaste uno en otra zona, cambia la zona arriba o elige "Todas las zonas".` : "Aún no hay inversores."}</Vacio>}
      <p className="mute" style={{ margin: "8px 0 0" }}>Los totales, el saldo y los pagos están en bolivianos, con el tipo de cambio que registraste al recibir la inversión. Con una zona elegida arriba solo ves los de esa zona; con "Todas las zonas" ves todos, incluidos los generales.</p></div>

    <div className="grid g2"><div className="card"><h2>Nuevo inversor</h2>
      <CamposInversor f={f} setF={setF} />
      <div className="form" style={{ gridTemplateColumns: "1fr" }}><Campo l="Comprobante de lo que invirtió (foto o PDF)"><input type="file" accept="image/*,.pdf" key={clave} onChange={e => setComp(e.target.files?.[0] || null)} /></Campo></div>
      <div ref={avisoForm}>{mf && <Aviso tipo="mal">{mf}</Aviso>}{okf && <Aviso tipo="ok">{okf}</Aviso>}</div>
      <button className="btn" disabled={ocup || !f.nombre.trim() || !calc.ok} onClick={crear}>{ocup ? "Guardando…" : "Agregar inversor"}</button></div>
      <div className="card"><h2>Registrar pago a un inversor</h2><div className="form"><Campo l="Inversor"><select value={g.inversor_id} onChange={e => setG({ ...g, inversor_id: e.target.value })}><option value="">Elige…</option>{I.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo><Campo l="Fecha"><input type="date" value={g.fecha} onChange={e => setG({ ...g, fecha: e.target.value })} /></Campo><Campo l="Monto pagado (Bs)"><input type="number" value={g.monto} onChange={e => setG({ ...g, monto: e.target.value })} /></Campo><Campo l="Nota"><input value={g.nota} onChange={e => setG({ ...g, nota: e.target.value })} /></Campo><Campo l="Respaldo"><input type="file" key={String(P.length)} onChange={e => setArch(e.target.files?.[0] || null)} /></Campo></div><button className="btn" disabled={!g.inversor_id || !(num(g.monto) > 0)} onClick={pagar}>Registrar pago</button></div></div>
    <div className="card tw"><h2>Pagos a inversores</h2>{P.length ? <table><thead><tr><th>Fecha</th><th>Inversor</th><th>Monto</th><th>Nota</th><th /></tr></thead><tbody>{P.map(p => <tr key={p.id}><td>{p.fecha}</td><td>{I.find(x => x.id === p.inversor_id)?.nombre}</td><td><b>{bs(p.monto)}</b></td><td>{p.nota || "—"}</td><td>{p.comprobante_path && <button className="btn suave chico" onClick={() => ver(p.comprobante_path)}>Ver respaldo</button>}</td></tr>)}</tbody></table> : <Vacio>Aún no hay pagos a inversores.</Vacio>}</div>
    {editando && <EditarInversor x={editando} onClose={() => setEditando(null)} onGuardado={t => { setEditando(null); setOk(t); setMsg(""); inv.recargar(); fondo.recargar(); }} />}</>;
}
