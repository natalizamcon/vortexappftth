import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Tabs, Vacio, useAlcance, useQuery } from "../lib/ui";
import { HilosFusiones, Postes, Troncales } from "./RedInfra";
import { PanelRed } from "./RedPanel";
import { CostosFijos, CostosVariables } from "./RedCostos";
import RedNap from "./RedNap";
import { HistorialRed } from "./RedHistorial";
import { MapaRed } from "./RedMapa";
import { BotonesNuevo } from "./NuevoProyectoZona";

export default function Red() {
  const [tab, setTab] = useState(() => { const v = sessionStorage.getItem("vx_tab_red") || "panel"; sessionStorage.removeItem("vx_tab_red"); return v; }), [sub, setSub] = useState("troncales"), [troncalSel, setTroncalSel] = useState("");
  /** Para el panel: ir a una pestaña (y a una sub-pestaña de "Troncales y postes"). */
  const irPanel = (t: string, s?: string) => { setTab(t); if (s) setSub(s); };
  /** Para troncales: abrir los hilos de una troncal concreta. */
  const irTroncal = (t: string, troncal?: string) => { if (t === "hilos") { setTab("troncales"); setSub("hilos"); if (troncal) setTroncalSel(troncal); } else setTab(t); };
  return <>
    <h1>Red</h1>
    <BotonesNuevo />
    <Tabs items={[["panel", "Panel de red"], ["fijos", "Costos fijos"], ["vars", "Costos variables"], ["naps", "Red y NAP"], ["troncales", "Troncales y postes"], ["mapa", "Mapa"], ["hist", "Historial de la red"]]} valor={tab} onChange={setTab} />
    {tab === "panel" && <PanelRed ir={irPanel} />}
    {tab === "fijos" && <CostosFijos />}
    {tab === "vars" && <CostosVariables />}
    {tab === "naps" && <RedNap />}
    {tab === "troncales" && <>
      <div className="subtabs">{[["troncales", "Troncales"], ["hilos", "Hilos y fusiones"], ["postes", "Postes"]].map(([k, l]) => <button key={k} className={sub === k ? "on" : ""} onClick={() => setSub(k)}>{l}</button>)}</div>
      {sub === "troncales" && <Troncales ir={irTroncal} />}
      {sub === "hilos" && <HilosFusiones troncalId={troncalSel} setTroncalId={setTroncalSel} />}
      {sub === "postes" && <Postes />}</>}
    {tab === "mapa" && <MapaRed ir={setTab} />}
    {tab === "hist" && <HistorialRed />}
  </>;
}
