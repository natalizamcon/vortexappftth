import { useState } from "react";
import { supabase, subirArchivo, urlArchivo } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Vacio, bs, hoy, useAlcance, useQuery } from "../lib/ui";
import { aPapelera } from "../lib/papelera";
import { BaseInteres, Moneda, ModoInteres, calcularInversion, resumenGuardado } from "../lib/inversion";

const num = (x: any) => Number(x) || 0;
const fmt = (n: number, m: Moneda) => (m === "USD" ? "USD " : "Bs ") + n.toLocaleString("es-BO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => n.toLocaleString("es-BO", { maximumFractionDigits: 2 }) + "%";
const BASE_TXT: Record<string, string> = { mensual: "por mes", anual: "por año", total: "en total" };

/** Inversores: capital en bolivianos o dólares (con el tipo de cambio usado), interés pactado por % o por monto, y comprobante de lo invertido. */
export function Inversores() {
  const { zonaId, proyectoId, zonas } = useApp(), al = useAlcance();
  const inv = useQuery(() => al(supabase.from("inversores").select("*, zonas(nombre)").order("nombre")), [proyectoId, zonaId]), pag = useQuery(() => al(supabase.from("pagos_inversores").select("*").order("fecha", { ascending: false }), false), [proyectoId, inv.data]);
  const [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false), [comp, setComp] = useState<File | null>(null), [clave, setClave] = useState(0);
  const [f, setF] = useState({ nombre: "", moneda: "BOB" as Moneda, cap: "", tc: "", plazo: "12", fecha: hoy(), modo: "porcentaje" as ModoInteres, valor: "", base: "mensual" as BaseInteres });
  const [g, setG] = useState({ inversor_id: "", fecha: hoy(), monto: "", nota: "" }), [arch, setArch] = useState<File | null>(null);
  const I: any[] = (inv.data as any[]) || [], P: any[] = (pag.data as any[]) || [], pagado = (id: string) => P.filter(p => p.inversor_id === id).reduce((s, p) => s + num(p.monto), 0);
  const calc = calcularInversion({ moneda: f.moneda, cap: num(f.cap), tc: num(f.tc), plazo: num(f.plazo), modo: f.modo, valor: num(f.valor), base: f.base });
  const totalInt = (x: any) => resumenGuardado(x).interes * resumenGuardado(x).factor, totalBs = (x: any) => num(x.monto) + totalInt(x);
  const set = (k: string, v: any) => setF(x => ({ ...x, [k]: v }));
  const cambiarModo = (modo: ModoInteres) => setF(x => ({ ...x, modo, base: modo === "porcentaje" && x.base === "total" ? "mensual" : x.base }));

  const crear = async () => {
    setMsg(""); setOk(""); const z = zonas.find(x => x.id === zonaId); if (!z) return setMsg("Elige una zona arriba."); if (!f.nombre.trim()) return setMsg("Escribe el nombre del inversor."); if (!calc.ok) return setMsg(calc.error || "Revisa los datos.");
    setOcup(true);
    try {
      const ruta = comp ? await subirArchivo("comprobantes", z.proyecto_id, comp) : null;
      const { error } = await supabase.from("inversores").insert({ proyecto_id: z.proyecto_id, zona_id: z.id, nombre: f.nombre.trim(), monto: calc.montoBs, interes: calc.interes, periodo_interes: calc.periodo, plazo_meses: Math.round(num(f.plazo)), fecha_inicio: f.fecha,
        moneda: f.moneda, monto_original: num(f.cap), tipo_cambio: f.moneda === "USD" ? num(f.tc) : null, interes_modo: f.modo, interes_monto: f.modo === "monto" ? num(f.valor) : null, interes_base: f.modo === "monto" ? f.base : null, comprobante_path: ruta });
      if (error) throw new Error(error.message);
      setOk(`Inversor "${f.nombre.trim()}" agregado${ruta ? " con su comprobante" : ""}.`); setF({ ...f, nombre: "", cap: "", valor: "" }); setComp(null); setClave(k => k + 1); inv.recargar();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  const pagar = async () => { setMsg(""); setOk(""); const inversor = I.find(x => x.id === g.inversor_id); if (!inversor) return setMsg("Elige al inversor."); try { const ruta = arch ? await subirArchivo("comprobantes", inversor.proyecto_id, arch) : null; const { error } = await supabase.from("pagos_inversores").insert({ inversor_id: g.inversor_id, proyecto_id: inversor.proyecto_id, fecha: g.fecha, monto: num(g.monto), nota: g.nota, comprobante_path: ruta }); if (error) throw new Error(error.message); setG({ ...g, monto: "", nota: "" }); setArch(null); pag.recargar(); } catch (e: any) { setMsg(e.message); } };
  const ver = async (ruta: string) => { const u = await urlArchivo("comprobantes", ruta); if (u) window.open(u, "_blank"); else setMsg("No se pudo abrir el archivo."); };
  const debe = I.reduce((s, x) => s + totalBs(x) - pagado(x.id), 0);
  const modoBtn = (m: ModoInteres, t: string) => <button type="button" className={"btn chico " + (f.modo === m ? "" : "suave")} onClick={() => cambiarModo(m)}>{t}</button>;

  return <>{msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="grid gk" style={{ marginBottom: 14 }}><div className="card kpi"><span>Capital recibido</span><b>{bs(I.reduce((s, x) => s + num(x.monto), 0))}</b></div><div className="card kpi"><span>Intereses a devolver</span><b>{bs(I.reduce((s, x) => s + totalInt(x), 0))}</b></div><div className="card kpi"><span>Pagado a inversores</span><b>{bs(P.reduce((s, x) => s + num(x.monto), 0))}</b></div><div className="card kpi"><span>Lo que debo ahora</span><b style={{ color: debe > 0 ? "var(--bad)" : "var(--ok)" }}>{bs(debe)}</b></div></div>
    <div className="card tw"><h2>Inversores</h2>{I.length ? <table><thead><tr><th>Inversor</th><th>Zona</th><th>Capital</th><th>Interés</th><th>Plazo</th><th>Total a devolver</th><th>Cuota mensual</th><th>Pagado</th><th>Saldo</th><th>Comprobante</th><th /></tr></thead><tbody>{I.map(x => {
      const r = resumenGuardado(x), t = totalBs(x), usd = x.moneda === "USD";
      return <tr key={x.id}><td>{x.nombre}<br /><small className="mute">desde {String(x.fecha_inicio).slice(0, 10)}</small></td><td>{x.zonas?.nombre}</td>
        <td>{usd ? <><b>{fmt(r.cap, "USD")}</b><br /><small className="mute">T/C {r.factor} → {bs(x.monto)}</small></> : bs(x.monto)}</td>
        <td><b>{pct(r.pctMes)}</b> por mes<br /><small className="mute">{pct(r.pctAnio)} por año{x.interes_modo === "monto" && x.interes_monto ? ` · pactado ${fmt(num(x.interes_monto), usd ? "USD" : "BOB")} ${BASE_TXT[x.interes_base || "total"]}` : ""}</small></td>
        <td>{x.plazo_meses} meses</td><td>{bs(t)}{usd && <><br /><small className="mute">{fmt(r.total, "USD")}</small></>}</td><td>{bs(t / (num(x.plazo_meses) || 1))}</td><td>{bs(pagado(x.id))}</td><td><b>{bs(Math.max(0, t - pagado(x.id)))}</b></td>
        <td>{x.comprobante_path ? <button className="btn suave chico" onClick={() => ver(x.comprobante_path)}>Ver comprobante</button> : <small className="mute">Sin comprobante</small>}</td>
        <td><button className="btn suave chico" onClick={async () => { if (!confirm(`¿Mandar a "${x.nombre}" a la papelera? Sus pagos también se ocultan y podrás recuperarlo desde el menú Papelera.`)) return; try { await aPapelera("inversores", [x.id]); inv.recargar(); } catch (e: any) { setMsg(e.message); } }}>A la papelera</button></td></tr>; })}</tbody></table> : <Vacio>Aún no hay inversores.</Vacio>}
      <p className="mute" style={{ margin: "8px 0 0" }}>Los totales, el saldo y los pagos están en bolivianos, con el tipo de cambio que registraste al recibir la inversión.</p></div>

    <div className="grid g2"><div className="card"><h2>Nuevo inversor</h2>
      <div className="form"><Campo l="Nombre"><input value={f.nombre} onChange={e => set("nombre", e.target.value)} /></Campo>
        <Campo l="Invirtió en"><select value={f.moneda} onChange={e => set("moneda", e.target.value)}><option value="BOB">Bolivianos (Bs)</option><option value="USD">Dólares (USD)</option></select></Campo>
        <Campo l={`Monto invertido (${f.moneda === "USD" ? "USD" : "Bs"})`}><input type="number" min={0} step="0.01" value={f.cap} onChange={e => set("cap", e.target.value)} /></Campo>
        {f.moneda === "USD" && <Campo l="Tipo de cambio que se usó (Bs por 1 USD)"><input type="number" min={0} step="0.01" placeholder="por ejemplo 6.96" value={f.tc} onChange={e => set("tc", e.target.value)} /></Campo>}
        <Campo l="Plazo (meses)"><input type="number" min={1} value={f.plazo} onChange={e => set("plazo", e.target.value)} /></Campo>
        <Campo l="Fecha en que invirtió"><input type="date" value={f.fecha} onChange={e => set("fecha", e.target.value)} /></Campo></div>
      <h3 style={{ margin: "10px 0 4px" }}>Interés que le vas a pagar</h3>
      <div className="fila" style={{ marginBottom: 6 }}>{modoBtn("porcentaje", "Lo pongo en porcentaje (%)")}{modoBtn("monto", "Lo pongo en monto")}</div>
      <div className="form"><Campo l={f.modo === "porcentaje" ? "Porcentaje (%)" : `Monto de interés (${f.moneda === "USD" ? "USD" : "Bs"})`}><input type="number" min={0} step="0.01" value={f.valor} onChange={e => set("valor", e.target.value)} /></Campo>
        <Campo l="El interés es"><select value={f.base} onChange={e => set("base", e.target.value)}><option value="mensual">por mes</option><option value="anual">por año</option>{f.modo === "monto" && <option value="total">en total (todo el plazo)</option>}</select></Campo></div>
      {calc.ok ? <div style={{ background: "var(--lilb)", borderRadius: 10, padding: 10, margin: "8px 0", fontSize: 13 }}>
        {f.moneda === "USD" && <div>Capital en bolivianos: <b>{bs(calc.montoBs)}</b> <span className="mute">({fmt(num(f.cap), "USD")} × {num(f.tc)})</span></div>}
        <div>Interés equivalente: <b>{pct(calc.pctMes)} por mes</b> · <b>{pct(calc.pctAnio)} por año</b></div>
        <div>Pagarás <b>{fmt(calc.porMes, f.moneda)}</b> por mes · <b>{fmt(calc.interesTotal, f.moneda)}</b> de interés en {num(f.plazo)} meses</div>
        <div>Total a devolver: <b>{fmt(calc.totalDevolver, f.moneda)}</b>{f.moneda === "USD" && <> ≈ <b>{bs(calc.totalDevolver * calc.factor)}</b></>}</div></div> : <p className="mute" style={{ margin: "8px 0" }}>{calc.error}</p>}
      <div className="form"><Campo l="Comprobante de lo que invirtió (foto o PDF)"><input type="file" accept="image/*,.pdf" key={clave} onChange={e => setComp(e.target.files?.[0] || null)} /></Campo></div>
      <button className="btn" disabled={ocup || !f.nombre.trim() || !calc.ok} onClick={crear}>{ocup ? "Guardando…" : "Agregar inversor"}</button></div>
      <div className="card"><h2>Registrar pago a un inversor</h2><div className="form"><Campo l="Inversor"><select value={g.inversor_id} onChange={e => setG({ ...g, inversor_id: e.target.value })}><option value="">Elige…</option>{I.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Campo><Campo l="Fecha"><input type="date" value={g.fecha} onChange={e => setG({ ...g, fecha: e.target.value })} /></Campo><Campo l="Monto pagado (Bs)"><input type="number" value={g.monto} onChange={e => setG({ ...g, monto: e.target.value })} /></Campo><Campo l="Nota"><input value={g.nota} onChange={e => setG({ ...g, nota: e.target.value })} /></Campo><Campo l="Respaldo"><input type="file" key={String(P.length)} onChange={e => setArch(e.target.files?.[0] || null)} /></Campo></div><button className="btn" disabled={!g.inversor_id || !(num(g.monto) > 0)} onClick={pagar}>Registrar pago</button></div></div>
    <div className="card tw"><h2>Pagos a inversores</h2>{P.length ? <table><thead><tr><th>Fecha</th><th>Inversor</th><th>Monto</th><th>Nota</th><th /></tr></thead><tbody>{P.map(p => <tr key={p.id}><td>{p.fecha}</td><td>{I.find(x => x.id === p.inversor_id)?.nombre}</td><td><b>{bs(p.monto)}</b></td><td>{p.nota || "—"}</td><td>{p.comprobante_path && <button className="btn suave chico" onClick={() => ver(p.comprobante_path)}>Ver respaldo</button>}</td></tr>)}</tbody></table> : <Vacio>Aún no hay pagos a inversores.</Vacio>}</div></>;
}
