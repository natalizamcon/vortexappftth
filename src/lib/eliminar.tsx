import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { Aviso, Cargando, Modal } from "./ui";

/** Eliminar una zona o un proyecto de verdad. Si está vacío se elimina con un toque; si tiene datos, se muestra qué se perdería y hay que escribir su nombre. */
export function EliminarDefinitivo({ tabla, id, nombre, onClose, onListo }: { tabla: "zonas" | "proyectos"; id: string; nombre: string; onClose: () => void; onListo: () => void }) {
  const [r, setR] = useState<any>(null), [msg, setMsg] = useState(""), [txt, setTxt] = useState(""), [ocup, setOcup] = useState(false);
  useEffect(() => { supabase.rpc("resumen_eliminacion", { p_tabla: tabla, p_id: id }).then(({ data, error }) => { if (error) setMsg(error.message); else setR(data); }); }, [tabla, id]);
  const tipo = tabla === "zonas" ? "la zona" : "el proyecto", vacio = !!r?.vacio, puede = r && (vacio || txt.trim().toLowerCase() === nombre.trim().toLowerCase());
  const eliminar = async () => { setOcup(true); setMsg(""); const { error } = await supabase.rpc("eliminar_definitivo", { p_tabla: tabla, p_id: id, p_forzar: !vacio }); setOcup(false); if (error) setMsg(error.message); else onListo(); };
  return <Modal titulo={`Eliminar ${tipo} "${nombre}"`} onClose={onClose} ancho={520}>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}
    {!r && !msg ? <Cargando /> : r && <>
      {vacio ? <p style={{ marginTop: 0 }}>{tabla === "zonas" ? "Esta zona" : "Este proyecto"} <b>no tiene datos</b> (ni clientes, ni pagos, ni red, ni inversores). Se eliminará <b>para siempre</b>.</p>
        : <><Aviso tipo="mal"><b>Esto no se puede deshacer.</b> Se eliminará para siempre {tipo} y todo lo que contiene:</Aviso>
          <ul style={{ margin: "6px 0 10px", paddingLeft: 18 }}>{(r.items || []).map((x: any) => <li key={x.etiqueta}><b>{x.n}</b> {x.etiqueta.toLowerCase()}</li>)}</ul>
          <p className="mute" style={{ margin: "0 0 6px" }}>Si solo quieres ocultarlo y poder recuperarlo después, usa <b>A la papelera</b> en lugar de esto.</p>
          <label className="campo"><span>Para confirmar, escribe el nombre exacto: <b>{nombre}</b></span><input value={txt} onChange={e => setTxt(e.target.value)} autoFocus /></label></>}
      <div className="fila" style={{ marginTop: 10, justifyContent: "flex-end" }}><button className="btn suave" onClick={onClose}>Cancelar</button><button className="btn" style={{ background: "var(--bad)", color: "#fff" }} disabled={!puede || ocup} onClick={eliminar}>{ocup ? "Eliminando…" : "Eliminar para siempre"}</button></div></>}
  </Modal>;
}
