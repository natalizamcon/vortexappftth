import { useState } from "react";
import { supabase, subirArchivo, urlArchivo } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Tabs, Vacio, bs, hoy, useAlcance, useQuery } from "../lib/ui";
import Crud from "../lib/crud";
import { aPapelera } from "../lib/papelera";
import { Presupuesto, PresupuestoVsReal } from "./Presupuesto";
import Simulador from "./Simulador";
import Compras from "./Compras";
import { IngresosGastos, Rentabilidad } from "./FinanzasPanel";
import { CajaFondos, CostosCompartidos, GastosEmpresa, MiReparto } from "./FinanzasReparto";
import { PagosPersonal } from "./FinanzasPersonal";
import { Inversores } from "./FinanzasInversores";
import { BannerFondo, FondoInversion } from "./FinanzasFondo";
import { SociosFinanzas } from "./FinanzasSocios";

/** Finanzas ordenada en carpetas: cada carpeta agrupa lo que va junto. */
export default function Finanzas() {
  const { perfil } = useApp(), admin = perfil?.rol === "admin";
  const socio = perfil?.rol === "socio", par = (x: [string, string][], si: boolean) => (si ? x : []);
  const carpetas: [string, string, [string, string][]][] = [
    ["panel", "Panel", [["rent", "Rentabilidad"], ["mov", "Ingresos y gastos"]]],
    ["inv", "Inversores y fondos", [["inv", "Inversores"], ["fondo", "Fondo de inversión"], ...par([["soc", "Socios"], ["fon", "Caja y fondos"]], admin), ...par([["mi", "Mi reparto"]], socio)]],
    ["sim", "Simulador y presupuesto", [["sim", "Simulador de proyecto"], ["pre", "Presupuesto de la zona"], ["vs", "Presupuesto vs real"]]],
    ["costos", "Costos y compras", [...par([["comp", "Costos compartidos"], ["emp", "Gastos de la empresa"], ["compras", "Compras de la empresa"]], admin), ["per", "Pagos al personal"]]],
  ];
  const [c, setC] = useState("panel"), [subs, setSubs] = useState<Record<string, string>>({});
  const carpeta = carpetas.find(x => x[0] === c) || carpetas[0], sub = subs[carpeta[0]] || carpeta[2][0][0], clave = carpeta[0] + ":" + sub;
  return <>
    <h1>Finanzas</h1>
    <Tabs items={carpetas.map(x => [x[0], x[1]] as [string, string])} valor={carpeta[0]} onChange={setC} />
    <BannerFondo onVer={() => { setC("inv"); setSubs({ ...subs, inv: "fondo" }); }} />
    {carpeta[2].length > 1 && <div className="subtabs">{carpeta[2].map(([k, l]) => <button key={k} className={sub === k ? "on" : ""} onClick={() => setSubs({ ...subs, [carpeta[0]]: k })}>{l}</button>)}</div>}
    {clave === "panel:rent" && <Rentabilidad />}
    {clave === "panel:mov" && <IngresosGastos />}
    {clave === "inv:inv" && <Inversores />}
    {clave === "inv:fondo" && <FondoInversion />}
    {clave === "inv:soc" && <SociosFinanzas />}
    {clave === "inv:fon" && <CajaFondos />}
    {clave === "inv:mi" && <MiReparto />}
    {clave === "sim:sim" && <Simulador />}
    {clave === "sim:pre" && <Presupuesto />}
    {clave === "sim:vs" && <PresupuestoVsReal />}
    {clave === "costos:comp" && <CostosCompartidos />}
    {clave === "costos:emp" && <GastosEmpresa />}
    {clave === "costos:compras" && <Compras />}
    {clave === "costos:per" && <PagosPersonal />}
  </>;
}

