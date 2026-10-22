import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Kpi, Vacio, bs, hoy, sumar, useProyecto, useQuery } from "../lib/ui";
import Crud from "../lib/crud";

const n = (x: any) => Number(x) || 0;
const DIAS_POR_UNIDAD: Record<string, number> = { dias: 1, semanas: 6, meses: 26 }; // días de trabajo
const norm = (s: any) => String(s || "").trim().toLowerCase();

type Fila = { id: number; categoria: string; concepto: string; cant: any; unit: any; porCliente: boolean };
type Gasto = { id: number; concepto: string; monto: any };
type Sim = {
  nombre: string; clientes: any; precio: any; altasMes: any; morosidad: any;
  filas: Fila[]; instaladores: any; pagoDia: any; duracion: any; unidad: string; gastos: Gasto[];
};

// Valores de ejemplo: cámbialos por tus costos reales.
const simInicial = (): Sim => ({
  nombre: "", clientes: 100, precio: 150, altasMes: 10, morosidad: 5,
  filas: [
    { id: 1, categoria: "Fibra", concepto: "Fibra troncal (metros)", cant: 3000, unit: 3, porCliente: false },
    { id: 2, categoria: "Fibra", concepto: "Fibra drop (metros por cliente)", cant: 80, unit: 1.2, porCliente: true },
    { id: 3, categoria: "OLT y PON", concepto: "OLT", cant: 1, unit: 9000, porCliente: false },
    { id: 4, categoria: "OLT y PON", concepto: "Módulos PON", cant: 2, unit: 1500, porCliente: false },
    { id: 5, categoria: "Router de borde", concepto: "Mikrotik", cant: 1, unit: 2500, porCliente: false },
    { id: 6, categoria: "Internet", concepto: "Equipo Starlink", cant: 1, unit: 3500, porCliente: false },
    { id: 7, categoria: "Red de distribución", concepto: "Splitters y NAP", cant: 10, unit: 250, porCliente: false },
    { id: 8, categoria: "Equipos de cliente", concepto: "ONU / router por cliente", cant: 1, unit: 250, porCliente: true },
    { id: 9, categoria: "Ferretería", concepto: "Postes y ferretería", cant: 1, unit: 3000, porCliente: false },
  ],
  instaladores: 2, pagoDia: 150, duracion: 2, unidad: "semanas",
  gastos: [
    { id: 1, concepto: "Internet mayorista / Starlink mensual", monto: 500 },
    { id: 2, concepto: "Energía", monto: 300 },
    { id: 3, concepto: "Soporte y mantenimiento", monto: 800 },
  ],
});

/** Todo el cálculo del simulador. Devuelve inversión, gastos, ingresos y la curva de caja mes a mes. */
function calcular(s: Sim) {
  const N = n(s.clientes);
  const lineas = s.filas.map(f => { const qty = n(f.cant) * (f.porCliente ? N : 1); return { ...f, qty, total: qty * n(f.unit) }; });
  const dias = n(s.duracion) * (DIAS_POR_UNIDAD[s.unidad] || 1);
  const mano = n(s.instaladores) * n(s.pagoDia) * dias;
  const infra = lineas.reduce((a, l) => a + l.total, 0);
  const inversion = infra + mano;
  const gastoMes = sumar(s.gastos, "monto");
  const factor = 1 - Math.min(100, Math.max(0, n(s.morosidad))) / 100;
  const ingresoRegimen = N * n(s.precio) * factor;
  const altas = n(s.altasMes);
  const curva: number[] = []; let acum = -inversion, recup: number | null = null;
  for (let m = 1; m <= 60; m++) {
    const c = altas > 0 ? Math.min(N, altas * m) : N;
    acum += c * n(s.precio) * factor - gastoMes;
    curva.push(acum);
    if (recup === null && acum >= 0) recup = m;
  }
  const porCategoria: Record<string, number> = {};
  lineas.forEach(l => { const k = l.categoria.trim() || "Sin categoría"; porCategoria[k] = (porCategoria[k] || 0) + l.total; });
  if (mano > 0) porCategoria["Mano de obra"] = (porCategoria["Mano de obra"] || 0) + mano;
  return { N, lineas, dias, mano, infra, inversion, gastoMes, ingresoRegimen, utilidad: ingresoRegimen - gastoMes, curva, recup, porCategoria, mesesLlegar: altas > 0 ? Math.ceil(N / altas) : 1 };
}

