import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Aviso } from "../lib/ui";

export default function Login() {
  const [email, setEmail] = useState(""), [clave, setClave] = useState(""), [error, setError] = useState(""), [cargando, setCargando] = useState(false);
  const entrar = async (e: React.FormEvent) => {
    e.preventDefault(); setCargando(true); setError("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: clave });
    if (error) setError(error.message.includes("Invalid") ? "Correo o contraseña incorrectos." : error.message);
    setCargando(false);
  };
  return <div className="login"><img src="/logo.png" alt="Vortex, internet de fibra óptica" />
    <form className="card" onSubmit={entrar}><h2>Ingresar</h2>{error && <Aviso tipo="mal">{error}</Aviso>}
      <label className="campo"><span>Correo</span><input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" /></label>
      <label className="campo"><span>Contraseña</span><input type="password" required value={clave} onChange={e => setClave(e.target.value)} autoComplete="current-password" /></label>
      <button className="btn" style={{ width: "100%" }} disabled={cargando}>{cargando ? "Entrando…" : "Entrar"}</button></form></div>;
}
