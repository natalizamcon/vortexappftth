import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { ICONO_REC, etiquetaFecha, linkLlamar } from "../lib/agenda";
import { ANTELACIONES, ajustes, claveAviso, cuandoEs, debeAvisar, guardarAvisados, leerAvisados, notificar, pedirPermiso, permisoNotificaciones, sonar, vibrar } from "../lib/avisos";

type Aviso = { clave: string; r: any; c?: any; prueba?: boolean };
const cambio = () => window.dispatchEvent(new Event("agenda-cambio"));

/** Avisos de la Agenda: cuando llega la hora de un recordatorio tuyo, suena, vibra, muestra un cartel y (si lo permites) una notificación del sistema.
 *  Funciona en cualquier pantalla de Vortex mientras la app esté abierta, también en segundo plano. */
export function AvisosAgenda() {
  const { perfil } = useApp(), [cola, setCola] = useState<Aviso[]>([]), [sinSonido, setSinSonido] = useState(false), [, tic] = useState(0), tituloOriginal = useRef(typeof document !== "undefined" ? document.title : "");
  const lanzar = async (nuevos: Aviso[]) => {
    if (!nuevos.length) return; setCola(c => [...c, ...nuevos.filter(n => !c.some(x => x.clave === n.clave))]);
    if (ajustes.sonido()) setSinSonido(!sonar()); vibrar();
    nuevos.forEach(n => notificar(`${ICONO_REC[n.r.tipo] || "🔔"} ${n.r.titulo}`, `${etiquetaFecha(n.r.fecha_hora)}${n.r.lugar ? " · " + n.r.lugar : ""}${n.c ? " · " + n.c.nombre : ""}`, n.clave));
  };
  const revisar = async () => {
    if (!perfil?.id) return; const ahora = Date.now(), lead = ajustes.antelacion();
    const { data, error } = await supabase.from("agenda_recordatorios").select("*").eq("hecho", false).eq("creado_por", perfil.id).gte("fecha_hora", new Date(ahora - 12 * 3600000).toISOString()).lte("fecha_hora", new Date(ahora + lead * 60000).toISOString()).order("fecha_hora", { ascending: true }).limit(20);
    if (error || !data) return;
    const ya = new Set(leerAvisados()), toca = (data as any[]).filter(r => debeAvisar(r, ahora, lead, ya)); if (!toca.length) return;
    const ids = Array.from(new Set(toca.map(r => r.contacto_id).filter(Boolean))); let contactos: any[] = [];
    if (ids.length) { const rc = await supabase.from("agenda_contactos").select("id, nombre, telefono, zona").in("id", ids); contactos = (rc.data as any[]) || []; }
    guardarAvisados([...ya, ...toca.map(claveAviso)]); lanzar(toca.map(r => ({ clave: claveAviso(r), r, c: contactos.find(c => c.id === r.contacto_id) })));
  };
  const ref = useRef(revisar); ref.current = revisar;
  useEffect(() => {
    if (!perfil?.id) return; ref.current(); const t = setInterval(() => ref.current(), 30000), u = setInterval(() => tic(x => x + 1), 30000);
    const a = () => ref.current(), p = () => lanzar([{ clave: "prueba" + Date.now(), prueba: true, r: { id: "prueba", tipo: "Llamar", titulo: "Aviso de prueba: así se verá tu recordatorio", fecha_hora: new Date().toISOString() } }]);
    addEventListener("agenda-cambio", a); addEventListener("agenda-probar-aviso", p); document.addEventListener("visibilitychange", a);
    return () => { clearInterval(t); clearInterval(u); removeEventListener("agenda-cambio", a); removeEventListener("agenda-probar-aviso", p); document.removeEventListener("visibilitychange", a); };
  }, [perfil?.id]);
  useEffect(() => { document.title = cola.length ? `🔔 (${cola.length}) ${tituloOriginal.current}` : tituloOriginal.current; }, [cola.length]);
  const cerrar = (a: Aviso) => setCola(c => c.filter(x => x.clave !== a.clave));
  const hecho = async (a: Aviso) => { if (!a.prueba) { const { error } = await supabase.from("agenda_recordatorios").update({ hecho: true, hecho_en: new Date().toISOString() }).eq("id", a.r.id); if (error) return alert(error.message); cambio(); } cerrar(a); };
  const posponer = async (a: Aviso, min: number) => { if (!a.prueba) { const { error } = await supabase.from("agenda_recordatorios").update({ fecha_hora: new Date(Date.now() + min * 60000).toISOString() }).eq("id", a.r.id); if (error) return alert(error.message); cambio(); } cerrar(a); };
  if (!cola.length) return null;
  return <div role="alert" aria-live="assertive" style={{ position: "fixed", top: 62, right: 10, zIndex: 95, width: "min(380px, calc(100vw - 20px))", display: "flex", flexDirection: "column", gap: 8 }}>
    {sinSonido && <div className="aviso" style={{ margin: 0 }}>🔇 El navegador no dejó sonar. Toca la pantalla una vez y se activa el sonido.</div>}
    {cola.map(a => <div key={a.clave} className="card" style={{ margin: 0, padding: 12, borderLeft: "5px solid var(--bad)", boxShadow: "0 6px 24px #10142c55" }}>
      <div className="fila entre"><b>{ICONO_REC[a.r.tipo] || "🔔"} {a.r.titulo}</b><button className="btn suave chico" aria-label="Cerrar aviso" onClick={() => cerrar(a)}>✕</button></div>
      <div className="mute" style={{ margin: "2px 0 6px" }}><b style={{ color: "var(--bad)" }}>{cuandoEs(a.r.fecha_hora)}</b> · {etiquetaFecha(a.r.fecha_hora)}{a.r.lugar ? " · " + a.r.lugar : ""}{a.c ? ` · ${a.c.nombre}${a.c.zona ? " (" + a.c.zona + ")" : ""}` : ""}</div>
      <div className="fila">{a.c?.telefono && linkLlamar(a.c.telefono) && <a className="btn chico" href={linkLlamar(a.c.telefono)}>📞 Llamar</a>}<button className="btn chico" onClick={() => hecho(a)}>Hecho ✓</button>
        <button className="btn suave chico" onClick={() => posponer(a, 10)}>+10 min</button><button className="btn suave chico" onClick={() => posponer(a, 60)}>+1 hora</button>{!a.prueba && <a className="btn suave chico" href="#/agenda" onClick={() => cerrar(a)}>Abrir Agenda</a>}</div></div>)}</div>;
}

