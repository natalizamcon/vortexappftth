import { useState } from "react";
import { supabase, subirArchivo, urlArchivo } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { aPapelera } from "../lib/papelera";
import { Aviso, Campo, Cargando, Vacio, bs, hoy, useAlcance, useQuery } from "../lib/ui";

const CONCEPTOS = ["Jornal", "Pago de viaje", "Viáticos", "Bono", "Adelanto", "Otro"];

/** Pagos hechos al personal. Es un respaldo: no se suma otra vez a los gastos, porque el costo del personal ya está en los viajes. */
export function PagosPersonal() {
  const { zonas, zonaId, proyectoId } = useApp(), al = useAlcance();
  const lista = useQuery(() => al(supabase.from("pagos_personal").select("*, zonas(nombre)").order("fecha", { ascending: false }).limit(300)), [proyectoId, zonaId]);
  const gente = useQuery(() => supabase.from("profiles").select("id, nombre, email, rol").eq("activo", true).order("nombre"), []);
  const zv = zonas.filter(z => !proyectoId || z.proyecto_id === proyectoId);
  const vacio = { fecha: hoy(), trabajador: "", otro: "", concepto: "Jornal", monto: "0", zona: zonaId || zv[0]?.id || "", nota: "" };
  const [f, setF] = useState(vacio), [arch, setArch] = useState<File | null>(null), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false);
  const personal: any[] = ((gente.data as any[]) || []).filter(x => x.rol !== "pendiente" && x.rol !== "socio"), L: any[] = (lista.data as any[]) || [];
  const nombre = f.trabajador === "__otro" ? f.otro.trim() : f.trabajador;

  const guardar = async () => {
    setMsg(""); setOk(""); const z = zonas.find(x => x.id === (f.zona || zonaId));
    if (!z) return setMsg("Elige la zona del pago."); if (!nombre) return setMsg("Elige o escribe el nombre del trabajador."); if (!(Number(f.monto) > 0)) return setMsg("Escribe un monto mayor a 0.");
    setOcup(true);
    try {
      const ruta = arch ? await subirArchivo("comprobantes", z.proyecto_id, arch) : null;
      const { error } = await supabase.from("pagos_personal").insert({ proyecto_id: z.proyecto_id, zona_id: z.id, fecha: f.fecha, trabajador: nombre, concepto: f.concepto, monto: Number(f.monto), nota: f.nota || null, comprobante_path: ruta });
      if (error) throw new Error(error.message);
      setF({ ...vacio, zona: f.zona }); setArch(null); setOk("Pago guardado."); lista.recargar();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  const quitar = async (x: any) => { if (!confirm(`¿Mandar el pago a ${x.trabajador} a la papelera? Podrás recuperarlo desde Configuración → Papelera.`)) return; try { await aPapelera("pagos_personal", [x.id]); lista.recargar(); } catch (e: any) { setMsg(e.message); } };
  const ver = async (ruta: string) => { const u = await urlArchivo("comprobantes", ruta); if (u) window.open(u, "_blank"); else setMsg("No se pudo abrir el respaldo."); };

  return <div className="grid g2" style={{ alignItems: "start" }}>
    <div className="card"><h2>Registrar pago a un trabajador</h2>{msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
      <div className="form" style={{ gridTemplateColumns: "1fr" }}>
        <Campo l="Fecha"><input type="date" value={f.fecha} onChange={e => setF({ ...f, fecha: e.target.value })} /></Campo>
        <Campo l="Trabajador"><select value={f.trabajador} onChange={e => setF({ ...f, trabajador: e.target.value })}><option value="">Elige…</option>{personal.map(x => <option key={x.id} value={x.nombre || x.email}>{x.nombre || x.email}</option>)}<option value="__otro">Otro (escribir el nombre)</option></select></Campo>
        {f.trabajador === "__otro" && <Campo l="Nombre del trabajador"><input value={f.otro} onChange={e => setF({ ...f, otro: e.target.value })} /></Campo>}
        <Campo l="Concepto"><select value={f.concepto} onChange={e => setF({ ...f, concepto: e.target.value })}>{CONCEPTOS.map(c => <option key={c}>{c}</option>)}</select></Campo>
        <Campo l="Monto (Bs)"><input type="number" min={0} step={0.01} value={f.monto} onChange={e => setF({ ...f, monto: e.target.value })} /></Campo>
        <Campo l="Zona"><select value={f.zona} onChange={e => setF({ ...f, zona: e.target.value })}>{zv.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}</select></Campo>
        <Campo l="Nota"><input value={f.nota} onChange={e => setF({ ...f, nota: e.target.value })} /></Campo>
        <Campo l="Respaldo (foto del recibo o planilla)"><input type="file" key={String(ok)} onChange={e => setArch(e.target.files?.[0] || null)} /></Campo>
      </div><button className="btn" style={{ width: "100%" }} disabled={ocup} onClick={guardar}>{ocup ? "Guardando…" : "Guardar pago"}</button>
      <p className="mute" style={{ margin: "8px 0 0" }}>Es un registro de respaldo: no suma otra vez a los gastos, porque el costo del personal ya está en los viajes.</p></div>
    <div className="card tw"><h2>Pagos hechos al personal</h2>{lista.loading ? <Cargando /> : L.length ? <table style={{ minWidth: 0 }}><thead><tr><th>Fecha</th><th>Trabajador</th><th>Concepto</th><th>Monto</th><th>Zona</th><th /></tr></thead>
      <tbody>{L.map(x => <tr key={x.id}><td style={{ whiteSpace: "nowrap" }}>{x.fecha}</td><td>{x.trabajador}{x.nota && <><br /><small className="mute">{x.nota}</small></>}</td><td>{x.concepto}</td><td><b>{bs(x.monto)}</b></td><td>{x.zonas?.nombre}</td>
        <td><div className="fila">{x.comprobante_path && <button className="btn suave chico" onClick={() => ver(x.comprobante_path)}>Respaldo</button>}<button className="btn suave chico" onClick={() => quitar(x)}>Papelera</button></div></td></tr>)}</tbody></table> : <Vacio>Aún no hay pagos registrados.</Vacio>}</div>
  </div>;
}
