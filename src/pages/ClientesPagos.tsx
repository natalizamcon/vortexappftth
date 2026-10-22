import { useEffect, useState } from "react";
import { supabase, subirArchivo } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Vacio, bs, hoy, useAlcance, useQuery } from "../lib/ui";
import { MES_CORTO } from "../lib/datos";
import { primeroDeMes, repartoPago, r2 } from "../lib/pagos";

const n = (x: any) => Number(x) || 0;
export const mesYear = (d: string) => MES_CORTO[+d.slice(5, 7) - 1] + " " + d.slice(0, 4);
const mesDesp = (d: string, k: number) => { let a = +d.slice(0, 4), m = +d.slice(5, 7) - 1 + k; a += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return `${a}-${String(m + 1).padStart(2, "0")}-01`; };
export const MEDIOS = ["Transferencia QR", "Efectivo", "Depósito"];

/** Formulario para registrar un pago, con el reparto entre meses a la vista. Sirve para la pestaña Pagos y para el panel lateral de Cobranzas. */
export function FormPago({ clientes, clienteId: fijo, onListo }: { clientes: any[]; clienteId?: string; onListo: () => void }) {
  const [clienteId, setClienteId] = useState(fijo || ""), c = clientes.find(x => x.cliente_id === clienteId);
  const cargos = useQuery(() => clienteId ? supabase.from("v_cargos").select("periodo, monto, pagado, saldo, vence").eq("cliente_id", clienteId).order("periodo") : Promise.resolve({ data: [], error: null }), [clienteId]);
  const [monto, setMonto] = useState(""), [medio, setMedio] = useState(MEDIOS[0]), [arch, setArch] = useState<File | null>(null), [periodo, setPeriodo] = useState(primeroDeMes(hoy())), [obs, setObs] = useState(""), [reconectar, setReconectar] = useState("si");
  const [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false);
  const C: any[] = (cargos.data as any[]) || [], precio = n(c?.precio_mensual);

  // al elegir cliente, el pago empieza en su mes más antiguo sin pagar
  useEffect(() => { const v = C.find(x => n(x.saldo) > 0); setPeriodo(v ? primeroDeMes(v.periodo) : primeroDeMes(hoy())); }, [clienteId, cargos.data]);

  const meses = Array.from(new Set([...[-3, -2, -1, 0, 1, 2].map(k => mesDesp(primeroDeMes(hoy()), k)), ...C.filter(x => n(x.saldo) > 0).map(x => primeroDeMes(x.periodo)), periodo])).sort();
  const r = c && n(monto) > 0 ? repartoPago({ monto: n(monto), precio, desde: periodo, cargos: C.map(x => ({ periodo: x.periodo, monto: n(x.monto), pagado: n(x.pagado) })) }) : null;
  const asignadoDe = (p: string) => r?.tiles.find(t => t.periodo === p)?.asignado || 0;
  const deudaDespues = r2(C.filter(x => x.vence < hoy()).reduce((s, x) => s + Math.max(0, n(x.saldo) - asignadoDe(primeroDeMes(x.periodo))), 0));
  const estadoFinal = c?.estado_servicio === "SUSPENDIDO" ? null : r ? (deudaDespues <= 0 ? "Pagado" : "Con deuda pendiente (" + bs(deudaDespues) + ")") : (n(c?.deuda) > 0 ? "Con deuda pendiente" : "Pagado");
  const atajos: [string, number, string][] = c ? [[bs(Math.round(precio * 0.6)), Math.round(precio * 0.6), "60% de la mensualidad"], [bs(precio), precio, "Un mes"], [bs(precio * 3), precio * 3, "Tres meses"], [bs(precio * 12), precio * 12, "Doce meses"], ...(n(c.deuda) > 0 ? [[`Deuda ${bs(c.deuda)}`, n(c.deuda), "Todo lo que debe"] as [string, number, string]] : [])] : [];

  const guardar = async () => {
    setMsg(""); setOk("");
    if (!c) return setMsg("Elige el cliente."); if (!(n(monto) > 0)) return setMsg("Escribe el monto recibido.");
    if (!arch) return setMsg("Falta adjuntar el comprobante: es obligatorio para guardar el pago.");
    setOcup(true);
    try {
      const ruta = await subirArchivo("comprobantes", c.proyecto_id, arch);
      const { error } = await supabase.rpc("registrar_pago", { p_cliente: c.cliente_id, p_monto: n(monto), p_medio: medio, p_periodo: periodo, p_comprobante: ruta, p_obs: obs || null });
      if (error) throw new Error(error.message);
      if (c.estado_servicio === "SUSPENDIDO" && reconectar === "si") { const e2 = await supabase.rpc("cambiar_estado_cliente", { p_cliente: c.cliente_id, p_accion: "RECONECTAR", p_motivo: "Registró un pago", p_hasta: null }); if (e2.error) throw new Error("El pago se guardó, pero no se pudo reconectar: " + e2.error.message); }
      setOk(`Pago de ${bs(n(monto))} guardado${c.estado_servicio === "SUSPENDIDO" && reconectar === "si" ? " y servicio reconectado" : ""}.`); setMonto(""); setArch(null); setObs(""); cargos.recargar(); onListo();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };

  return <>
    <div className="card"><h2>Registrar pago</h2>{msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
      <div className="form" style={{ gridTemplateColumns: "1fr" }}>
        <Campo l="Cliente"><select value={clienteId} onChange={e => setClienteId(e.target.value)} disabled={!!fijo}><option value="">Elige un cliente…</option>{clientes.filter(x => x.estado_cuenta !== "BAJA").map(x => <option key={x.cliente_id} value={x.cliente_id}>{x.codigo} — {x.nombre} ({bs(x.precio_mensual)})</option>)}</select></Campo>
        <Campo l="Monto recibido (Bs)"><input type="number" min={0} step={0.01} value={monto} onChange={e => setMonto(e.target.value)} /></Campo>
        {atajos.length > 0 && <div className="fila">{atajos.map(([l, v, t]) => <button key={l} type="button" className="btn suave" title={t} onClick={() => setMonto(String(v))}>{l}</button>)}</div>}
        <Campo l="Medio de pago"><select value={medio} onChange={e => setMedio(e.target.value)}>{MEDIOS.map(m => <option key={m}>{m}</option>)}</select></Campo>
        <Campo l="Comprobante (obligatorio)"><input type="file" accept="image/*,.pdf" key={String(ok)} onChange={e => setArch(e.target.files?.[0] || null)} /></Campo>
        <Campo l="Mes que se paga"><select value={periodo} onChange={e => setPeriodo(e.target.value)}>{meses.map(m => <option key={m} value={m}>{mesYear(m)}</option>)}</select></Campo>
        <Campo l="Estado del cliente">{c?.estado_servicio === "SUSPENDIDO"
          ? <select value={reconectar} onChange={e => setReconectar(e.target.value)}><option value="si">Reconectar el servicio</option><option value="no">Mantener suspendido</option></select>
          : <select value="auto" disabled><option value="auto">{estadoFinal || "Pagado"}</option></select>}</Campo>
        <Campo l="Observaciones"><input placeholder="Ej.: pagó la mitad, completa el viernes" value={obs} onChange={e => setObs(e.target.value)} /></Campo>
      </div>
      <button className="btn" style={{ width: "100%", marginTop: 8 }} disabled={ocup} onClick={guardar}>{ocup ? "Guardando…" : "Guardar pago"}</button>
      {c?.estado_servicio !== "SUSPENDIDO" && <p className="mute" style={{ margin: "8px 0 0" }}>El estado se calcula solo según lo que el cliente debe después de este pago.</p>}</div>

    <div className="card"><h2>Cómo se reparte el pago</h2>
      {!c ? <Vacio>Elige un cliente y escribe el monto para ver a qué meses se aplica.</Vacio> : cargos.loading ? <Cargando /> : !r ? <Vacio>Escribe el monto recibido.</Vacio> : <>
        <p className="mute" style={{ marginTop: 0 }}>Pago {r.tipo === "Anticipado" ? "adelantado" : r.tipo === "Parcial" ? "parcial" : "completo"} · Mensualidad {bs(precio)}{n(c.deuda) > 0 ? ` · Debe ${bs(c.deuda)}` : ""}</p>
        <div className="fila" style={{ alignItems: "stretch" }}>{r.tiles.map(t => <div key={t.periodo} className={"chip-pago " + t.estado}><small>{mesYear(t.periodo)}</small><b>{t.estado === "ya" ? "—" : bs(t.asignado)}</b><small>{t.estado === "cubierto" ? "cubierto" : t.estado === "parcial" ? `saldo ${bs(t.saldo)}` : "ya pagado"}</small></div>)}</div>
        <p style={{ margin: "12px 0 0" }}>Total asignado: <b>{bs(r.asignado)}</b>{r.cubreHasta ? <> · cubre hasta <b>{mesYear(r.cubreHasta)}</b></> : null}{r.sobrante > 0 ? <span className="mute"> · sobran {bs(r.sobrante)} (pasan de 5 años)</span> : null}</p>
        <p className="mute" style={{ margin: "6px 0 0" }}>El pago se aplica del mes más antiguo al más nuevo, empezando en el mes que elegiste.</p></>}</div>
  </>;
}

export function Pagos() {
  const { proyectoId, zonaId } = useApp(), al = useAlcance();
  const cob = useQuery(() => al(supabase.from("v_cobranza").select("cliente_id, proyecto_id, codigo, nombre, precio_mensual, deuda, estado_servicio, estado_cuenta").order("nombre").limit(1000)), [proyectoId, zonaId]);
  if (cob.loading) return <Cargando />;
  return <div className="grid g2" style={{ alignItems: "start" }}><FormPago clientes={(cob.data as any[]) || []} onListo={() => cob.recargar()} /></div>;
}
