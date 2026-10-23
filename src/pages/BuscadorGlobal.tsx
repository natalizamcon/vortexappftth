import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";

type Res = { tipo: "Cliente" | "NAP" | "Equipo"; titulo: string; detalle: string; ruta: string; q?: string; tab?: string };
const limpio = (t: string) => t.replace(/[,()%*\\]/g, " ").trim();

/** Buscador de la barra superior: clientes (nombre, código, carnet, teléfono), NAP y equipos con serie. Solo muestra lo que tu usuario puede ver. */
export function BuscadorGlobal({ onElegir }: { onElegir: (ruta: string) => void }) {
  const { puede } = useApp(), [q, setQ] = useState(""), [res, setRes] = useState<Res[]>([]), [abierto, setAbierto] = useState(false), [cargando, setCargando] = useState(false), caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = limpio(q); if (t.length < 2) { setRes([]); return; }
    let vivo = true; setCargando(true);
    const h = setTimeout(async () => {
      const patron = `%${t}%`;
      const [c, n, e] = await Promise.all([
        puede("clientes", "ver") ? supabase.from("clientes").select("id, codigo, nombre, ci, telefono, estado").or(`nombre.ilike.${patron},codigo.ilike.${patron},ci.ilike.${patron},telefono.ilike.${patron}`).limit(5) : Promise.resolve({ data: [] as any[] }),
        puede("red", "ver") ? supabase.from("naps").select("id, codigo, tipo").ilike("codigo", patron).limit(4) : Promise.resolve({ data: [] as any[] }),
        puede("inventario", "ver") ? supabase.from("equipos_serie").select("id, serie, modelo, mac, estado").or(`serie.ilike.${patron},mac.ilike.${patron},modelo.ilike.${patron}`).limit(4) : Promise.resolve({ data: [] as any[] }),
      ]);
      if (!vivo) return;
      setRes([
        ...((c.data as any[]) || []).map(x => ({ tipo: "Cliente" as const, titulo: x.nombre, detalle: `${x.codigo}${x.ci ? " · C.I. " + x.ci : ""}${x.estado === "BAJA" ? " · baja" : ""}`, ruta: "clientes", q: x.nombre, tab: "lista" })),
        ...((n.data as any[]) || []).map(x => ({ tipo: "NAP" as const, titulo: x.codigo, detalle: x.tipo || "", ruta: "red", tab: "naps" })),
        ...((e.data as any[]) || []).map(x => ({ tipo: "Equipo" as const, titulo: `${x.modelo || "Equipo"} · ${x.serie}`, detalle: `${x.mac || ""} ${x.estado ? "· " + String(x.estado).toLowerCase() : ""}`, ruta: "inventario", tab: "materiales" })),
      ]); setCargando(false);
    }, 250);
    return () => { vivo = false; clearTimeout(h); };
  }, [q]);
  useEffect(() => { const f = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false); }; addEventListener("mousedown", f); return () => removeEventListener("mousedown", f); }, []);
  const elegir = (r: Res) => { if (r.q) sessionStorage.setItem("vx_q", r.q); if (r.tab) sessionStorage.setItem("vx_tab_" + r.ruta, r.tab); setAbierto(false); setQ(""); onElegir(r.ruta); };
  return <div className="buscador" ref={caja}>
    <input placeholder="Buscar cliente, COD, carnet, NAP, serie…" value={q} onChange={e => { setQ(e.target.value); setAbierto(true); }} onFocus={() => setAbierto(true)} aria-label="Buscar" />
    {abierto && limpio(q).length >= 2 && <div className="buscador-res">{cargando && !res.length ? <div className="mute" style={{ padding: 8 }}>Buscando…</div> : res.length ? res.map((r, i) => <button key={i} onClick={() => elegir(r)}><span className="pill">{r.tipo}</span> <b>{r.titulo}</b><br /><small className="mute">{r.detalle}</small></button>) : <div className="mute" style={{ padding: 8 }}>Sin resultados.</div>}</div>}
  </div>;
}
