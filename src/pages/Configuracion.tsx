import { useEffect, useState } from "react";
import { Tabs } from "../lib/ui";
import { ConfigUsuarios } from "./ConfigUsuarios";
import { ConfigRoles } from "./ConfigRoles";
import { ConfigSocios } from "./ConfigSocios";
import Zonas from "./Zonas";
import Papelera from "./Papelera";

/** Configuración (solo administrador): usuarios, roles y permisos, socios y proyectos, zonas y papelera. */
export default function Configuracion({ inicial }: { inicial?: string }) {
  const [tab, setTab] = useState(inicial || "usuarios");
  useEffect(() => { if (inicial) setTab(inicial); }, [inicial]);
  return <div className="cfg">
    <h1 style={{ display: "block" }}>Configuración</h1>
    <Tabs items={[["usuarios", "Usuarios"], ["roles", "Roles y permisos"], ["socios", "Socios y proyectos"], ["zonas", "Zonas"], ["papelera", "Papelera"]]} valor={tab} onChange={setTab} />
    {tab === "usuarios" && <ConfigUsuarios />}{tab === "roles" && <ConfigRoles />}{tab === "socios" && <ConfigSocios />}{tab === "zonas" && <Zonas />}{tab === "papelera" && <Papelera />}
  </div>;
}
