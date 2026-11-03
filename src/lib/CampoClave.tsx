import { useState } from "react";

/** Campo de contraseña con botón para verla u ocultarla. */
export function CampoClave({ l, valor, onChange, auto = "current-password", enter }: { l: string; valor: string; onChange: (v: string) => void; auto?: string; enter?: () => void }) {
  const [ver, setVer] = useState(false);
  return <label className="campo"><span>{l}</span>
    <div style={{ position: "relative" }}><input type={ver ? "text" : "password"} value={valor} autoComplete={auto} style={{ width: "100%", paddingRight: 48 }} onChange={e => onChange(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && enter) { e.preventDefault(); enter(); } }} />
      <button type="button" aria-label={ver ? "Ocultar la contraseña" : "Mostrar la contraseña"} title={ver ? "Ocultar" : "Mostrar"} onClick={() => setVer(x => !x)} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", border: 0, background: "none", cursor: "pointer", fontSize: 18, padding: 6 }}>{ver ? "🙈" : "👁"}</button></div></label>;
}
