import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Aviso } from "../lib/ui";
import { CampoClave } from "../lib/CampoClave";
import { VERSION } from "../version";

export default function Login() {
  const [email, setEmail] = useState(""), [clave, setClave] = useState(""), [error, setError] = useState(""), [ok, setOk] = useState(""), [cargando, setCargando] = useState(false), [olvide, setOlvide] = useState(false);
  const entrar = async (e: React.FormEvent) => {
    e.preventDefault(); setCargando(true); setError(""); setOk("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: clave });
    if (error) setError(error.message.includes("Invalid") ? "Correo o contraseña incorrectos." : error.message);
    setCargando(false);
  };
  const enviarEnlace = async (e: React.FormEvent) => {
    e.preventDefault(); setError(""); setOk(""); if (!email.trim()) return setError("Escribe tu correo."); setCargando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin });
    setCargando(false);
    if (error) setError(/rate limit|seconds/i.test(error.message) ? "Se pidieron demasiados correos seguidos. Espera unos minutos e inténtalo de nuevo." : error.message);
    else setOk("Si ese correo está registrado, te enviamos un enlace para crear una contraseña nueva. Revisa tu bandeja de entrada y también la carpeta de spam.");
  };
  return <div className="login"><img src="/logo.png" alt="Vortex, internet de fibra óptica" />
    {!olvide ? <form className="card" onSubmit={entrar}><h2>Ingresar</h2>{error && <Aviso tipo="mal">{error}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
      <label className="campo"><span>Correo</span><input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" /></label>
      <CampoClave l="Contraseña" valor={clave} onChange={setClave} />
      <button className="btn" style={{ width: "100%" }} disabled={cargando}>{cargando ? "Entrando…" : "Entrar"}</button>
      <p style={{ textAlign: "center", margin: "10px 0 0" }}><a href="#" onClick={e => { e.preventDefault(); setError(""); setOk(""); setOlvide(true); }}>¿Olvidaste tu contraseña?</a></p></form>
    : <form className="card" onSubmit={enviarEnlace}><h2>Recuperar mi contraseña</h2>{error && <Aviso tipo="mal">{error}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
      <p className="mute" style={{ marginTop: 0 }}>Escribe tu correo y te enviamos un enlace para crear una contraseña nueva.</p>
      <label className="campo"><span>Correo</span><input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" /></label>
      <button className="btn" style={{ width: "100%" }} disabled={cargando}>{cargando ? "Enviando…" : "Enviarme el enlace"}</button>
      <p style={{ textAlign: "center", margin: "10px 0 0" }}><a href="#" onClick={e => { e.preventDefault(); setError(""); setOk(""); setOlvide(false); }}>← Volver a ingresar</a></p></form>}
    <p className="mute" style={{ textAlign: "center", fontSize: 11 }}>Vortex · versión {VERSION}</p></div>;
}
