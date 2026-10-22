import { useEffect, useState, ReactNode } from "react";
import { useApp } from "./auth";

export const bs = (n: any) => "Bs " + Math.round(Number(n) || 0).toLocaleString("es-BO");
export const hoy = () => new Date().toISOString().slice(0, 10);
export const mesActual = () => hoy().slice(0, 7) + "-01";
export const nombreMes = (d: string) => ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][+d.slice(5, 7) - 1] + " " + d.slice(2, 4);
export const sumar = (a: any[], k: string) => a.reduce((s, x) => s + (Number(x[k]) || 0), 0);

/** Pide datos y los vuelve a pedir cuando cambian las dependencias. */
export function useQuery<T = any>(fn: () => any, deps: any[]) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [n, setN] = useState(0);
  useEffect(() => {
    let cancelado = false; setLoading(true);
    Promise.resolve(fn()).then((r: any) => { if (cancelado) return; setData(r.data); setError(r.error ? r.error.message : ""); setLoading(false); });
    return () => { cancelado = true; };
  }, [...deps, n]);
  return { data, error, loading, recargar: () => setN(x => x + 1) };
}

/** Filtro de proyecto/zona elegido arriba, aplicado a una consulta. */
export function useAlcance() {
  const { proyectoId, zonaId } = useApp();
  return (q: any, conZona = true) => { if (proyectoId) q = q.eq("proyecto_id", proyectoId); if (zonaId && conZona) q = q.eq("zona_id", zonaId); return q; };
}

export function Modal({ titulo, onClose, children, ancho = 560 }: { titulo: string; onClose: () => void; children: ReactNode; ancho?: number }) {
  return <div className="modal-fondo" onClick={onClose}><div className="modal" style={{ maxWidth: ancho }} onClick={e => e.stopPropagation()}>
    <div className="fila entre"><h2>{titulo}</h2><button className="btn suave" onClick={onClose}>Cerrar</button></div>{children}</div></div>;
}
export const Campo = ({ l, children }: { l: string; children: ReactNode }) => <label className="campo"><span>{l}</span>{children}</label>;
export const Estado = ({ e }: { e: string }) => <span className={"tag e-" + (e || "").replace(/[ ÑÓ]/g, "_")}>{e}</span>;
export const Aviso = ({ tipo = "info", children }: { tipo?: string; children: ReactNode }) => <div className={"aviso " + tipo}>{children}</div>;
export const Vacio = ({ children }: { children: ReactNode }) => <p className="mute vacio">{children}</p>;
export const Cargando = () => <p className="mute">Cargando…</p>;
export function Tabs({ items, valor, onChange }: { items: [string, string][]; valor: string; onChange: (v: string) => void }) {
  return <div className="tabs">{items.map(([k, l]) => <button key={k} className={valor === k ? "on" : ""} onClick={() => onChange(k)}>{l}</button>)}</div>;
}
export function Kpi({ t, v, s, c }: { t: string; v: ReactNode; s?: ReactNode; c?: string }) {
  return <div className="card kpi"><span>{t}</span><b style={c ? { color: c } : undefined}>{v}</b>{s && <small className="mute">{s}</small>}</div>;
}

/** Proyecto con el que se trabaja: el elegido arriba, o el único que tiene el usuario. */
export function useProyecto() { const { proyectoId, proyectos } = useApp(); return proyectoId || (proyectos.length === 1 ? proyectos[0].id : ""); }
