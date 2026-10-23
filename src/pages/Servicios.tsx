import { useState } from "react";
import { Tabs } from "../lib/ui";
import { BotonesNuevo } from "./NuevoProyectoZona";
import { PanelOperativo } from "./ServiciosPanel";
import { Instalaciones } from "./ServiciosInstalaciones";
import { Bajas } from "./ServiciosBajas";
import { Mantenimientos } from "./ServiciosMantenimientos";
import { Instaladores } from "./ServiciosInstaladores";
import { AvanceViajes } from "./ServiciosAvance";

/** Acción que el panel o una orden de trabajo le pide a otra pestaña (por ejemplo: abrir el formulario de nueva instalación). */
export type Accion = { nueva?: boolean; orden?: any; ts: number } | null;

export default function Servicios({ inicial }: { inicial?: string }) {
  const [tab, setTab] = useState(inicial || "panel"), [accion, setAccion] = useState<Accion>(null), [filtro, setFiltro] = useState("");
  const ir = (t: string, a?: { nueva?: boolean; orden?: any }, f?: string) => { setFiltro(f || ""); setAccion(a ? { ...a, ts: Date.now() } : null); setTab(t); };
  return <>
    <BotonesNuevo />
    <Tabs items={[["panel", "Panel operativo"], ["instalaciones", "Instalaciones"], ["bajas", "Bajas"], ["mantenimientos", "Mantenimientos"], ["instaladores", "Instaladores"], ["avance", "Avance y viajes"]]} valor={tab} onChange={t => ir(t)} />
    {tab === "panel" && <PanelOperativo ir={ir} filtroInicial={filtro} />}
    {tab === "instalaciones" && <Instalaciones accion={accion} />}
    {tab === "bajas" && <Bajas accion={accion} />}
    {tab === "mantenimientos" && <Mantenimientos accion={accion} />}
    {tab === "instaladores" && <Instaladores />}
    {tab === "avance" && <AvanceViajes />}
  </>;
}
