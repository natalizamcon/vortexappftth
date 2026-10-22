import { useEffect, useState } from "react";
import { Tabs } from "../lib/ui";
import Zonas from "./Zonas";
import Usuarios from "./Usuarios";
import Papelera from "./Papelera";

/** Configuración (solo administrador): zonas, usuarios y papelera, juntos. */
export default function Configuracion({ inicial }: { inicial?: string }) {
  const [tab, setTab] = useState(inicial || "zonas");
  useEffect(() => { if (inicial) setTab(inicial); }, [inicial]);
  return <div className="cfg">
    <h1 style={{ display: "block" }}>Configuración</h1>
    <Tabs items={[["zonas", "Zonas"], ["usuarios", "Usuarios y socios"], ["papelera", "Papelera"]]} valor={tab} onChange={setTab} />
    {tab === "zonas" && <Zonas />}{tab === "usuarios" && <Usuarios />}{tab === "papelera" && <Papelera />}
  </div>;
}
