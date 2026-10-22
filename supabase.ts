import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL as URL_CFG, SUPABASE_ANON_KEY as KEY_CFG } from "../config";

// Se usa lo que escribas en src/config.ts; si dejas eso vacío, se usan las variables de Netlify.
export const SUPABASE_URL: string = (URL_CFG.startsWith("PEGA") ? (import.meta as any).env?.VITE_SUPABASE_URL : URL_CFG) || "";
export const SUPABASE_ANON_KEY: string = (KEY_CFG.startsWith("PEGA") ? (import.meta as any).env?.VITE_SUPABASE_ANON_KEY : KEY_CFG) || "";
export const configurado = SUPABASE_URL.startsWith("http") && SUPABASE_ANON_KEY.length > 20;

export const supabase = createClient(configurado ? SUPABASE_URL : "https://sin-configurar.supabase.co", configurado ? SUPABASE_ANON_KEY : "sin-configurar", {
  auth: { persistSession: true, autoRefreshToken: true },
});

/** Cliente aparte para crear usuarios sin cerrar la sesión del administrador. */
export function clienteTemporal() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

/** Sube un archivo a una carpeta privada del proyecto y devuelve su ruta. */
export async function subirArchivo(bucket: "comprobantes" | "fotos", proyectoId: string, file: File): Promise<string> {
  const limpio = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const ruta = `${proyectoId}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${limpio}`;
  const { error } = await supabase.storage.from(bucket).upload(ruta, file, { upsert: false });
  if (error) throw new Error("No se pudo subir el archivo: " + error.message);
  return ruta;
}

export async function urlArchivo(bucket: "comprobantes" | "fotos", ruta: string): Promise<string | null> {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(ruta, 600);
  return data?.signedUrl ?? null;
}
