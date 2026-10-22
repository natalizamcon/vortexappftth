import { useState } from "react";
import { supabase, subirArchivo, urlArchivo } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Tabs, Vacio, bs, hoy, useAlcance, useQuery } from "../lib/ui";
import Crud from "../lib/crud";
import { aPapelera } from "../lib/papelera";
import { Presupuesto, PresupuestoVsReal } from "./Presupuesto";
import Simulador from "./Simulador";
import Compras from "./Compras";
import { IngresosGastos, Rentabilidad } from "./FinanzasPanel";
import { CajaFondos, CostosCompartidos, GastosEmpresa, MiReparto } from "./FinanzasReparto";
import { PagosPersonal } from "./FinanzasPersonal";

/** Finanzas ordenada en carpetas: cada carpeta agrupa lo que va junto. */
export default function Finanzas() {
  const { perfil } = useApp(), admin = perfil?.rol === "admin";
  const socio = perfil?.rol === "socio", par = (x: [string, string][], si: boolean) => (si ? x : []);
  const carpetas: [string, string, [string, string][]][] = [
    ["panel", "Panel", [["rent", "Rentabilidad"], ["mov", "Ingresos y gastos"]]],
    ["inv", "Inversores y fondos", [["inv", "Inversores"], ...par([["fon", "Caja y fondos"]], admin), ...par([["mi", "Mi reparto"]], socio)]],
    ["sim", "Simulador y presupuesto", [["sim", "Simulador de proyecto"], ["pre", "Presupuesto de la zona"], ["vs", "Presupuesto vs real"]]],
    ["costos", "Costos y compras", [...par([["comp", "Costos compartidos"], ["emp", "Gastos de la empresa"], ["compras", "Compras de la empresa"]], admin), ["per", "Pagos al personal"]]],
  ];
  const [c, setC] = useState("panel"), [subs, setSubs] = useState<Record<string, string>>({});
  const carpeta = carpetas.find(x => x[0] === c) || carpetas[0], sub = subs[carpeta[0]] || carpeta[2][0][0], clave = carpeta[0] + ":" + sub;
  return <>
    <h1>Finanzas</h1>
    <Tabs items={carpetas.map(x => [x[0], x[1]] as [string, string])} valor={carpeta[0]} onChange={setC} />
    {carpeta[2].length > 1 && <div className="subtabs">{carpeta[2].map(([k, l]) => <button key={k} className={sub === k ? "on" : ""} onClick={() => setSubs({ ...subs, [carpeta[0]]: k })}>{l}</button>)}</div>}
    {clave === "panel:rent" && <Rentabilidad />}
    {clave === "panel:mov" && <IngresosGastos />}
    {clave === "inv:inv" && <Inversores />}
    {clave === "inv:fon" && <CajaFondos />}
    {clave === "inv:mi" && <MiReparto />}
    {clave === "sim:sim" && <Simulador />}
    {clave === "sim:pre" && <Presupuesto />}
    {clave === "sim:vs" && <PresupuestoVsReal />}
    {clave === "costos:comp" && <CostosCompartidos />}
    {clave === "costos:emp" && <GastosEmpresa />}
    {clave === "costos:compras" && <Compras />}
    {clave === "costos:per" && <PagosPersonal />}
  </>;
}

