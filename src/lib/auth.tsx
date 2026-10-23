import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "./supabase";
import { Accion, MODULOS, fijarPermisos, matrizDe } from "./permisos";

export type Perfil = { id: string; email: string; nombre: string; rol: string; rol_clave?: string | null; activo: boolean };
type Ctx = {
  cargando: boolean; sesion: any; perfil: Perfil | null; proyectos: any[]; zonas: any[]; recargar: () => Promise<void>;
  proyectoId: string; setProyectoId: (v: string) => void; zonaId: string; setZonaId: (v: string) => void; salir: () => Promise<void>;
  puede: (modulo: string, accion: Accion) => boolean; modulosVisibles: string[];
};
const C = createContext<Ctx>(null as any);
export const useApp = () => useContext(C);

export function AppProvider({ children }: { children: ReactNode }) {
  const [sesion, setSesion] = useState<any>(null), [cargando, setCargando] = useState(true), [perfil, setPerfil] = useState<Perfil | null>(null);
  const [proyectos, setProyectos] = useState<any[]>([]), [zonas, setZonas] = useState<any[]>([]), [permisos, setPermisos] = useState<any[]>([]);
  const [proyectoId, setProyectoId] = useState(localStorage.getItem("vx_proy") || ""), [zonaId, setZonaId] = useState(localStorage.getItem("vx_zona") || "");

  const recargar = async () => {
    const { data: s } = await supabase.auth.getSession();
    setSesion(s.session);
    if (!s.session) { setPerfil(null); setProyectos([]); setZonas([]); setCargando(false); return; }
    const { data: p } = await supabase.from("profiles").select("*").eq("id", s.session.user.id).maybeSingle();
    setPerfil(p as any);
    const clave = (p as any)?.rol_clave || (p as any)?.rol;
    if (clave && (p as any)?.rol !== "admin") { const { data: pm } = await supabase.from("roles_permisos").select("*").eq("rol_clave", clave); setPermisos(pm || []); } else setPermisos([]);
    const [pr, zo] = await Promise.all([supabase.from("proyectos").select("*").order("nombre"), supabase.from("zonas").select("*").order("nombre")]);
    setProyectos(pr.data || []); setZonas(zo.data || []); setCargando(false);
  };
  useEffect(() => {
    recargar();
    // Se recarga fuera del evento para evitar bloqueos internos de Supabase.
    const { data } = supabase.auth.onAuthStateChange(() => { setTimeout(() => { recargar(); }, 0); });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => { localStorage.setItem("vx_proy", proyectoId); }, [proyectoId]);
  useEffect(() => { localStorage.setItem("vx_zona", zonaId); }, [zonaId]);
  // si lo elegido ya no existe o no corresponde, se limpia
  useEffect(() => {
    if (proyectoId && proyectos.length && !proyectos.some(p => p.id === proyectoId)) setProyectoId("");
    if (zonaId && zonas.length && !zonas.some(z => z.id === zonaId && (!proyectoId || z.proyecto_id === proyectoId))) setZonaId("");
  }, [proyectos, zonas, proyectoId]);

  const salir = async () => { await supabase.auth.signOut(); setPerfil(null); };
  const matriz = matrizDe(perfil?.rol || "pendiente", permisos);
  const puede = (modulo: string, accion: Accion) => perfil?.rol === "admin" || !!matriz[modulo]?.[accion];
  fijarPermisos(puede);
  const modulosVisibles = MODULOS.filter(([k]) => puede(k, "ver")).map(([k]) => k);
  return <C.Provider value={{ cargando, sesion, perfil, proyectos, zonas, recargar, proyectoId, setProyectoId, zonaId, setZonaId, salir, puede, modulosVisibles }}>{children}</C.Provider>;
}
