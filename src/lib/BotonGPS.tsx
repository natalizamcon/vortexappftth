import { useState } from "react";

/** Toma las coordenadas del celular o la computadora y las entrega como "latitud, longitud". */
export function BotonGPS({ onPunto }: { onPunto: (texto: string) => void }) {
  const [estado, setEstado] = useState<"" | "buscando" | "error">(""), [msg, setMsg] = useState("");
  const pedir = () => {
    if (!navigator.geolocation) { setEstado("error"); return setMsg("Tu navegador no puede dar la ubicación."); }
    setEstado("buscando"); setMsg("");
    navigator.geolocation.getCurrentPosition(p => { onPunto(`${p.coords.latitude.toFixed(6)}, ${p.coords.longitude.toFixed(6)}`); setEstado(""); }, () => { setEstado("error"); setMsg("No se pudo obtener la ubicación. Revisa que el navegador tenga permiso."); }, { enableHighAccuracy: true, timeout: 15000 });
  };
  return <span><button type="button" className="btn suave chico" onClick={pedir} disabled={estado === "buscando"}>{estado === "buscando" ? "Buscando…" : "📍 Usar mi ubicación"}</button>{msg && <small style={{ color: "var(--bad)", marginLeft: 6 }}>{msg}</small>}</span>;
}