function Curva({ pts }: { pts: number[] }) {
  const P = pts.slice(0, 36), mx = Math.max(0, ...P), mn = Math.min(0, ...P), W = 720, H = 230, pad = 28, rng = mx - mn || 1;
  const y = (v: number) => pad + ((mx - v) / rng) * (H - 2 * pad), bw = (W - 2 * pad) / P.length;
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Dinero acumulado mes a mes">
    <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="var(--line)" />
    {P.map((v, i) => <rect key={i} x={pad + i * bw + 1} width={Math.max(1, bw - 2)} y={Math.min(y(v), y(0))} height={Math.abs(y(v) - y(0))} fill={v >= 0 ? "var(--ok)" : "var(--bad)"} opacity={0.85}><title>{"Mes " + (i + 1) + ": " + bs(v)}</title></rect>)}
    <text x={pad} y={12} fontSize="11" fill="var(--mute)">{bs(mx)}</text>
    <text x={pad} y={H - 4} fontSize="11" fill="var(--mute)">{bs(mn)}</text>
    <text x={W - pad} y={H - 4} fontSize="11" fill="var(--mute)" textAnchor="end">Mes {P.length}</text>
  </svg>;
}

const Num = ({ v, set, paso, ancho }: { v: any; set: (x: string) => void; paso?: number; ancho?: number }) =>
  <input type="number" min={0} step={paso || 1} value={v} style={ancho ? { width: ancho } : undefined} onChange={e => set(e.target.value)} />;

