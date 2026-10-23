import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Modal, Vacio, bs, hoy, useQuery } from "../lib/ui";

const n = (x: any) => Number(x) || 0;
const PASOS = ["Datos de la zona", "Socios", "Inversores", "Planes y precios", "Red inicial", "Costos fijos", "Meta", "Revisar y crear"];

type Inv = { id: number; nombre: string; monto: any; interes: any; periodo_interes: string; plazo_meses: any };
type Plan = { id: number; nombre: string; mbps: any; precio: any };
type Costo = { id: number; concepto: string; cantidad: any; monto_unitario: any };

const inicial = () => ({
  nombre: "", ubicacion: "", fecha_inicio: hoy(), dia_corte: 5,
  con_socios: false, socios: [] as string[], proyecto_id: "",
  inversores: [] as Inv[],
  planes: [{ id: 1, nombre: "Básico", mbps: 50, precio: 90 }, { id: 2, nombre: "Medio", mbps: 100, precio: 140 }, { id: 3, nombre: "Premium", mbps: 200, precio: 200 }] as Plan[],
  nap_si: true, nap_codigo: "NAP-01", nap_puertos: 16,
  costos: [] as Costo[],
  meta_clientes: "", meta_meses: "",
});
const sigId = (a: { id: number }[]) => Math.max(0, ...a.map(x => x.id)) + 1;
const sumaMeses = (f: string, m: number) => { const d = new Date(f + "T12:00:00"); d.setMonth(d.getMonth() + m); return d.toISOString().slice(0, 10); };

const Num = ({ v, set, ancho, paso }: { v: any; set: (x: string) => void; ancho?: number; paso?: number }) =>
  <input type="number" min={0} step={paso || 1} value={v} style={ancho ? { width: ancho } : undefined} onChange={e => set(e.target.value)} />;

