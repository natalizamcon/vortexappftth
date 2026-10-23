import { supabase } from "./supabase";

export type TipoFoto = "etiqueta_equipo" | "comprobante" | "potencia" | "carnet";
export type ResultadoFoto = { ok: boolean; datos?: any; error?: string; configurar?: boolean };

/** Reduce la foto (máximo 1600 px de lado) para que suba rápido, incluso con datos móviles. */
export async function reducirImagen(archivo: File, max = 1600): Promise<{ base64: string; mime: string }> {
  let fuente: ImageBitmap | HTMLImageElement;
  try { fuente = await createImageBitmap(archivo, { imageOrientation: "from-image" } as any); }
  catch { fuente = await new Promise<HTMLImageElement>((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => mal(new Error("No se pudo abrir la foto.")); i.src = URL.createObjectURL(archivo); }); }
  const w = (fuente as any).width as number, h = (fuente as any).height as number, k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
  const g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(fuente as any, 0, 0, c.width, c.height);
  return { base64: c.toDataURL("image/jpeg", 0.85).split(",")[1], mime: "image/jpeg" };
}

/** Manda la foto a la función de Netlify, que la lee con IA y devuelve los datos. Nunca guarda nada: solo propone. */
export async function leerFoto(archivo: File, tipo: TipoFoto): Promise<ResultadoFoto> {
  try {
    if (!archivo.type.startsWith("image/")) return { ok: false, error: "Elige una foto (JPG, PNG o WEBP)." };
    const { base64, mime } = await reducirImagen(archivo);
    const { data } = await supabase.auth.getSession(), token = data.session?.access_token;
    if (!token) return { ok: false, error: "Tu sesión venció. Vuelve a entrar." };
    const res = await fetch((globalThis as any).__URL_LEER_FOTO || "/.netlify/functions/leer-foto", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token }, body: JSON.stringify({ tipo, imagen: base64, mime }) });
    if (res.status === 404) return { ok: false, configurar: true, error: "La lectura con IA solo funciona en el sitio publicado en Netlify (no en la versión de prueba)." };
    let j: any = null; try { j = await res.json(); } catch { /* sin cuerpo */ }
    if (!res.ok) return { ok: false, configurar: j?.error === "configuracion", error: j?.detalle || "No se pudo leer la foto." };
    return { ok: true, datos: j.datos };
  } catch (e: any) { return { ok: false, error: e?.message || "No se pudo leer la foto." }; }
}