/** Ajustes de los avisos de este dispositivo. */
export function AjustesAvisos() {
  const [permiso, setPermiso] = useState(permisoNotificaciones()), [sonido, setSonido] = useState(ajustes.sonido()), [lead, setLead] = useState(ajustes.antelacion());
  return <details className="card" style={{ margin: "0 0 10px", padding: "8px 12px" }}><summary style={{ cursor: "pointer", fontWeight: 600 }}>🔔 Avisos y sonido {permiso === "granted" ? <span className="pill ok">notificaciones activas</span> : <span className="pill warn">actívalos</span>}</summary>
    <p className="mute" style={{ margin: "8px 0" }}>Cuando llegue la hora de un recordatorio tuyo, esta app <b>suena, vibra y muestra un aviso</b> en cualquier pantalla de Vortex. Funciona mientras la app esté abierta (aunque esté en segundo plano). <b>Con la app cerrada o el celular bloqueado no puede avisar</b>: para eso usa el botón 📅 de cada recordatorio, que lo pasa al calendario del celular con alarma.</p>
    <div className="fila" style={{ gap: 10 }}>
      {permiso !== "granted" && permiso !== "no" && <button className="btn" onClick={async () => setPermiso((await pedirPermiso()) as any)}>Activar notificaciones del celular</button>}
      {permiso === "denied" && <span className="mute">Las bloqueaste: actívalas en los ajustes del navegador para este sitio.</span>}{permiso === "no" && <span className="mute">Este navegador no permite notificaciones; igual verás el cartel y oirás el sonido.</span>}
      <label className="fila"><input type="checkbox" checked={sonido} onChange={e => { ajustes.setSonido(e.target.checked); setSonido(e.target.checked); }} /> Sonido</label>
      <label className="fila">Avisarme <select aria-label="Cuándo avisar" value={lead} onChange={e => { ajustes.setAntelacion(Number(e.target.value)); setLead(Number(e.target.value)); }}>{ANTELACIONES.map(([m, t]) => <option key={m} value={m}>{t}</option>)}</select></label>
      <button className="btn suave" onClick={() => window.dispatchEvent(new Event("agenda-probar-aviso"))}>🔊 Probar aviso</button></div>
    <p className="mute" style={{ margin: "6px 0 0" }}>Estos ajustes valen solo para este dispositivo.</p></details>;
}