/** Crea una zona completa, paso a paso. Termina con una sola llamada a la base de datos. */
export function ZonaWizard({ onClose }: { onClose: () => void }) {
  const { recargar, setProyectoId, setZonaId, proyectos } = useApp();
  const [paso, setPaso] = useState(0), [f, setF] = useState(inicial()), [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false);
  const socios = useQuery(() => supabase.from("profiles").select("id, nombre, email").eq("rol", "socio").eq("activo", true).order("nombre"), []);
  const S: any[] = (socios.data as any[]) || [];
  const up = (k: string, v: any) => setF({ ...f, [k]: v });

  const validar = (): string => {
    if (paso === 0) {
      if (!f.nombre.trim()) return "Escribe el nombre de la zona.";
      const d = n(f.dia_corte); if (d < 1 || d > 28) return "El día de corte debe estar entre 1 y 28.";
    }
    if (paso === 2) { const mal = f.inversores.find(i => !i.nombre.trim() || !(n(i.monto) > 0)); if (mal) return "Cada inversor necesita nombre y un monto mayor a 0 (o quítalo)."; }
    if (paso === 3) { if (!f.planes.length) return "Deja al menos un plan."; if (f.planes.some(p => !p.nombre.trim() || !(n(p.mbps) > 0))) return "Cada plan necesita nombre y velocidad (Mbps)."; }
    if (paso === 4 && f.nap_si) { if (!f.nap_codigo.trim()) return "Escribe el código de la NAP (por ejemplo NAP-01)."; if (n(f.nap_puertos) < 1 || n(f.nap_puertos) > 128) return "Los puertos van de 1 a 128."; }
    return "";
  };
  const siguiente = () => { const e = validar(); setMsg(e); if (!e) setPaso(paso + 1); };

  const crear = async () => {
    setMsg(""); setOcup(true);
    try {
      const payload = {
        nombre: f.nombre.trim(), ubicacion: f.ubicacion, fecha_inicio: f.fecha_inicio, dia_corte: n(f.dia_corte),
        con_socios: f.con_socios, socios: f.con_socios ? f.socios : [], proyecto_id: !f.con_socios && f.proyecto_id ? f.proyecto_id : null,
        inversores: f.inversores.filter(i => i.nombre.trim() && n(i.monto) > 0).map(i => ({ nombre: i.nombre, monto: n(i.monto), interes: n(i.interes), periodo_interes: i.periodo_interes, plazo_meses: n(i.plazo_meses) || 12 })),
        planes: f.planes.map(p => ({ nombre: p.nombre, mbps: n(p.mbps), precio: n(p.precio) })),
        nap: f.nap_si ? { codigo: f.nap_codigo, puertos: n(f.nap_puertos) } : null,
        costos: f.costos.filter(c => c.concepto.trim()).map(c => ({ concepto: c.concepto, cantidad: n(c.cantidad) || 1, monto_unitario: n(c.monto_unitario) })),
        meta_clientes: f.meta_clientes === "" ? null : n(f.meta_clientes), meta_meses: f.meta_meses === "" ? null : n(f.meta_meses),
      };
      const { data, error } = await supabase.rpc("crear_zona_completa", { p: payload });
      if (error) throw new Error(error.message);
      await recargar();
      const r: any = data;
      if (r?.proyecto_id) setProyectoId(r.proyecto_id);
      if (r?.zona_id) setZonaId(r.zona_id);
      onClose();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };

  const totalInv = f.inversores.reduce((a, i) => a + n(i.monto), 0);
  const fechaMeta = n(f.meta_meses) > 0 ? sumaMeses(f.fecha_inicio, n(f.meta_meses)) : "";
  const upI = (id: number, k: keyof Inv, v: any) => up("inversores", f.inversores.map(x => x.id === id ? { ...x, [k]: v } : x));
  const upP = (id: number, k: keyof Plan, v: any) => up("planes", f.planes.map(x => x.id === id ? { ...x, [k]: v } : x));
  const upC = (id: number, k: keyof Costo, v: any) => up("costos", f.costos.map(x => x.id === id ? { ...x, [k]: v } : x));

  return <Modal titulo={`Nueva zona · Paso ${paso + 1} de ${PASOS.length}: ${PASOS[paso]}`} onClose={onClose} ancho={760}>
    <div style={{ height: 6, background: "var(--line)", borderRadius: 99, margin: "4px 0 14px" }}><div style={{ height: 6, width: ((paso + 1) / PASOS.length) * 100 + "%", background: "var(--acc)", borderRadius: 99 }} /></div>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}

    {paso === 0 && <div className="form">
      <Campo l="Nombre de la zona *"><input autoFocus value={f.nombre} onChange={e => up("nombre", e.target.value)} placeholder="Ej: Zona Norte" /></Campo>
      <Campo l="Ubicación o referencia"><input value={f.ubicacion} onChange={e => up("ubicacion", e.target.value)} placeholder="Ej: Barrio San José, Quillacollo" /></Campo>
      <Campo l="Fecha de inicio"><input type="date" value={f.fecha_inicio} onChange={e => up("fecha_inicio", e.target.value)} /></Campo>
      <Campo l="Día de corte de cobro (1 a 28)"><Num v={f.dia_corte} set={v => up("dia_corte", v)} /></Campo>
    </div>}

    {paso === 1 && <>
      <p><b>¿Esta zona tendrá socios o inversores que puedan ver solo esta zona?</b></p>
      <div className="grid g2">
        <button className="card" style={{ textAlign: "left", cursor: "pointer", borderColor: !f.con_socios ? "var(--acc)" : undefined, borderWidth: !f.con_socios ? 2 : 1 }} onClick={() => up("con_socios", false)}>
          <b>No, es solo mía</b><br /><span className="mute">Va en un proyecto tuyo y comparte el almacén central con tus otras zonas de ese proyecto.</span></button>
        <button className="card" style={{ textAlign: "left", cursor: "pointer", borderColor: f.con_socios ? "var(--acc)" : undefined, borderWidth: f.con_socios ? 2 : 1 }} onClick={() => up("con_socios", true)}>
          <b>Sí, con socios o inversores</b><br /><span className="mute">La zona queda en un proyecto propio. Cada socio que elijas verá únicamente ese proyecto.</span></button>
      </div>
      {f.con_socios ? <div className="card"><h2>¿Qué socios la verán?</h2>
        {socios.loading ? <Cargando /> : S.length ? S.map(x => <label key={x.id} className="fila" style={{ padding: "4px 0" }}>
          <input type="checkbox" checked={f.socios.includes(x.id)} onChange={e => up("socios", e.target.checked ? [...f.socios, x.id] : f.socios.filter(y => y !== x.id))} /> {x.nombre || x.email} <span className="mute">{x.email}</span></label>)
          : <Vacio>Todavía no tienes usuarios con rol Socio. Puedes seguir y agregarlos después, cuando los crees en el menú Usuarios.</Vacio>}
        <p className="mute">Podrás agregar, quitar o cambiar socios cuando quieras en Red → Historial de la red.</p></div>
        : <div className="card"><h2>¿En qué proyecto va?</h2><select value={f.proyecto_id} onChange={e => up("proyecto_id", e.target.value)}><option value="">Proyecto principal (Vortex)</option>{proyectos.filter(x => x.nombre !== "Vortex").map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
          <p className="mute" style={{ margin: "8px 0 0" }}>Si eliges un proyecto que ya tiene socios, ellos verán también esta zona. Para que un socio vea solo esta zona, elige "Sí, con socios o inversores".</p></div>}
    </>}

    {paso === 2 && <>
      <Aviso>Anota aquí el dinero que te prestaron o invirtieron para esta zona (capital, interés y plazo). Es un registro de cuentas: <b>no da acceso a la app</b>. Si no tienes inversores, pasa al siguiente paso.</Aviso>
      <div className="tw"><table><thead><tr><th>Nombre</th><th>Capital (Bs)</th><th>Interés %</th><th>El interés es</th><th>Plazo (meses)</th><th /></tr></thead>
        <tbody>{f.inversores.map(i => <tr key={i.id}>
          <td><input value={i.nombre} style={{ width: 150 }} onChange={e => upI(i.id, "nombre", e.target.value)} /></td>
          <td><Num v={i.monto} ancho={100} set={v => upI(i.id, "monto", v)} /></td>
          <td><Num v={i.interes} ancho={70} paso={0.1} set={v => upI(i.id, "interes", v)} /></td>
          <td><select value={i.periodo_interes} onChange={e => upI(i.id, "periodo_interes", e.target.value)}><option value="mensual">por mes</option><option value="anual">por año</option></select></td>
          <td><Num v={i.plazo_meses} ancho={70} set={v => upI(i.id, "plazo_meses", v)} /></td>
          <td><button className="btn suave chico" onClick={() => up("inversores", f.inversores.filter(x => x.id !== i.id))}>Quitar</button></td></tr>)}</tbody></table></div>
      <div className="fila" style={{ marginTop: 8 }}><button className="btn suave" onClick={() => up("inversores", [...f.inversores, { id: sigId(f.inversores), nombre: "", monto: "", interes: 0, periodo_interes: "mensual", plazo_meses: 12 }])}>+ Agregar inversor</button>{totalInv > 0 && <span className="mute">Capital total: <b>{bs(totalInv)}</b></span>}</div>
    </>}

    {paso === 3 && <>
      <Aviso>Precios mensuales de esta zona. Puedes cambiarlos más tarde; cambiar un plan nunca modifica a los clientes que ya lo contrataron.</Aviso>
      <div className="tw"><table><thead><tr><th>Plan</th><th>Mbps</th><th>Precio (Bs/mes)</th><th /></tr></thead>
        <tbody>{f.planes.map(p => <tr key={p.id}>
          <td><input value={p.nombre} style={{ width: 160 }} onChange={e => upP(p.id, "nombre", e.target.value)} /></td>
          <td><Num v={p.mbps} ancho={90} set={v => upP(p.id, "mbps", v)} /></td>
          <td><Num v={p.precio} ancho={110} set={v => upP(p.id, "precio", v)} /></td>
          <td><button className="btn suave chico" onClick={() => up("planes", f.planes.filter(x => x.id !== p.id))}>Quitar</button></td></tr>)}</tbody></table></div>
      <button className="btn suave" style={{ marginTop: 8 }} onClick={() => up("planes", [...f.planes, { id: sigId(f.planes), nombre: "", mbps: "", precio: "" }])}>+ Agregar plan</button>
    </>}

    {paso === 4 && <>
      <Aviso>La NAP principal es la caja de distribución desde donde sale la red de la zona. Se crea con todos sus puertos libres. Las demás NAP las agregas después en Red FTTH.</Aviso>
      <label className="fila" style={{ marginBottom: 8 }}><input type="checkbox" checked={f.nap_si} onChange={e => up("nap_si", e.target.checked)} /> Registrar la NAP principal ahora</label>
      {f.nap_si && <div className="form"><Campo l="Código de la NAP"><input value={f.nap_codigo} onChange={e => up("nap_codigo", e.target.value)} /></Campo><Campo l="Cantidad de puertos"><Num v={f.nap_puertos} set={v => up("nap_puertos", v)} /></Campo></div>}
    </>}

    {paso === 5 && <>
      <Aviso>Gastos fijos que se pagan todos los meses en esta zona (Starlink, alquiler de poste o local, energía). Puedes dejarlo vacío y llenarlo después.</Aviso>
      <div className="tw"><table><thead><tr><th>Concepto</th><th>Cantidad</th><th>Monto por unidad (Bs)</th><th /></tr></thead>
        <tbody>{f.costos.map(c => <tr key={c.id}>
          <td><input value={c.concepto} style={{ width: 240 }} onChange={e => upC(c.id, "concepto", e.target.value)} /></td>
          <td><Num v={c.cantidad} ancho={80} set={v => upC(c.id, "cantidad", v)} /></td>
          <td><Num v={c.monto_unitario} ancho={110} set={v => upC(c.id, "monto_unitario", v)} /></td>
          <td><button className="btn suave chico" onClick={() => up("costos", f.costos.filter(x => x.id !== c.id))}>Quitar</button></td></tr>)}</tbody></table></div>
      <button className="btn suave" style={{ marginTop: 8 }} onClick={() => up("costos", [...f.costos, { id: sigId(f.costos), concepto: "", cantidad: 1, monto_unitario: "" }])}>+ Agregar costo fijo</button>
    </>}

    {paso === 6 && <>
      <Aviso>Una meta te ayuda a medir el avance. Es opcional.</Aviso>
      <div className="form"><Campo l="Clientes que quieres alcanzar"><Num v={f.meta_clientes} set={v => up("meta_clientes", v)} /></Campo><Campo l="En cuántos meses"><Num v={f.meta_meses} set={v => up("meta_meses", v)} /></Campo></div>
      {fechaMeta && <p>Fecha límite de la meta: <b>{fechaMeta}</b></p>}
    </>}

    {paso === 7 && <>
      <div className="card"><h2>{f.nombre}</h2><table style={{ minWidth: 0 }}><tbody>
        <tr><td className="mute">Ubicación</td><td>{f.ubicacion || "—"}</td></tr>
        <tr><td className="mute">Inicio / corte</td><td>{f.fecha_inicio} · día {f.dia_corte}</td></tr>
        <tr><td className="mute">Acceso</td><td>{f.con_socios ? `Con socios · proyecto propio · ${f.socios.length} socio(s) elegido(s)` : "Solo mía"}</td></tr>
        <tr><td className="mute">Inversores</td><td>{f.inversores.length ? `${f.inversores.length} · capital ${bs(totalInv)}` : "Ninguno"}</td></tr>
        <tr><td className="mute">Planes</td><td>{f.planes.map(p => `${p.nombre} ${p.mbps} Mbps (${bs(p.precio)})`).join(" · ")}</td></tr>
        <tr><td className="mute">NAP principal</td><td>{f.nap_si ? `${f.nap_codigo} · ${f.nap_puertos} puertos` : "Después"}</td></tr>
        <tr><td className="mute">Costos fijos</td><td>{f.costos.filter(c => c.concepto.trim()).length ? bs(f.costos.reduce((a, c) => a + n(c.cantidad || 1) * n(c.monto_unitario), 0)) + " por mes" : "Ninguno"}</td></tr>
        <tr><td className="mute">Meta</td><td>{n(f.meta_clientes) > 0 ? `${f.meta_clientes} clientes${fechaMeta ? " antes del " + fechaMeta : ""}` : "Sin meta"}</td></tr>
      </tbody></table></div>
      <p className="mute">Al crearla se genera también su almacén. Todo lo demás lo podrás ajustar después.</p>
    </>}

    <div className="fila entre" style={{ marginTop: 14 }}>
      <button className="btn suave" disabled={paso === 0 || ocup} onClick={() => { setMsg(""); setPaso(paso - 1); }}>Atrás</button>
      {paso < PASOS.length - 1 ? <button className="btn" onClick={siguiente}>Siguiente</button> : <button className="btn mor" disabled={ocup} onClick={crear}>{ocup ? "Creando…" : "Crear zona"}</button>}
    </div>
  </Modal>;
}

/** Socios que pueden ver solo esta zona (únicamente zonas con proyecto propio). */
export function AccesosZona({ zona, onClose }: { zona: any; onClose: () => void }) {
  const pu = useQuery(() => supabase.from("proyecto_usuarios").select("user_id").eq("proyecto_id", zona.proyecto_id), [zona.id]);
  const socios = useQuery(() => supabase.from("profiles").select("id, nombre, email").eq("rol", "socio").eq("activo", true).order("nombre"), []);
  const [msg, setMsg] = useState(""), [nuevo, setNuevo] = useState("");
  const S: any[] = (socios.data as any[]) || [], ids = ((pu.data as any[]) || []).map(x => x.user_id);
  const con = S.filter(x => ids.includes(x.id)), sin = S.filter(x => !ids.includes(x.id));
  const cambiar = async (user: string, dar: boolean) => {
    setMsg(""); const { error } = await supabase.rpc("dar_acceso_zona", { p_zona: zona.id, p_user: user, p_dar: dar });
    if (error) setMsg(error.message); else { setNuevo(""); pu.recargar(); }
  };
  return <Modal titulo={`Socios con acceso a ${zona.nombre}`} onClose={onClose}>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}
    {pu.loading || socios.loading ? <Cargando /> : <>
      {con.length ? <table style={{ minWidth: 0 }}><tbody>{con.map(x => <tr key={x.id}><td>{x.nombre || x.email}<br /><span className="mute">{x.email}</span></td><td><button className="btn suave chico" onClick={() => confirm(`¿Quitar el acceso de ${x.nombre || x.email}?`) && cambiar(x.id, false)}>Quitar acceso</button></td></tr>)}</tbody></table> : <Vacio>Ningún socio puede ver esta zona todavía.</Vacio>}
      <div className="fila" style={{ marginTop: 12 }}>
        <select value={nuevo} onChange={e => setNuevo(e.target.value)}><option value="">Elige un socio…</option>{sin.map(x => <option key={x.id} value={x.id}>{x.nombre || x.email}</option>)}</select>
        <button className="btn" disabled={!nuevo} onClick={() => cambiar(nuevo, true)}>Dar acceso</button></div>
      {!sin.length && <p className="mute">No hay más usuarios con rol Socio. Créalos en el menú Usuarios (rol "Socio") y vuelve aquí.</p>}
      <Aviso>Un socio ve <b>solo esta zona</b>, incluidas sus finanzas. El dinero que puso una persona (capital e interés) se registra en Finanzas → Inversores; para que además pueda entrar a ver la zona, créale un usuario con rol Socio y agrégalo aquí.</Aviso>
    </>}
  </Modal>;
}
