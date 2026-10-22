import { ReactNode, useState } from "react";
import { Aviso, Campo, Modal } from "./ui";

export type CampoM = { k: string; l: string; t?: "text" | "number" | "date" | "select"; opts?: [string, string][]; req?: boolean; paso?: number };

/** Ventana para editar un registro. "onGuardar" devuelve un texto de error, o nada si todo salió bien. */
export function FormModal({ titulo, campos, valores, onGuardar, onClose, extra, ancho }: { titulo: string; campos: CampoM[]; valores: any; onGuardar: (v: any) => Promise<string | void>; onClose: () => void; extra?: ReactNode; ancho?: number }) {
  const [v, setV] = useState<any>(() => Object.fromEntries(campos.map(c => [c.k, valores?.[c.k] ?? ""]))), [msg, setMsg] = useState(""), [ocup, setOcup] = useState(false);
  const guardar = async () => {
    setMsg("");
    for (const c of campos) if (c.req && (v[c.k] === "" || v[c.k] == null)) return setMsg("Falta: " + c.l);
    const fila: any = {}; for (const c of campos) { const x = v[c.k]; fila[c.k] = x === "" || x == null ? null : c.t === "number" ? Number(x) : x; }
    setOcup(true); const e = await onGuardar(fila); setOcup(false);
    if (e) setMsg(e); else onClose();
  };
  return <Modal titulo={titulo} onClose={onClose} ancho={ancho}>{msg && <Aviso tipo="mal">{msg}</Aviso>}
    <div className="form">{campos.map(c => <Campo key={c.k} l={c.l + (c.req ? " *" : "")}>
      {c.t === "select" ? <select value={v[c.k]} onChange={e => setV({ ...v, [c.k]: e.target.value })}>{(c.opts || []).map(([val, l]) => <option key={val} value={val}>{l}</option>)}</select>
        : <input type={c.t || "text"} step={c.paso} value={v[c.k]} onChange={e => setV({ ...v, [c.k]: e.target.value })} />}</Campo>)}</div>
    <div className="fila" style={{ marginTop: 12 }}><button className="btn" disabled={ocup} onClick={guardar}>{ocup ? "Guardando…" : "Guardar cambios"}</button><button className="btn suave" onClick={onClose}>Cancelar</button></div>
    {extra}
  </Modal>;
}
