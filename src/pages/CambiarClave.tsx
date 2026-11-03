import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Modal } from "../lib/ui";
import { CampoClave } from "../lib/CampoClave";

/** Cambiar la contraseña. Dentro de la app pide la actual; si se entró desde el enlace del correo (recuperación) no la pide. */
export function CambiarClave({ recuperacion = false, onClose, onListo }: { recuperacion?: boolean; onClose?: () => void; onListo: () => void }) {
  const { perfil, sesion } = useApp();
  const [actual, setActual] = useState(""), [nueva, setNueva] = useState(""), [repite, setRepite] = useState(""), [msg, setMsg] = useState(""), [ok, setOk] = useState(false), [ocup, setOcup] = useState(false);
  const guardar = async () => {
    setMsg(""); if (nueva.length < 6) return setMsg("La nueva contraseña debe tener al menos 6 caracteres."); if (nueva !== repite) return setMsg("Las dos contraseñas nuevas no coinciden.");
    if (!recuperacion && !actual) return setMsg("Escribe tu contraseña actual.");
    setOcup(true);
    try {
      if (!recuperacion) { const { error: e0 } = await supabase.auth.signInWithPassword({ email: perfil?.email || sesion?.user?.email, password: actual }); if (e0) throw new Error("La contraseña actual no es correcta."); }
      const { error } = await supabase.auth.updateUser({ password: nueva }); if (error) throw new Error(/same|different/i.test(error.message) ? "La nueva contraseña debe ser distinta a la anterior." : error.message);
      setOk(true); setTimeout(onListo, recuperacion ? 1200 : 1500);
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  const cuerpo = <>
    {recuperacion && <p style={{ marginTop: 0 }}>Escribe tu <b>nueva contraseña</b> para volver a entrar.</p>}
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">✅ Contraseña cambiada.{recuperacion ? " Entrando…" : ""}</Aviso>}
    {!recuperacion && <CampoClave l="Contraseña actual" valor={actual} onChange={setActual} />}
    <CampoClave l="Nueva contraseña (mínimo 6 caracteres)" valor={nueva} onChange={setNueva} auto="new-password" />
    <CampoClave l="Repite la nueva contraseña" valor={repite} onChange={setRepite} auto="new-password" enter={guardar} />
    <button className="btn" style={{ width: "100%", marginTop: 8 }} disabled={ocup || ok} onClick={guardar}>{ocup ? "Guardando…" : "Guardar contraseña"}</button></>;
  if (recuperacion) return <div className="login"><img src="/logo.png" alt="Vortex, internet de fibra óptica" /><div className="card"><h2>Nueva contraseña</h2>{cuerpo}</div></div>;
  return <Modal titulo="Cambiar mi contraseña" onClose={onClose || (() => {})} ancho={420}>{cuerpo}</Modal>;
}
