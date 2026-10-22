import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { aPapelera } from "../lib/papelera";
import { Aviso, Vacio, bs, hoy, useProyecto, useQuery } from "../lib/ui";
import { Linea } from "../lib/graficos";
import { mesDesp } from "../lib/datos";

const FACTOR_DIAS: Record<string, number> = { días: 1, semanas: 7, meses: 30 };
const inicial = () => ({
  inicio: mesDesp(hoy().slice(0, 7), 1) + "-01",
  tf: 6000, tp: 2500, td: 2500, to: 1000, es: 4500, eo: 3000, em: 1500, ex: 0, naps: 6, napc: 450, ferr: 2500,
  ont: 180, mat: 85, meta: 120, cump: 100, plazo: 6, unidad: "meses", basico: 80, inst: 150,
  viajes: 8, pers: 3, dias: 2, ud: "días", pagos: [150, 150, 150] as any[], pago: 150, viat: 50, gas: 220, mov: 100,
  starlink: 900, fijos: 400, vari: 8, hor: 24,
} as Record<string, any>);

export default function Simulador() {
  const { zonas, zonaId } = useApp(), pidUnico = useProyecto();
  const [p, setP] = useState(inicial()), [nom, setNom] = useState(""), [zonaGuia, setZonaGuia] = useState(zonaId || ""), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false);
  const v = (k: string) => Number(p[k]) || 0, set = (k: string) => (e: any) => setP({ ...p, [k]: e.target.value });
  const pid = zonas.find(z => z.id === zonaGuia)?.proyecto_id || zonas.find(z => z.id === zonaId)?.proyecto_id || pidUnico;
  const guardados = useQuery(() => supabase.from("simulaciones").select("id, nombre, datos, creado_en, proyecto_id").order("creado_en", { ascending: false }).limit(50), [pid]);

  /* ---- cálculos (los mismos del prototipo) ---- */
  const R = Math.max(1, p.unidad === "semanas" ? v("plazo") / 4.33 : v("plazo"));
  const dF = v("dias") * (FACTOR_DIAS[p.ud] || 1), pgs = Array.from({ length: Math.min(10, v("pers")) }, (_, i) => Number((p.pagos || [])[i] ?? p.pago) || 0);
  const viajeC = v("gas") + v("mov") + (pgs.reduce((a, b) => a + b, 0) + v("pers") * v("viat")) * dF, viajesT = viajeC * v("viajes");
  const trT = v("tf") + v("tp") + v("td") + v("to"), eqT = v("es") + v("eo") + v("em") + v("ex"), infra = trT + eqT + v("naps") * v("napc") + v("ferr");
  const fijo = v("starlink") + v("fijos"), mg = v("basico") - v("vari"), hor = v("hor"), n = Math.round((v("meta") * v("cump")) / 100);
  const sim = (n: number) => {
    const cum = [-infra]; let prev = 0, c = -infra;
    for (let m = 1; m <= 60; m++) { const cl = Math.min(n, (n * m) / R); c += (cl - prev) * (v("inst") - v("ont") - v("mat")) - (n ? (viajesT * (cl - prev)) / n : 0) + cl * mg - fijo; cum.push(c); prev = cl; }
    return cum;
  };
  const pay = (c: number[]) => c.findIndex((x, i) => i > 0 && x >= 0);
  const { cum, minH } = useMemo(() => { const cum = sim(n); let minH: number | null = null; for (let k = 1; k <= 1500; k++) { const i = pay(sim(k)); if (i > 0 && i <= hor) { minH = k; break; } } return { cum, minH }; }, [p]);
  const pb = pay(cum), be = mg > 0 ? Math.ceil(fijo / mg) : null, steady = n * mg - fijo;
  const bueno = pb > 0 && pb <= hor && steady > 0, medio = pb > hor && steady > 0, vc = bueno ? "ok" : medio ? "warn" : "bad";
  const inv: [string, number, string][] = [["Infraestructura (troncal, OLT, NAP, ferretería)", infra, "var(--lil)"], ["Equipos y materiales por cliente", (v("ont") + v("mat")) * n, "var(--acc)"], ["Viajes de instalación", viajesT, "var(--warn)"]];
  const it = inv.reduce((a, x) => a + x[1], 0) || 1, sc = Math.max(v("meta"), minH || 0, be || 0) * 1.15 || 1;
  const [yy, mm] = String(p.inicio).split("-").map(Number), fd = (k: number) => new Date(yy, mm - 1 + k, 1).toLocaleDateString("es-BO", { month: "long", year: "numeric" });
  const fRec = pb > 0 ? fd(pb) : null, fMeta = fd(Math.round(R));

  const Num = (l: string, k: string, u?: string) => <label key={k} className="num"><span>{l}</span><span className="fila" style={{ gap: 4, flexWrap: "nowrap" }}><input type="number" value={p[k]} onChange={set(k)} />{u && <small>{u}</small>}</span></label>;
  const Tot = (l: string, v: string) => <div key={l} className="tot"><span>{l}</span><span>{v}</span></div>;

  const guardar = async () => {
    setMsg(""); setOk(""); if (!pid) return setMsg("Crea primero una zona (menú Zonas) para poder guardar escenarios."); if (!nom.trim()) return setMsg("Escribe un nombre para el escenario.");
    const { error } = await supabase.from("simulaciones").insert({ proyecto_id: pid, zona_id: zonaGuia || null, nombre: nom.trim(), datos: { p, n, it, steady, pb, fRec } });
    if (error) return setMsg(error.message); setNom(""); setOk("Escenario guardado."); guardados.recargar();
  };
  const abrir = (x: any) => { setP({ ...inicial(), ...(x.datos?.p || {}) }); setMsg(""); setOk(`Abriste "${x.nombre}".`); };
  const quitar = async (x: any) => { if (!confirm(`¿Mandar el escenario "${x.nombre}" a la papelera? Podrás recuperarlo desde el menú Papelera.`)) return; try { await aPapelera("simulaciones", [x.id]); guardados.recargar(); } catch (e: any) { setMsg(e.message); } };

  const comoGuia = async () => {
    setMsg(""); setOk(""); const zona = zonas.find(z => z.id === zonaGuia); if (!zona) return setMsg("Elige la zona donde quieres guardar esta guía.");
    if (!confirm(`Se cargarán estas cifras como la guía de presupuesto de la zona "${zona.nombre}". Si ya cargaste una guía antes, la anterior se manda a la papelera y se reemplaza. ¿Continuar?`)) return;
    setOcup(true);
    try {
      const base = { proyecto_id: zona.proyecto_id, zona_id: zona.id, origen: "Guía del simulador" }, L = (categoria: string, concepto: string, cantidad: number, monto_unitario: number, tipo = "INVERSION", periodo = "unico") => ({ ...base, tipo, categoria, concepto, cantidad, monto_unitario, periodo });
      const lineas = [
        L("Troncal", "Fibra de 4 hilos", 1, v("tf")), L("Troncal", "PON", 1, v("tp")), L("Troncal", "Drop", 1, v("td")), L("Troncal", "Otro de la troncal", 1, v("to")),
        L("Equipos", "Starlink", 1, v("es")), L("Equipos", "OLT", 1, v("eo")), L("Equipos", "Mikrotik", 1, v("em")), L("Equipos", "Otro equipo", 1, v("ex")),
        L("NAP", "NAP", v("naps"), v("napc")), L("Ferretería", "Postes y ferretería", 1, v("ferr")),
        L("Equipos por cliente", `Equipo (ONT) para ${n} clientes`, n, v("ont")), L("Materiales por cliente", `Materiales para ${n} clientes`, n, v("mat")),
        L("Viajes de instalación", `${v("viajes")} viajes de ${v("pers")} personas × ${dF} días`, v("viajes"), viajeC),
        L("Starlink / backhaul", "Starlink / backhaul", 1, v("starlink"), "GASTO_OPERATIVO", "mensual"), L("Otros fijos", "Otros fijos (cobranza, energía)", 1, v("fijos"), "GASTO_OPERATIVO", "mensual"), L("Costo variable", `Costo variable por cliente (${n} clientes)`, n, v("vari"), "GASTO_OPERATIVO", "mensual"),
      ].filter(l => l.cantidad > 0 && l.monto_unitario > 0);
      const viejas = await supabase.from("presupuesto_lineas").select("id").eq("zona_id", zona.id).eq("origen", base.origen); if (viejas.error) throw new Error(viejas.error.message);
      const ins = await supabase.from("presupuesto_lineas").insert(lineas); if (ins.error) throw new Error(ins.error.message);
      const ids = (viejas.data || []).map((x: any) => x.id); if (ids.length) await aPapelera("presupuesto_lineas", ids, "Reemplazada por una guía nueva del simulador");
      setOk(`Listo: ${lineas.length} líneas cargadas como guía de ${zona.nombre}. Compárala con lo real en Presupuesto de la zona y Presupuesto vs real.`);
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };

  return <>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="sim-grid">
      <div className="sim-col">
        <div className="card"><h2>Infraestructura</h2><b>Troncal</b>{Num("Fibra de 4 hilos", "tf", "Bs")}{Num("PON", "tp", "Bs")}{Num("Drop", "td", "Bs")}{Num("Otro de la troncal", "to", "Bs")}{Tot("Total troncal", bs(trT))}
          <b style={{ display: "block", marginTop: 10 }}>Equipos</b>{Num("Starlink", "es", "Bs")}{Num("OLT", "eo", "Bs")}{Num("Mikrotik", "em", "Bs")}{Num("Otro equipo", "ex", "Bs")}{Tot("Total equipos", bs(eqT))}
          <b style={{ display: "block", marginTop: 10 }}>NAP, postes y ferretería</b>{Num("Cantidad de NAP", "naps")}{Num("Costo por NAP", "napc", "Bs")}{Num("Postes y ferretería", "ferr", "Bs")}{Tot("Total infraestructura", bs(infra))}</div>
        <div className="card"><h2>Clientes y precios</h2>{Num("Equipo por cliente (ONT)", "ont", "Bs")}{Num("Materiales por cliente", "mat", "Bs")}{Num("Meta de clientes", "meta")}{Num("Cumplimiento de la meta", "cump", "%")}
          <label className="num"><span>Plazo para llegar a la meta</span><span className="fila" style={{ gap: 4, flexWrap: "nowrap" }}><input type="number" value={p.plazo} onChange={set("plazo")} /><select value={p.unidad} onChange={set("unidad")}><option>meses</option><option>semanas</option></select></span></label>
          {Num("Plan básico (todos lo contratan)", "basico", "Bs/mes")}{Num("Precio de instalación", "inst", "Bs")}{Tot(`Equipos y materiales (${n} clientes)`, bs((v("ont") + v("mat")) * n))}{Tot("Ingreso por instalaciones", bs(v("inst") * n))}</div>
        <div className="card"><h2>Viajes de instalación</h2>{Num("Cantidad de viajes", "viajes")}{Num("Personas por viaje", "pers")}
          <label className="num"><span>Duración de cada viaje</span><span className="fila" style={{ gap: 4, flexWrap: "nowrap" }}><input type="number" value={p.dias} onChange={set("dias")} /><select value={p.ud} onChange={set("ud")}><option>días</option><option>semanas</option><option>meses</option></select></span></label>
          {Array.from({ length: Math.min(10, v("pers")) }, (_, i) => <label key={i} className="num"><span>Pago del instalador {i + 1} por día</span><span className="fila" style={{ gap: 4, flexWrap: "nowrap" }}><input type="number" value={(p.pagos || [])[i] ?? p.pago} onChange={e => { const a = [...(p.pagos || [])]; a[i] = e.target.value; setP({ ...p, pagos: a }); }} /><small>Bs</small></span></label>)}
          {Num("Viáticos por persona y día", "viat", "Bs")}{Num("Gasolina por viaje", "gas", "Bs")}{Num("Pago de movilidad por viaje", "mov", "Bs")}{Tot(`Total de viajes (${v("viajes")} × ${bs(viajeC)})`, bs(viajesT))}</div>
        <div className="card"><h2>Gastos mensuales</h2>{Num("Starlink / backhaul", "starlink", "Bs/mes")}{Num("Otros fijos (cobranza, energía)", "fijos", "Bs/mes")}{Num("Costo variable por cliente", "vari", "Bs/mes")}
          <label className="num"><span>Inicio del proyecto</span><input type="date" style={{ width: 140 }} value={p.inicio} onChange={set("inicio")} /></label>{Num("Recuperar capital en", "hor", "meses")}{Tot(`Gastos mensuales con ${n} clientes`, bs(fijo + v("vari") * n))}</div>
      </div>

      <div className="sim-col">
        <div className="verdict" style={{ background: `var(--${vc}b)`, color: `var(--${vc})` }}>{bueno ? `Proyecto rentable: recupera el capital dentro de ${hor} meses` : medio ? `Rentable, pero recupera el capital después de ${hor} meses` : "No rentable con estos supuestos"}</div>
        <div className="recov"><span>Recuperación del capital</span><b>{pb > 0 ? `Mes ${pb} · ${fRec}` : "No se recupera en 5 años"}</b><small>{pb > 0 ? `Se recupera ${pb <= hor ? "dentro" : "después"} de tu plazo de ${hor} meses. ` : "Aumenta clientes, precio o plazo. "}La meta de {n} clientes se alcanza en {fMeta}.</small></div>
        <div className="grid gk" style={{ gap: 12 }}>
          <div className="card kpi" style={{ margin: 0 }}><span>Inversión total</span><b>{bs(it)}</b></div><div className="card kpi" style={{ margin: 0 }}><span>Ganancia líquida mensual</span><b>{bs(steady)}</b></div><div className="card kpi" style={{ margin: 0 }}><span>Capital recuperado en</span><b>{pb > 0 ? pb + " meses" : "más de 60"}</b></div>
          <div className="card kpi" style={{ margin: 0 }}><span>Clientes mínimos (equilibrio)</span><b>{be ?? "—"}</b></div><div className="card kpi" style={{ margin: 0 }}><span>Mínimo para recuperar en {hor} m</span><b>{minH ?? "—"}</b></div><div className="card kpi" style={{ margin: 0 }}><span>Ganancia a {hor} meses</span><b style={{ color: cum[hor] >= 0 ? "var(--ok)" : "var(--bad)" }}>{bs(cum[hor])}</b></div></div>
        <div className="card"><h2>Flujo de caja acumulado</h2><Linea etiquetas={Array.from({ length: 37 }, (_, i) => i + "m")} series={[{ nombre: "Caja", color: "var(--lil)", datos: cum.slice(0, 37) }]} marcas={[...(pb > 0 && pb <= 36 ? [{ i: pb, etiqueta: "Recuperado", color: "var(--ok)" }] : []), ...(Math.round(R) <= 36 ? [{ i: Math.max(1, Math.round(R)), etiqueta: "Meta", color: "var(--acc)" }] : [])]} /></div>
        <div className="card"><h2>En qué se va la inversión</h2><div className="bar" style={{ height: 18 }}>{inv.map(x => <i key={x[0]} style={{ width: (x[1] / it) * 100 + "%", background: x[2] }} />)}</div>{inv.map(x => <div key={x[0]} className="fila" style={{ justifyContent: "space-between", padding: "3px 0" }}><span><span style={{ color: x[2] }}>■</span> {x[0]}</span><b>{bs(x[1])}</b></div>)}</div>
        <div className="card"><h2>Meta contra mínimos</h2><div style={{ position: "relative", height: 54 }}><div className="bar" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 16 }}><i style={{ width: (n / sc) * 100 + "%", background: "var(--lil)" }} /></div>
          {([[be, "Equilibrio", "var(--warn)"], [minH, `Recupera en ${hor}m`, "var(--ok)"]] as [number | null, string, string][]).map(([x, l, c], i) => x ? <div key={l} style={{ position: "absolute", left: (x / sc) * 100 + "%", top: 0, height: 22, borderLeft: "2px solid " + c }}><small style={{ position: "absolute", top: 24 + i * 14, left: 3, whiteSpace: "nowrap", color: c }}>{l}: {x}</small></div> : null)}</div>
          <p className="mute" style={{ margin: "6px 0 0" }}>Meta realista: <b>{n}</b> clientes. Todos con plan básico y pagando instalación.</p></div>
        <div className="card"><h2>Plan de campo</h2><dl className="dl"><dt>Costo por viaje</dt><dd>{bs(viajeC)} ({v("pers")} personas × {dF} días)</dd><dt>Costo de todos los viajes</dt><dd>{bs(viajesT)}</dd><dt>Instalaciones por viaje</dt><dd>{v("viajes") ? Math.round(n / v("viajes")) : "—"}</dd><dt>Instalaciones por semana</dt><dd>{(n / (R * 4.33)).toFixed(1)}</dd><dt>Días-persona en campo</dt><dd>{v("viajes") * v("pers") * dF}</dd><dt>Viaje por instalación</dt><dd>{n ? bs(viajesT / n) : "—"}</dd></dl></div>
        <div className="card"><h2>Guardar como guía de una zona</h2>
          <select style={{ width: "100%" }} value={zonaGuia} onChange={e => setZonaGuia(e.target.value)}><option value="">Elige una zona existente…</option>{zonas.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}</select>
          <button className="btn" style={{ width: "100%", marginTop: 8 }} disabled={ocup} onClick={comoGuia}>{ocup ? "Guardando…" : "Guardar simulación como guía"}</button>
          <p className="mute" style={{ margin: "8px 0 0" }}>Esta guía es lo que pensabas gastar y cuándo recuperar. Se compara con el gasto real en Presupuesto de la zona y en Presupuesto vs real.</p></div>
        <div className="card"><h2>Escenarios guardados</h2><div className="fila"><input placeholder="Nombre (ej. Zona Norte, plan agresivo)" value={nom} onChange={e => setNom(e.target.value)} style={{ flex: "1 1 160px" }} /><button className="btn" onClick={guardar}>Guardar</button></div>
          {((guardados.data as any[]) || []).length ? <div className="tw" style={{ marginTop: 10 }}><table style={{ minWidth: 0 }}><thead><tr><th>Escenario</th><th>Clientes</th><th>Inversión</th><th>Ganancia mensual</th><th>Recuperación</th><th /></tr></thead>
            <tbody>{((guardados.data as any[]) || []).map(x => { const d = x.datos || {}; return <tr key={x.id}><td>{x.nombre}</td><td>{d.n ?? "—"}</td><td>{d.it != null ? bs(d.it) : "—"}</td><td>{d.steady != null ? bs(d.steady) : "—"}</td><td>{d.pb > 0 ? `${d.pb} meses (${d.fRec})` : "más de 60"}</td>
              <td><div className="fila"><button className="btn suave chico" onClick={() => abrir(x)}>Abrir</button><button className="btn suave chico" onClick={() => quitar(x)}>Quitar</button></div></td></tr>; })}</tbody></table></div> : <Vacio>Aún no guardaste escenarios.</Vacio>}</div>
      </div>
    </div>
  </>;
}
