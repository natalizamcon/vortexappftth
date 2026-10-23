import { useState } from "react";
import { useApp } from "../lib/auth";
import { Tabs } from "../lib/ui";
import { PanelClientes } from "./ClientesPanel";
import { ListaClientes } from "./ClientesLista";
import { Paquetes } from "./ClientesPaquetes";
import { Cobranzas } from "./ClientesCobranzas";
import { Pagos } from "./ClientesPagos";
import { RegistroPagos } from "./ClientesRegistro";
import { BotonesNuevo } from "./NuevoProyectoZona";

/** Clientes: panel, base de datos, paquetes y todo lo de cobranza en un solo lugar. */
export default function Clientes({ inicial }: { inicial?: string }) {
  const { puede } = useApp(), verCob = puede("cobranzas", "ver"), verPagos = puede("pagos", "ver");
  const [tab, setTab] = useState(inicial || sessionStorage.getItem("vx_tab_clientes") || "panel"), [filtro, setFiltro] = useState("");
  sessionStorage.removeItem("vx_tab_clientes");
  const ir = (t: string, f?: string) => { setFiltro(f || ""); setTab(t); };
  const items: [string, string][] = [["panel", "Panel de clientes"], ["lista", "Clientes"], ["paquetes", "Paquetes"], ...(verCob ? [["cobranzas", "Cobranzas"]] as [string, string][] : []), ...(verPagos ? [["pagos", "Pagos"], ["registro", "Registro de pagos"]] as [string, string][] : [])];
  const actual = items.some(([k]) => k === tab) ? tab : "panel";
  return <>
    <h1>Clientes</h1>
    <BotonesNuevo />
    <Tabs items={items} valor={actual} onChange={t => ir(t)} />
    {actual === "panel" && <PanelClientes ir={ir} />}
    {actual === "lista" && <ListaClientes key={filtro} filtroInicial={filtro} />}
    {actual === "paquetes" && <Paquetes />}
    {actual === "cobranzas" && <Cobranzas key={filtro} estadoInicial={filtro} />}
    {actual === "pagos" && <Pagos />}
    {actual === "registro" && <RegistroPagos />}
  </>;
}
