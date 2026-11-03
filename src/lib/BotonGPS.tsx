import { useEffect, useRef, useState } from "react";
import { Fix, Medicion, calidad, medirUbicacion, textoGPS } from "./gps";

/** Toma las coordenadas del celular con la mejor precisión posible y las entrega como "latitud, longitud". */
export function BotonGPS({ onPunto }: { onPunto: (texto: string) => void }) {
  const [midiendo, setMidiendo] = useState(false), [fix, setFix] = useState<Fix | null>(null), [msg, setMsg] = useState(""), run = useRef<Medicion | null>(null), cb = useRef(onPunto); cb.current = onPunto;
  useEffect(() => () => run.current?.parar(), []);
  const pedir = async () => {
    run.current?.parar(); setMsg(""); setFix(null); setMidiendo(true);
    const m = medirUbicacion({ alMejorar: f => { setFix(f); cb.current(textoGPS(f)); } }); run.current = m;
    const r = await m.final; setMidiendo(false);
    if (!r) setMsg("No se pudo obtener la ubicación. Revisa que el navegador tenga permiso y que la ubicación del celular esté en \"precisa\".");
  };
  const q = calidad(fix?.precision);
  return <span><button type="button" className="btn suave chico" onClick={pedir} disabled={midiendo}>{midiendo ? "Midiendo…" : fix ? "📍 Volver a medir" : "📍 Usar mi ubicación"}</button>
    {fix && <span className={"pill " + q.clase} style={{ marginLeft: 6 }}>±{fix.precision} m · {midiendo ? "mejorando…" : q.texto}</span>}
    {fix && !midiendo && fix.precision > 50 && <small className="mute" style={{ marginLeft: 6 }}>Para más precisión sal a la calle, espera unos segundos y vuelve a medir.</small>}
    {msg && <small style={{ color: "var(--bad)", marginLeft: 6 }}>{msg}</small>}</span>;
}
