import { useState } from "react";
import { supabase, subirArchivo, urlArchivo } from "./supabase";
import { useApp } from "./auth";
import { Aviso, Campo, Vacio, Cargando, useQuery, useAlcance, hoy } from "./ui";
import { aPapelera } from "./papelera";
import { CampoM, FormModal } from "./formmodal";

export type CampoDef = { k: string; l: string; t?: "text" | "number" | "date" | "select" | "archivo" | "check"; opts?: string[]; bucket?: "comprobantes" | "fotos"; req?: boolean; def?: any };
type Props = {
  titulo: string; tabla: string; campos: CampoDef[]; columnas?: string[]; conZona?: boolean | "opcional"; orden?: string; select?: string;
  extra?: (fila: any) => any; tfoot?: (filas: any[]) => any; editar?: boolean;
};

/** Tabla con formulario para agregar y botón para quitar. Los permisos los decide la base de datos. */
export default function Crud({ titulo, tabla, campos, columnas, conZona, orden = "creado_en", select = "*", extra, tfoot, editar }: Props) {
  const { zonas, proyectoId, zonaId, proyectos } = useApp(), alcance = useAlcance();
  const q = useQuery(() => alcance(supabase.from(tabla).select(select).order(orden, { ascending: false }).limit(500), !!conZona), [tabla, proyectoId, zonaId]);
  const vacio = () => Object.fromEntries(campos.map(c => [c.k, c.def ?? (c.t === "date" ? hoy() : c.t === "check" ? false : "")]));
  const [v, setV] = useState<any>(vacio()), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false);
  const cols = columnas || campos.filter(c => c.t !== "archivo").map(c => c.k);
  const guardar = async () => {
    setMsg(""); setOk(""); setOcup(true);
    try {
      const zona = zonas.find(z => z.id === zonaId);
      const pid = zona?.proyecto_id || proyectoId || (proyectos.length === 1 ? proyectos[0].id : "");
      if (conZona === true && !zonaId) throw new Error("Elige una zona arriba.");
      if (!pid) throw new Error("Primero crea una zona en el menú Zonas.");
      const fila: any = {};
      for (const c of campos) {
        let x = v[c.k];
        if (c.req && (x === "" || x == null)) throw new Error("Falta: " + c.l);
        if (c.t === "archivo") { if (x) x = await subirArchivo(c.bucket || "comprobantes", pid, x); else x = null; }
        if (c.t === "number") x = x === "" ? null : Number(x);
        fila[c.k] = x === "" ? null : x;
      }
      fila.proyecto_id = pid;
      if (conZona) fila.zona_id = zonaId || null;
      const { error } = await supabase.from(tabla).insert(fila);
      if (error) throw new Error(/duplicate key|unique/i.test(error.message) ? "Ya existe un registro igual. Si lo mandaste a la papelera, restáuralo desde el menú Papelera." : error.message);
      setV(vacio()); setOk("Guardado."); q.recargar();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  const quitar = async (id: string) => { if (!confirm("¿Mandar este registro a la papelera? Podrás recuperarlo desde el menú Papelera.")) return; try { await aPapelera(tabla, [id]); q.recargar(); } catch (e: any) { setMsg(e.message); } };
  const [ed, setEd] = useState<any>(null);
  const ver = async (c: CampoDef, ruta: string) => { const u = await urlArchivo(c.bucket || "comprobantes", ruta); if (u) window.open(u, "_blank"); else setMsg("No se pudo abrir el archivo."); };
  const camposEd: CampoM[] = campos.filter(c => c.t !== "archivo" && c.t !== "check").map(c => ({ k: c.k, l: c.l, t: c.t === "select" ? "select" : c.t === "number" ? "number" : c.t === "date" ? "date" : "text", req: c.req, opts: c.t === "select" ? [["", "—"], ...c.opts!.map(o => [o, o] as [string, string])] : undefined, paso: c.t === "number" ? 0.01 : undefined }));
  const guardarEd = async (fila: any) => { const { error } = await supabase.from(tabla).update(fila).eq("id", ed.id); if (error) return /duplicate key|unique/i.test(error.message) ? "Ya existe un registro igual." : error.message; q.recargar(); };
  const filas: any[] = (q.data as any[]) || [];
  return <div className="card"><h2>{titulo}</h2>{msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="form">{campos.map(c => <Campo key={c.k} l={c.l + (c.req ? " *" : "")}>
      {c.t === "select" ? <select value={v[c.k]} onChange={e => setV({ ...v, [c.k]: e.target.value })}><option value="">—</option>{c.opts!.map(o => <option key={o}>{o}</option>)}</select>
        : c.t === "archivo" ? <input type="file" key={String(ok)} onChange={e => setV({ ...v, [c.k]: e.target.files?.[0] || null })} />
        : c.t === "check" ? <input type="checkbox" checked={!!v[c.k]} onChange={e => setV({ ...v, [c.k]: e.target.checked })} />
        : <input type={c.t || "text"} value={v[c.k]} onChange={e => setV({ ...v, [c.k]: e.target.value })} />}</Campo>)}</div>
    <button className="btn" disabled={ocup} onClick={guardar}>{ocup ? "Guardando…" : "Agregar"}</button>
    <div className="tw" style={{ marginTop: 12 }}>{q.loading ? <Cargando /> : q.error ? <Aviso tipo="mal">{q.error}</Aviso> : filas.length ? <table><thead><tr>{cols.map(c => <th key={c}>{campos.find(x => x.k === c)?.l || c}</th>)}{extra && <th />}<th /></tr></thead>
      <tbody>{filas.map(f => <tr key={f.id}>{cols.map(c => <td key={c}>{typeof f[c] === "boolean" ? (f[c] ? "Sí" : "No") : String(f[c] ?? "—")}</td>)}{extra && <td>{extra(f)}</td>}<td><div className="fila">{campos.filter(c => c.t === "archivo" && f[c.k]).map(c => <button key={c.k} className="btn suave chico" onClick={() => ver(c, f[c.k])}>{campos.filter(x => x.t === "archivo").length > 1 ? "Ver " + c.l.toLowerCase() : "Ver archivo"}</button>)}{editar && <button className="btn suave chico" onClick={() => setEd(f)}>Editar</button>}<button className="btn suave chico" onClick={() => quitar(f.id)}>A la papelera</button></div></td></tr>)}</tbody></table> : <Vacio>Aún no hay registros.</Vacio>}</div>
    {tfoot && filas.length > 0 && <div style={{ marginTop: 8 }}>{tfoot(filas)}</div>}
    {ed && <FormModal titulo="Editar" campos={camposEd} valores={ed} onGuardar={guardarEd} onClose={() => setEd(null)} />}</div>;
}
