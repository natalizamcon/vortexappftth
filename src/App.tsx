import { useEffect, useState } from "react";
import { useApp } from "./lib/auth";
import { configurado } from "./lib/supabase";
import { Aviso, Cargando } from "./lib/ui";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Zonas from "./pages/Zonas";
import Clientes from "./pages/Clientes";
import Red from "./pages/Red";
import Campo from "./pages/Campo";
import Inventario from "./pages/Inventario";
import Finanzas from "./pages/Finanzas";
import Usuarios from "./pages/Usuarios";
import Papelera from "./pages/Papelera";
import Configuracion from "./pages/Configuracion";
import Alertas from "./pages/Alertas";
import Formularios from "./pages/Formularios";
import Reportes from "./pages/Reportes";
import { AlertasProvider, ContadorAlertas } from "./lib/alertas";

const RUTAS: [string, string, string[] | null][] = [
  ["dashboard", "Dashboard", null], ["red", "Red", null], ["clientes", "Clientes", null], ["alertas", "Alertas", null],
  ["campo", "Mantenimientos y viajes", null], ["inventario", "Inventario", null], ["formularios", "Formularios", null], ["finanzas", "Finanzas", ["admin", "socio", "financiero"]], ["reportes", "Reportes", null], ["configuracion", "Configuración", ["admin"]],
];
const CONFIG = ["configuracion", "zonas", "usuarios", "papelera"];
const useHash = () => { const [h, setH] = useState(location.hash.slice(2) || "dashboard"); useEffect(() => { const f = () => setH(location.hash.slice(2) || "dashboard"); addEventListener("hashchange", f); return () => removeEventListener("hashchange", f); }, []); return h; };

export default function App() {
  const { cargando, sesion, perfil, proyectos, zonas, proyectoId, setProyectoId, zonaId, setZonaId, salir } = useApp();
  const ruta = useHash();
  if (!configurado) return <div className="login"><img src="/logo.png" alt="Vortex" /><Aviso tipo="mal"><b>Falta conectar Supabase.</b> Abre el archivo <code>src/config.ts</code> y pega tu Project URL y tu clave pública (paso 4 de la guía).</Aviso></div>;
  if (cargando) return <div className="login"><img src="/logo.png" alt="Vortex" /><Cargando /></div>;
  if (!sesion) return <Login />;
  if (!perfil || perfil.rol === "pendiente" || !perfil.activo) return <div className="login"><img src="/logo.png" alt="Vortex" /><Aviso>Tu cuenta ({sesion.user.email}) todavía no tiene acceso. Pide al administrador que te asigne un rol y un proyecto.</Aviso><button className="btn suave" onClick={salir}>Salir</button></div>;
  const items = RUTAS.filter(([, , roles]) => !roles || roles.includes(perfil.rol));
  const zonasVis = zonas.filter(z => !proyectoId || z.proyecto_id === proyectoId);
  const pagina = () => {
    switch (ruta) {
      case "configuracion": case "zonas": case "usuarios": case "papelera": return perfil.rol === "admin" ? <Configuracion inicial={ruta === "configuracion" ? undefined : ruta} /> : <Dashboard />;
      case "clientes": case "cobranzas": return <Clientes inicial={ruta === "cobranzas" ? "cobranzas" : undefined} />; case "red": return <Red />;
      case "campo": return <Campo />; case "inventario": return <Inventario />; case "finanzas": return <Finanzas />; case "alertas": return <Alertas />; case "formularios": return <Formularios />; case "reportes": return <Reportes />;
      default: return <Dashboard />;
    }
  };
  return <AlertasProvider>
    <header className="topnav"><div className="fila"><img src="/logo.png" alt="Vortex, internet de fibra óptica" /><nav className="nav">{items.map(([k, l]) => <a key={k} href={"#/" + k} className={ruta === k || (k === "clientes" && ruta === "cobranzas") || (k === "configuracion" && CONFIG.includes(ruta)) ? "on" : ""}>{l}{k === "alertas" && <ContadorAlertas />}</a>)}</nav></div></header>
    <div className="barra">
      {proyectos.length > 1 && <select aria-label="Proyecto" value={proyectoId} onChange={e => { setProyectoId(e.target.value); setZonaId(""); }}><option value="">{perfil.rol === "admin" ? "Todos los espacios" : "Todos mis espacios"}</option>{proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select>}
      <select aria-label="Zona" value={zonaId} onChange={e => setZonaId(e.target.value)}><option value="">Todas las zonas</option>{zonasVis.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}</select>
      <span className="mute" style={{ marginLeft: "auto" }}>{perfil.nombre || perfil.email} · {perfil.rol}</span><button className="btn suave chico" onClick={salir}>Salir</button>
    </div>
    <main>{pagina()}</main>
  </AlertasProvider>;
}
