import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Tabs, Vacio, useAlcance, useQuery } from "../lib/ui";
import { HilosFusiones, Postes, Troncales } from "./RedInfra";
import { PanelRed } from "./RedPanel";
import { CostosFijos, CostosVariables } from "./RedCostos";
import RedNap from "./RedNap";
import { HistorialRed } from "./RedHistorial";
import { BotonesNuevo } from "./NuevoProyectoZona";

/** Mapa de la red (provisional): lista de puntos con coordenadas y enlace a Google Maps. El mapa interactivo se agrega al final. */
function MapaProvisional() {
  const { zonas, zonaId, proyectoId } = useApp(), al = useAlcance(), zona = zonas.find(z => z.id === zonaId);
  const naps = useQuery(() => al(supabase.from("naps").select("codigo, tipo, lat, lng, zona_id").not("lat", "is", null).order("codigo")), [proyectoId, zonaId]);
  const postes = useQuery(() => al(supabase.from("postes").select("codigo, tipo, lat, lng, zona_id").not("lat", "is", null).order("codigo")), [proyectoId, zonaId]);
  const P = [...(((naps.data as any[]) || []).map(x => ({ ...x, capa: "NAP" }))), ...(((postes.data as any[]) || []).map(x => ({ ...x, capa: "Poste" })))];
  const nz = (id: string) => zonas.find(z => z.id === id)?.nombre || "";
  return <div className="card tw"><h2>Mapa de la red{zona ? " · zona " + zona.nombre : ""}</h2>
    <Aviso>El mapa interactivo (capas de troncales, postes, empalmes, NAP y clientes, con archivos KML/KMZ/GPX) se agrega en la última etapa. Por ahora, aquí están los puntos de la red que ya tienen coordenadas, con un enlace para abrirlos en Google Maps.</Aviso>
    {P.length ? <table><thead><tr><th>Capa</th><th>Código</th>{!zona && <th>Zona</th>}<th>Coordenadas</th><th /></tr></thead>
      <tbody>{P.map((x, i) => <tr key={i}><td><span className="pill acc">{x.capa}</span></td><td><b>{x.codigo}</b>{x.tipo && <small className="mute"> · {x.tipo}</small>}</td>{!zona && <td>{nz(x.zona_id)}</td>}<td>{x.lat}, {x.lng}</td><td><a href={`https://www.google.com/maps?q=${x.lat},${x.lng}`} target="_blank" rel="noreferrer">Abrir en Google Maps</a></td></tr>)}</tbody></table>
      : <Vacio>Todavía no hay NAP ni postes con coordenadas. Agrégalas al editar la NAP o al registrar un poste.</Vacio>}</div>;
}

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
    {tab === "mapa" && <MapaProvisional />}
    {tab === "hist" && <HistorialRed />}
  </>;
}