/* ================================ SIMULADOR ================================ */
export function Simulador() {
  const { zonas, zonaId } = useApp(), pidUnico = useProyecto();
  const [s, setS] = useState<Sim>(simInicial()), [cargado, setCargado] = useState<{ id: string; proyecto_id: string } | null>(null);
  const [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false);
  const zona = zonas.find(z => z.id === zonaId), pid = cargado?.proyecto_id || zona?.proyecto_id || pidUnico;
  const guardadas = useQuery(() => supabase.from("simulaciones").select("*").order("creado_en", { ascending: false }).limit(100), [pid]);
  const r = calcular(s), up = (k: keyof Sim, v: any) => setS({ ...s, [k]: v });
  const upFila = (id: number, k: keyof Fila, v: any) => setS({ ...s, filas: s.filas.map(f => f.id === id ? { ...f, [k]: v } : f) });
  const upGasto = (id: number, k: keyof Gasto, v: any) => setS({ ...s, gastos: s.gastos.map(g => g.id === id ? { ...g, [k]: v } : g) });
  const nuevoId = (a: { id: number }[]) => Math.max(0, ...a.map(x => x.id)) + 1;

  const guardar = async () => {
    setMsg(""); setOk(""); setOcup(true);
    try {
      if (!s.nombre.trim()) throw new Error("Escribe un nombre para la simulación.");
      if (!pid) throw new Error("Primero crea una zona en el menú Zonas.");
      if (cargado) {
        const { error } = await supabase.from("simulaciones").update({ nombre: s.nombre, datos: s, zona_id: zonaId || null }).eq("id", cargado.id);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await supabase.from("simulaciones").insert({ proyecto_id: pid, zona_id: zonaId || null, nombre: s.nombre, datos: s }).select("id, proyecto_id").single();
        if (error) throw new Error(error.message);
        setCargado(data as any);
      }
      setOk("Simulación guardada."); guardadas.recargar();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };

  const aPresupuesto = async () => {
    setMsg(""); setOk(""); setOcup(true);
    try {
      if (!zona) throw new Error("Elige la zona arriba: el presupuesto se guarda dentro de una zona.");
      if (!s.nombre.trim()) throw new Error("Escribe un nombre para la simulación; sirve para reconocer estas líneas en el presupuesto.");
      if (!confirm(`Se cargarán estas cifras como presupuesto de la zona "${zona.nombre}". Si ya cargaste esta misma simulación antes, esas líneas se reemplazan. ¿Continuar?`)) { setOcup(false); return; }
      const base = { proyecto_id: zona.proyecto_id, zona_id: zona.id, origen: s.nombre.trim() };
      const lineas: any[] = [
        ...r.lineas.filter(l => l.total > 0).map(l => ({ ...base, tipo: "INVERSION", categoria: l.categoria.trim() || "Sin categoría", concepto: l.concepto + (l.porCliente ? ` (${r.N} clientes)` : ""), cantidad: l.qty, monto_unitario: n(l.unit), periodo: "unico" })),
        ...(r.mano > 0 ? [{ ...base, tipo: "INVERSION", categoria: "Mano de obra", concepto: `${n(s.instaladores)} instaladores × ${r.dias} días`, cantidad: n(s.instaladores) * r.dias, monto_unitario: n(s.pagoDia), periodo: "unico" }] : []),
        ...s.gastos.filter(g => n(g.monto) > 0).map(g => ({ ...base, tipo: "GASTO_OPERATIVO", categoria: g.concepto.trim() || "Sin categoría", concepto: g.concepto, cantidad: 1, monto_unitario: n(g.monto), periodo: "mensual" })),
      ];
      if (!lineas.length) throw new Error("No hay cifras para cargar.");
      const viejas = await supabase.from("presupuesto_lineas").select("id").eq("zona_id", zona.id).eq("origen", base.origen);
      if (viejas.error) throw new Error(viejas.error.message);
      const ins = await supabase.from("presupuesto_lineas").insert(lineas);
      if (ins.error) throw new Error(ins.error.message);
      const ids = (viejas.data || []).map((x: any) => x.id);
      if (ids.length) { const del = await supabase.from("presupuesto_lineas").delete().in("id", ids); if (del.error) throw new Error(del.error.message); }
      setOk(`Listo: ${lineas.length} líneas cargadas al presupuesto de ${zona.nombre}. Míralas en la pestaña "Presupuesto".`);
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };

  const abrir = (x: any) => { setS({ ...simInicial(), ...x.datos, nombre: x.nombre }); setCargado({ id: x.id, proyecto_id: x.proyecto_id }); setMsg(""); setOk(""); };
  const quitar = async (x: any) => { if (!confirm(`¿Quitar la simulación "${x.nombre}"?`)) return; const { error } = await supabase.from("simulaciones").delete().eq("id", x.id); if (error) setMsg(error.message); else { if (cargado?.id === x.id) setCargado(null); guardadas.recargar(); } };
  const lista: any[] = ((guardadas.data as any[]) || []).filter(x => !pidUnico && !zona ? true : x.proyecto_id === pid);

  return <>
    <Aviso>Prueba números <b>antes de invertir</b>: cuánto cuesta armar una red, cuánto ganarías y en qué mes recuperas lo invertido. Los valores que ves son <b>ejemplos</b>; cámbialos por tus costos reales. Nada se guarda hasta que pulses "Guardar simulación".</Aviso>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="grid gk" style={{ marginBottom: 14 }}>
      <Kpi t="Inversión total" v={bs(r.inversion)} s={r.N ? bs(r.inversion / r.N) + " por cliente" : undefined} />
      <Kpi t="Ingreso mensual a régimen" v={bs(r.ingresoRegimen)} s={`con ${r.N} clientes y ${n(s.morosidad)}% de morosidad`} />
      <Kpi t="Gasto mensual" v={bs(r.gastoMes)} />
      <Kpi t="Utilidad mensual a régimen" v={bs(r.utilidad)} c={r.utilidad >= 0 ? "var(--ok)" : "var(--bad)"} />
      <Kpi t="Recuperas la inversión en" v={r.recup ? "Mes " + r.recup : "Más de 60 meses"} c={r.recup ? "var(--ok)" : "var(--bad)"} s={`llegas a ${r.N} clientes en ${r.mesesLlegar} meses`} />
    </div>

    <div className="grid g2">
      <div className="card"><h2>Clientes e ingresos</h2><div className="form">
        <Campo l="Nombre de la simulación"><input value={s.nombre} placeholder="Ej: Zona Norte, 100 clientes" onChange={e => up("nombre", e.target.value)} /></Campo>
        <Campo l="Clientes que quieres conectar"><Num v={s.clientes} set={v => up("clientes", v)} /></Campo>
        <Campo l="Precio promedio por cliente (Bs/mes)"><Num v={s.precio} set={v => up("precio", v)} /></Campo>
        <Campo l="Clientes nuevos por mes (0 = todos desde el mes 1)"><Num v={s.altasMes} set={v => up("altasMes", v)} /></Campo>
        <Campo l="Clientes que no pagan (%)"><Num v={s.morosidad} set={v => up("morosidad", v)} /></Campo>
      </div></div>
      <div className="card"><h2>Mano de obra de instalación</h2><div className="form">
        <Campo l="Instaladores"><Num v={s.instaladores} set={v => up("instaladores", v)} /></Campo>
        <Campo l="Pago por instalador por día (Bs)"><Num v={s.pagoDia} set={v => up("pagoDia", v)} /></Campo>
        <Campo l="Duración de la obra"><Num v={s.duracion} set={v => up("duracion", v)} /></Campo>
        <Campo l="Unidad"><select value={s.unidad} onChange={e => up("unidad", e.target.value)}><option value="dias">días</option><option value="semanas">semanas (6 días de trabajo)</option><option value="meses">meses (26 días de trabajo)</option></select></Campo>
      </div><p className="mute">Son {r.dias} días de trabajo → <b>{bs(r.mano)}</b> en mano de obra.</p></div>
    </div>

    <div className="card tw"><h2>Infraestructura (inversión)</h2>
      <table><thead><tr><th>Categoría</th><th>Concepto</th><th>Cantidad</th><th>Costo unitario (Bs)</th><th title="Si lo marcas, la cantidad se multiplica por el número de clientes">Por cliente</th><th>Total</th><th /></tr></thead>
        <tbody>{s.filas.map((f, i) => <tr key={f.id}>
          <td><input value={f.categoria} style={{ width: 130 }} onChange={e => upFila(f.id, "categoria", e.target.value)} /></td>
          <td><input value={f.concepto} style={{ width: 230 }} onChange={e => upFila(f.id, "concepto", e.target.value)} /></td>
          <td><Num v={f.cant} ancho={90} set={v => upFila(f.id, "cant", v)} /></td>
          <td><Num v={f.unit} ancho={100} paso={0.1} set={v => upFila(f.id, "unit", v)} /></td>
          <td><input type="checkbox" checked={f.porCliente} onChange={e => upFila(f.id, "porCliente", e.target.checked)} /></td>
          <td><b>{bs(r.lineas[i].total)}</b></td>
          <td><button className="btn suave chico" onClick={() => setS({ ...s, filas: s.filas.filter(x => x.id !== f.id) })}>Quitar</button></td></tr>)}</tbody></table>
      <div className="fila" style={{ marginTop: 8 }}><button className="btn suave" onClick={() => setS({ ...s, filas: [...s.filas, { id: nuevoId(s.filas), categoria: "", concepto: "", cant: 1, unit: 0, porCliente: false }] })}>+ Agregar línea</button><span className="mute">Infraestructura: <b>{bs(r.infra)}</b></span></div>
    </div>

    <div className="card tw"><h2>Gastos mensuales de operación</h2>
      <table><thead><tr><th>Concepto</th><th>Monto por mes (Bs)</th><th /></tr></thead>
        <tbody>{s.gastos.map(g => <tr key={g.id}>
          <td><input value={g.concepto} style={{ width: 300 }} onChange={e => upGasto(g.id, "concepto", e.target.value)} /></td>
          <td><Num v={g.monto} ancho={120} set={v => upGasto(g.id, "monto", v)} /></td>
          <td><button className="btn suave chico" onClick={() => setS({ ...s, gastos: s.gastos.filter(x => x.id !== g.id) })}>Quitar</button></td></tr>)}</tbody></table>
      <button className="btn suave" style={{ marginTop: 8 }} onClick={() => setS({ ...s, gastos: [...s.gastos, { id: nuevoId(s.gastos), concepto: "", monto: 0 }] })}>+ Agregar gasto</button>
    </div>

    <div className="grid g2">
      <div className="card"><h2>¿Dónde se va la inversión?</h2>
        <table><thead><tr><th>Categoría</th><th>Monto</th><th>%</th></tr></thead><tbody>{Object.entries(r.porCategoria).sort((a, b) => b[1] - a[1]).map(([k, v]) => <tr key={k}><td>{k}</td><td>{bs(v)}</td><td>{r.inversion ? Math.round((v / r.inversion) * 100) : 0}%</td></tr>)}</tbody>
          <tfoot><tr><td><b>Total</b></td><td><b>{bs(r.inversion)}</b></td><td /></tr></tfoot></table></div>
      <div className="card"><h2>Dinero acumulado mes a mes</h2><Curva pts={r.curva} />
        <p className="mute">Empieza en negativo (lo que invertiste) y sube cada mes con la utilidad. Las barras verdes indican que ya recuperaste la inversión.</p></div>
    </div>

    <div className="card"><div className="fila">
      <button className="btn" disabled={ocup} onClick={guardar}>{cargado ? "Actualizar simulación guardada" : "Guardar simulación"}</button>
      <button className="btn mor" disabled={ocup} onClick={aPresupuesto}>Usar como presupuesto de la zona elegida</button>
      <button className="btn suave" onClick={() => { setS(simInicial()); setCargado(null); setMsg(""); setOk(""); }}>Empezar una nueva</button>
    </div>
      <p className="mute">{zona ? <>Zona elegida arriba: <b>{zona.nombre}</b>.</> : "Para usarla como presupuesto, elige primero una zona arriba."}</p></div>

    <div className="card tw"><h2>Simulaciones guardadas</h2>{guardadas.loading ? <Cargando /> : lista.length ? <table><thead><tr><th>Nombre</th><th>Fecha</th><th>Inversión</th><th>Recuperación</th><th /></tr></thead>
      <tbody>{lista.map(x => { const c = calcular({ ...simInicial(), ...x.datos }); return <tr key={x.id}><td>{x.nombre}{cargado?.id === x.id && <span className="tag" style={{ marginLeft: 6 }}>abierta</span>}</td><td>{String(x.creado_en).slice(0, 10)}</td><td>{bs(c.inversion)}</td><td>{c.recup ? "Mes " + c.recup : "Más de 60 meses"}</td>
        <td><div className="fila"><button className="btn suave chico" onClick={() => abrir(x)}>Abrir</button><button className="btn suave chico" onClick={() => quitar(x)}>Quitar</button></div></td></tr>; })}</tbody></table> : <Vacio>Aún no guardaste simulaciones.</Vacio>}</div>
  </>;
}

/* ================================ PRESUPUESTO ================================ */
export function Presupuesto() {
  const { zonaId, zonas } = useApp(), zona = zonas.find(z => z.id === zonaId);
  if (!zona) return <Aviso>Elige una <b>zona</b> arriba para ver o armar su presupuesto.</Aviso>;
  return <>
    <Aviso>Presupuesto de <b>{zona.nombre}</b>. Puedes cargarlo desde el Simulador o agregar líneas a mano. Los gastos <b>mensuales</b> se multiplican por los meses transcurridos desde que empezó la zona.</Aviso>
    <Crud titulo="Líneas del presupuesto" tabla="presupuesto_lineas" conZona orden="creado_en"
      campos={[
        { k: "tipo", l: "Tipo", t: "select", opts: ["INVERSION", "GASTO_OPERATIVO"], req: true },
        { k: "categoria", l: "Categoría (igual que en Ingresos y gastos)", req: true },
        { k: "concepto", l: "Concepto", req: true },
        { k: "cantidad", l: "Cantidad", t: "number", def: 1, req: true },
        { k: "monto_unitario", l: "Monto unitario (Bs)", t: "number", req: true },
        { k: "periodo", l: "Se paga", t: "select", opts: ["unico", "mensual"], def: "unico", req: true },
      ]}
      columnas={["tipo", "categoria", "concepto", "cantidad", "monto_unitario", "periodo", "origen"]}
      extra={f => <b>{bs(n(f.cantidad) * n(f.monto_unitario))}</b>}
      tfoot={f => <div className="fila">
        <span className="tag">Inversión: {bs(f.filter(x => x.tipo === "INVERSION").reduce((a, x) => a + n(x.cantidad) * n(x.monto_unitario), 0))}</span>
        <span className="tag">Gasto operativo por mes: {bs(f.filter(x => x.tipo === "GASTO_OPERATIVO" && x.periodo === "mensual").reduce((a, x) => a + n(x.cantidad) * n(x.monto_unitario), 0))}</span>
      </div>} />
  </>;
}

/* ================================ PRESUPUESTO CONTRA REAL ================================ */
export function PresupuestoVsReal() {
  const { zonaId, zonas } = useApp(), zona = zonas.find(z => z.id === zonaId);
  const pre = useQuery(() => zonaId ? supabase.from("presupuesto_lineas").select("*").eq("zona_id", zonaId) : Promise.resolve({ data: [], error: null }), [zonaId]);
  const real = useQuery(() => zonaId ? supabase.from("fin_movimientos").select("tipo, categoria, monto").eq("zona_id", zonaId).in("tipo", ["INVERSION", "GASTO_OPERATIVO"]).limit(5000) : Promise.resolve({ data: [], error: null }), [zonaId]);
  if (!zona) return <Aviso>Elige una <b>zona</b> arriba para comparar su presupuesto con lo que realmente se gastó.</Aviso>;
  if (pre.loading || real.loading) return <Cargando />;
  if (pre.error || real.error) return <Aviso tipo="mal">{pre.error || real.error}</Aviso>;
  const ini = String(zona.fecha_inicio || hoy()), hoyD = hoy();
  const meses = Math.max(1, (+hoyD.slice(0, 4) - +ini.slice(0, 4)) * 12 + (+hoyD.slice(5, 7) - +ini.slice(5, 7)) + 1);
  const P: any[] = (pre.data as any[]) || [], R: any[] = (real.data as any[]) || [];

  const bloque = (tipo: string, titulo: string) => {
    const filas: Record<string, { nombre: string; presu: number; real: number }> = {};
    const f = (c: any) => { const k = norm(c) || "sin categoría"; return filas[k] || (filas[k] = { nombre: String(c || "").trim() || "Sin categoría", presu: 0, real: 0 }); };
    P.filter(x => x.tipo === tipo).forEach(x => { f(x.categoria).presu += n(x.cantidad) * n(x.monto_unitario) * (x.periodo === "mensual" ? meses : 1); });
    R.filter(x => x.tipo === tipo).forEach(x => { f(x.categoria).real += n(x.monto); });
    const L = Object.values(filas).sort((a, b) => b.presu - a.presu), tp = L.reduce((a, x) => a + x.presu, 0), tr = L.reduce((a, x) => a + x.real, 0);
    const color = (p: number, r: number) => r > p ? "var(--bad)" : "var(--ok)";
    return <div className="card tw"><h2>{titulo}</h2>{L.length ? <table><thead><tr><th>Categoría</th><th>Presupuestado</th><th>Real</th><th>Diferencia</th><th>Usado</th></tr></thead>
      <tbody>{L.map(x => <tr key={x.nombre}><td>{x.nombre}{x.presu === 0 && <span className="tag" style={{ marginLeft: 6 }}>sin presupuestar</span>}</td><td>{bs(x.presu)}</td><td>{bs(x.real)}</td>
        <td style={{ color: color(x.presu, x.real) }}><b>{bs(x.presu - x.real)}</b></td><td>{x.presu ? Math.round((x.real / x.presu) * 100) + "%" : "—"}</td></tr>)}</tbody>
      <tfoot><tr><td><b>Total</b></td><td><b>{bs(tp)}</b></td><td><b>{bs(tr)}</b></td><td style={{ color: color(tp, tr) }}><b>{bs(tp - tr)}</b></td><td>{tp ? Math.round((tr / tp) * 100) + "%" : "—"}</td></tr></tfoot></table> : <Vacio>Sin datos.</Vacio>}</div>;
  };

  return <>
    <Aviso>Compara lo que <b>presupuestaste</b> con lo que <b>realmente registraste</b> en Ingresos y gastos, solo para <b>{zona.nombre}</b> ({meses} {meses === 1 ? "mes" : "meses"} desde que empezó). Verde = dentro del presupuesto, rojo = te pasaste. Para que una categoría coincida, escríbela igual en ambos lados; si no, aparece como "sin presupuestar". Los gastos registrados sin zona no se cuentan aquí.</Aviso>
    {!P.length && <Aviso tipo="mal">Esta zona todavía no tiene presupuesto. Cárgalo desde el Simulador o en la pestaña "Presupuesto".</Aviso>}
    {bloque("INVERSION", "Inversión (CAPEX)")}
    {bloque("GASTO_OPERATIVO", "Gastos operativos")}
  </>;
}
