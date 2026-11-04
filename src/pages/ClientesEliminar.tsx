import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Aviso, Cargando, Modal } from "../lib/ui";

/** Eliminar un cliente de verdad (por ejemplo, uno de prueba). Solo lo ve y lo puede hacer el administrador principal: la base de datos también lo exige. */
export function EliminarCliente({ c, onClose, onListo }: { c: any; onClose: () => void; onListo: () => void }) {
  const [r, setR] = useState<any>(null), [msg, setMsg] = useState(""), [txt, setTxt] = useState(""), [ocup, setOcup] = useState(false);
  useEffect(() => { supabase.rpc("resumen_eliminacion_cliente", { p_cliente: c.id }).then(({ data, error }: any) => { if (error) setMsg(error.message); else setR(data); }); }, [c.id]);
  const clave = String(c.codigo || c.nombre || "").trim(), puede = !!r && txt.trim().toLowerCase() === clave.toLowerCase();
  const eliminar = async () => { setOcup(true); setMsg(""); const { error } = await supabase.rpc("eliminar_cliente", { p_cliente: c.id }); setOcup(false); if (error) setMsg(error.message); else onListo(); };
  return <Modal titulo={`Eliminar al cliente ${c.codigo ? c.codigo + " · " : ""}${c.nombre}`} onClose={onClose} ancho={520}>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}
    {!r && !msg ? <Cargando /> : r && <>
      <Aviso tipo="mal"><b>Esto no se puede deshacer.</b> Se eliminará para siempre este cliente y lo que tiene ligado:</Aviso>
      {(r.items || []).length ? <ul style={{ margin: "6px 0 10px", paddingLeft: 18 }}>{(r.items || []).map((x: any) => <li key={x.etiqueta}><b>{x.n}</b> {x.etiqueta.charAt(0).toLowerCase() + x.etiqueta.slice(1)}</li>)}</ul> : <p className="mute">Este cliente no tiene pagos ni otros datos ligados.</p>}
      <p className="mute" style={{ margin: "0 0 6px" }}>Si el cliente se fue de verdad, usa <b>Dar de baja</b>: así se conserva su historial.</p>
      <label className="campo"><span>Para confirmar, escribe su código: <b>{clave}</b></span><input value={txt} onChange={e => setTxt(e.target.value)} autoFocus /></label>
      <div className="fila" style={{ marginTop: 10, justifyContent: "flex-end" }}><button className="btn suave" onClick={onClose}>Cancelar</button><button className="btn" style={{ background: "var(--bad)", color: "#fff" }} disabled={!puede || ocup} onClick={eliminar}>{ocup ? "Eliminando…" : "Eliminar cliente para siempre"}</button></div></>}
  </Modal>;
}
