import { useEffect, useState } from "react";
import { useApp } from "./lib/auth";
import { configurado } from "./lib/supabase";
import { Aviso, Cargando } from "./lib/ui";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Clientes from "./pages/Clientes";
import Red from "./pages/Red";
import Servicios from "./pages/Servicios";
import Inventario from "./pages/Inventario";
import Finanzas from "./pages/Finanzas";
import Papelera from "./pages/Papelera";
import Configuracion from "./pages/Configuracion";
import Alertas from "./pages/Alertas";
import Formularios from "./pages/Formularios";
import Reportes from "./pages/Reportes";
import { AlertasProvider, ContadorAlertas, useAlertas } from "./lib/alertas";
import { BuscadorGlobal } from "./pages/BuscadorGlobal";
import { VERSION } from "./version";
import { CambiarClave } from "./pages/CambiarClave";
import Agenda, { ContadorAgenda } from "./pages/Agenda";
import { AvisosAgenda } from "./pages/AvisosAgenda";

const RUTAS: [string, string, string | null][] = [
  ["dashboard", "Dashboard", null], ["red", "Red", "red"], ["clientes", "Clientes", "clientes"], ["servicios", "Instalaciones y servicios", "instalaciones"], ["inventario", "Almacén", "inventario"],
  ["finanzas", "Finanzas", "finanzas"], ["formularios", "Formularios", "formularios"], ["agenda", "Agenda", null], ["alertas", "Centro de alertas", null], ["reportes", "Reportes", "reportes"], ["configuracion", "Configuración", "__admin"],
];
const MODULO_RUTA: Record<string, string> = { red: "red", clientes: "clientes", cobranzas: "cobranzas", servicios: "instalaciones", campo: "instalaciones", inventario: "inventario", finanzas: "finanzas", formularios: "formularios", reportes: "reportes" };
const ICONOS: Record<string, string> = { dashboard: "🏠", agenda: "📒", red: "🌐", clientes: "👥", servicios: "🛠️", inventario: "📦", finanzas: "💰", formularios: "🖨️", alertas: "🔔", reportes: "📊", configuracion: "⚙️" };
const useHash = () => { const [h, setH] = useState(location.hash.slice(2) || "dashboard"); useEffect(() => { const f = () => setH(location.hash.slice(2) || "dashboard"); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []); return h; };

export default function App() {
  const { cargando, sesion, perfil, proyectos, zonas, proyectoId, setProyectoId, zonaId, setZonaId, salir, puede, recuperando, terminarRecuperacion } = useApp();
  const ruta = useHash(), [busq, setBusq] = useState(0), [menu, setMenu] = useState(false), [claveAbierta, setClaveAbierta] = useState(false);
  useEffect(() => { setMenu(false); }, [ruta]);
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false); addEventListener("keydown", f); return () => removeEventListener("keydown", f); }, []);
  if (!configurado) return <div className="login"><img src="/logo.png" alt="Vortex" /><Aviso tipo="mal"><b>Falta conectar Supabase.</b> Abre el archivo <code>src/config.ts</code> y pega tu Project URL y tu clave pública (paso 4 de la guía).</Aviso></div>;
  if (cargando) return <div className="login"><img src="/logo.png" alt="Vortex" /><Cargando /></div>;
  if (!sesion) return <Login />;
  if (recuperando) return <CambiarClave recuperacion onListo={() => { history.replaceState(null, "", location.pathname); terminarRecuperacion(); }} />;
  if (!perfil || perfil.rol === "pendiente" || !perfil.activo) return <div className="login"><img src="/logo.png" alt="Vortex" /><Aviso>Tu cuenta ({sesion.user.email}) todavía no tiene acceso. Pide al administrador que te asigne un rol y un proyecto.</Aviso><button className="btn suave" onClick={salir}>Salir</button></div>;
  const items = RUTAS.filter(([, , m]) => !m || (m === "__admin" ? perfil.rol === "admin" : puede(m, "ver")));
  const zonasVis = zonas.filter(z => !proyectoId || z.proyecto_id === proyectoId);
  const pagina = () => {
    const modulo = MODULO_RUTA[ruta]; if (modulo && !puede(modulo, "ver")) return <Dashboard />;
    switch (ruta) {
      case "agenda": return <Agenda />;
      case "configuracion": case "zonas": case "usuarios": case "papelera": case "roles": case "socios": return perfil.rol === "admin" ? <Configuracion inicial={ruta === "configuracion" ? undefined : ruta} /> : <Dashboard />;
      case "clientes": case "cobranzas": return <Clientes inicial={ruta === "cobranzas" ? "cobranzas" : undefined} />; case "red": return <Red />;
      case "servicios": case "campo": return <Servicios />; case "inventario": return <Inventario />; case "finanzas": return <Finanzas />; case "alertas": return <Alertas />; case "formularios": return <Formularios />; case "reportes": return <Reportes />;
      default: return <Dashboard />;
    }
  };
  const alias: Record<string, string> = { cobranzas: "clientes", campo: "servicios", zonas: "configuracion", usuarios: "configuracion", papelera: "configuracion", roles: "configuracion", socios: "configuracion" }, actual = alias[ruta] || ruta, seccion = RUTAS.find(r => r[0] === actual)?.[1] || "Dashboard";
  return <AlertasProvider>
    <div className={"lateral-fondo" + (menu ? " abierto" : "")} onClick={() => setMenu(false)} />
    <aside className={"lateral" + (menu ? " abierto" : "")} aria-label="Menú principal" aria-hidden={!menu}>
      <div className="fila entre" style={{ marginBottom: 10 }}><img src="/logo.png" alt="Vortex, internet de fibra óptica" style={{ height: 36 }} /><button className="btn suave chico" onClick={() => setMenu(false)} aria-label="Cerrar el menú">✕</button></div>
      <div className="lateral-filtros">
        {proyectos.length > 1 && <select aria-label="Proyecto" value={proyectoId} onChange={e => { setProyectoId(e.target.value); setZonaId(""); }}><option value="">{perfil.rol === "admin" ? "Todos los proyectos" : "Todos mis proyectos"}</option>{proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>}
        <select aria-label="Zona" value={zonaId} onChange={e => setZonaId(e.target.value)}><option value="">Todas las zonas</option>{zonasVis.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}</select>
        <BuscadorGlobal onElegir={r => { location.hash = "#/" + r; setBusq(x => x + 1); setMenu(false); }} />
      </div>
      <nav>{items.map(([k, l]) => <a key={k} href={"#/" + k} className={actual === k ? "on" : ""} onClick={() => setMenu(false)}><span className="ico">{ICONOS[k]}</span><span>{l}</span>{k === "alertas" && <ContadorAlertas />}{k === "agenda" && <ContadorAgenda />}</a>)}</nav>
      <div className="lateral-pie"><b>{perfil.nombre || perfil.email}</b><br /><small className="mute">{NOMBRE_ROL[perfil.rol] || perfil.rol}</small><div className="fila" style={{ marginTop: 8 }}><button className="btn suave chico" onClick={() => { setMenu(false); setClaveAbierta(true); }}>🔑 Cambiar contraseña</button><button className="btn suave chico" onClick={salir}>Salir</button></div><div className="mute" style={{ marginTop: 8, fontSize: 11 }}>Vortex · versión {VERSION}</div></div>
    </aside>
    <AvisosAgenda />
    <div className="topbar">
      <button className="hamb" onClick={() => setMenu(true)} aria-label="Abrir el menú" aria-expanded={menu}><span /><span /><span /></button>
      <img className="logo-mini" src="/logo.png" alt="Vortex" /><b className="seccion">{seccion}</b>
      <div className="controles">
        {proyectos.length > 1 && <select aria-label="Proyecto" value={proyectoId} onChange={e => { setProyectoId(e.target.value); setZonaId(""); }}><option value="">{perfil.rol === "admin" ? "Todos los proyectos" : "Todos mis proyectos"}</option>{proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>}
        <select aria-label="Zona" value={zonaId} onChange={e => setZonaId(e.target.value)}><option value="">Todas las zonas</option>{zonasVis.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}</select>
        <BuscadorGlobal onElegir={r => { location.hash = "#/" + r; setBusq(x => x + 1); }} />
      </div>
      <div className="acciones">
        <Campana />
        <details className="menu-usuario"><summary>👤 {perfil.nombre || perfil.email} ▾</summary><div className="desplegable"><b>{perfil.nombre || perfil.email}</b><br /><small className="mute">{perfil.email}</small><br /><small className="mute">Rol: {NOMBRE_ROL[perfil.rol] || perfil.rol}</small><div className="fila" style={{ marginTop: 8 }}><button className="btn suave chico" onClick={() => setClaveAbierta(true)}>🔑 Cambiar contraseña</button><button className="btn suave chico" onClick={salir}>Salir</button></div></div></details>
      </div>
    </div>
    {claveAbierta && <CambiarClave onClose={() => setClaveAbierta(false)} onListo={() => setClaveAbierta(false)} />}
    <main key={busq}>{pagina()}</main>
  </AlertasProvider>;
}

const NOMBRE_ROL: Record<string, string> = { admin: "Administrador principal", socio: "Socio", supervisor: "Supervisor técnico", tecnico: "Técnico", cobranzas: "Cobranzas", almacen: "Almacén", financiero: "Financiero" };
/** Campana de la barra superior: cuántas alertas activas hay. */
function Campana() { const { alertas } = useAlertas(); return <a className="campana" href="#/alertas" title="Centro de alertas" aria-label="Centro de alertas">🔔{alertas.length > 0 && <b>{alertas.length}</b>}</a>; }