function Inversores() {
  const { zonaId, proyectoId, zonas } = useApp(), al = useAlcance();
  const inv = useQuery(() => al(supabase.from("inversores").select("*, zonas(nombre)").order("nombre")), [proyectoId, zonaId]), pag = useQuery(() => al(supabase.from("pagos_inversores").select("*").order("fecha", { ascending: false }), false), [proyectoId, inv.data]);
  const [msg, setMsg] = useState(""), [f, setF] = useState({ nombre: "", monto: "", interes: "", periodo_interes: "mensual", plazo_meses: "12", fecha_inicio: hoy() }), [g, setG] = useState({ inversor_id: "", fecha: hoy(), monto: "", nota: "" }), [arch, setArch] = useState<File | null>(null);
  const I: any[] = (inv.data as any[]) || [], P: any[] = (pag.data as any[]) || [], interes = (x: any) => +x.monto * (+x.interes / 100) * (x.periodo_interes === "anual" ? x.plazo_meses / 12 : x.plazo_meses), pagado = (id: string) => P.filter(p => p.inversor_id === id).reduce((s, p) => s + +p.monto, 0);
  const crear = async () => { setMsg(""); const z = zonas.find(x => x.id === zonaId); if (!z) return setMsg("Elige una zona arriba."); const { error } = await supabase.from("inversores").insert({ proyecto_id: z.proyecto_id, zona_id: z.id, nombre: f.nombre, monto: +f.monto, interes: +f.interes || 0, periodo_interes: f.periodo_interes, plazo_meses: +f.plazo_meses || 12, fecha_inicio: f.fecha_inicio }); if (error) setMsg(error.message); else { setF({ ...f, nombre: "", monto: "" }); inv.recargar(); } };
  const pagar = async () => { setMsg(""); const inversor = I.find(x => x.id === g.inversor_id); if (!inversor) return setMsg("Elige al inversor."); try { const ruta = arch ? await subirArchivo("comprobantes", inversor.proyecto_id, arch) : null; const { error } = await supabase.from("pagos_inversores").insert({ inversor_id: g.inversor_id, proyecto_id: inversor.proyecto_id, fecha: g.fecha, monto: +g.monto, nota: g.nota, comprobante_path: ruta }); if (error) throw new Error(error.message); setG({ ...g, monto: "", nota: "" }); setArch(null); pag.recargar(); } catch (e: any) { setMsg(e.message); } };
  const debe = I.reduce((s, x) => s + x.monto * 1 + interes(x) - pagado(x.id), 0);
  return <>{msg && <Aviso tipo="mal">{msg}</Aviso>}<div className="grid gk" style={{ marginBottom: 14 }}><div className="card kpi"><span>Capital recibido</span><b>{bs(I.reduce((s, x) => s + +x.monto, 0))}</b></div><div className="card kpi"><span>Intereses a devolver</span><b>{bs(I.reduce((s, x) => s + interes(x), 0))}</b></div><div className="card kpi"><span>Pagado a inversores</span><b>{bs(P.reduce((s, x) => s + +x.monto, 0))}</b></div><div className="card kpi"><span>Lo que debo ahora</span><b style={{ color: debe > 0 ? "var(--bad)" : "var(--ok)" }}>{bs(debe)}</b></div></div>
    <div className="card tw"><h2>Inversores</h2>{I.length ? <table><thead><tr><th>Inversor</th><th>Zona</th><th>Capital</th><th>Interés</th><th>Plazo</th><th>Total a devolver</th><th>Cuota mensual</th><th>Pagado</th><th>Saldo</th><th /></tr></thead><tbody>{I.map(x => { const t = +x.monto + interes(x); return <tr key={x.id}><td>{x.nombre}</td><td>{x.zonas?.nombre}</td><td>{bs(x.monto)}</td><td>{x.interes}% {x.periodo_interes}</td><td>{x.plazo_meses} meses</td><td>{bs(t)}</td><td>{bs(t / x.plazo_meses)}</td><td>{bs(pagado(x.id))}</td><td><b>{bs(Math.max(0, t - pagado(x.id)))}</b></td><td><button className="btn suave chico" onClick={async () => { if (!confirm(`¿Mandar a "${x.nombre}" a la papelera? Sus pagos también se ocultan y podrás recuperarlo desde el menú Papelera.`)) return; try { await aPapelera("inversores", [x.id]); inv.recargar(); } catch (e: any) { setMsg(e.message); } }}>A la papelera</button></td></tr>; })}</tbody></table> : <Vacio>Aún no hay inversores.</Vacio>}</div>
    <div className="grid g2"><div className="card"><h2>Nuevo inversor</h2><div className="form"><Campo l="Nombre"><input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></Campo><Campo l="Monto invertido (Bs)"><input type="number" value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} /></Campo><Campo l="Interés %"><input type="number" value={f.interes} onChange={e => setF({ ...f, interes: e.target.value })} /></Campo><Campo l="El interés es"><select value={f.periodo_interes} onChange={e => setF({ ...f, periodo_interes: e.target.value })}><option value="mensual">por mes</option><option value="anual">por año</option></select></Campo><Campo l="Plazo (meses)"><input type="number" value={f.plazo_meses} onChange={e => setF({ ...f, plazo_meses: e.target.value })} /></Campo></div><button className="btn" disabled={!f.nombre.trim() || !(+f.monto > 0)} onClick={crear}>Agregar inversor</button></div>
      <div className="card"><h2>Registrar pago a un inversor</h2><div className="form"><Campo l="Inversor"><select value={g.inversor_id} onChange={e => setG({ ...g, inversor_id: e.target.value })}><option value="">Elige…</option>{I.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo><Campo l="Fecha"><input type="date" value={g.fecha} onChange={e => setG({ ...g, fecha: e.target.value })} /></Campo><Campo l="Monto (Bs)"><input type="number" value={g.monto} onChange={e => setG({ ...g, monto: e.target.value })} /></Campo><Campo l="Nota"><input value={g.nota} onChange={e => setG({ ...g, nota: e.target.value })} /></Campo><Campo l="Respaldo"><input type="file" key={String(P.length)} onChange={e => setArch(e.target.files?.[0] || null)} /></Campo></div><button className="btn" disabled={!g.inversor_id || !(+g.monto > 0)} onClick={pagar}>Registrar pago</button></div></div>
    <div className="card tw"><h2>Pagos a inversores</h2>{P.length ? <table><thead><tr><th>Fecha</th><th>Inversor</th><th>Monto</th><th>Nota</th><th /></tr></thead><tbody>{P.map(p => <tr key={p.id}><td>{p.fecha}</td><td>{I.find(x => x.id === p.inversor_id)?.nombre}</td><td><b>{bs(p.monto)}</b></td><td>{p.nota || "—"}</td><td>{p.comprobante_path && <button className="btn suave chico" onClick={async () => { const u = await urlArchivo("comprobantes", p.comprobante_path); if (u) window.open(u, "_blank"); }}>Ver respaldo</button>}</td></tr>)}</tbody></table> : <Vacio>Aún no hay pagos a inversores.</Vacio>}</div></>;
}
