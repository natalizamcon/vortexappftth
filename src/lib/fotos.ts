/** Las 5 fotos que respaldan una instalación. */
export const SLOTS_FOTOS = [
  { k: "equipo", t: "Equipo", ayuda: "El equipo con su etiqueta, donde se vea la MAC, la IP, la serie…" },
  { k: "potencia", t: "Potencia", ayuda: "La potencia que marca el medidor" },
  { k: "punta_caja", t: "Punta del cable · lado de la caja", ayuda: "La punta del cable donde se conecta en la caja (NAP)" },
  { k: "punta_equipo", t: "Punta del cable · lado del equipo", ayuda: "La punta del cable donde se conecta en el equipo del cliente" },
  { k: "final", t: "Cómo queda la instalación", ayuda: "La instalación terminada: cable, equipo y fijación" },
] as const;
export type SlotFoto = (typeof SLOTS_FOTOS)[number]["k"];
export const contarFotos = (fotos: any) => SLOTS_FOTOS.filter(s => fotos && fotos[s.k]).length;
export const faltan = (tiene: (k: string) => boolean) => SLOTS_FOTOS.filter(s => !tiene(s.k)).map(s => s.t);

/** Achica una foto del celular (3–8 MB) a ~300–600 KB para que suba rápido con poca señal. Si no se puede achicar, se sube la original. */
export async function comprimirFoto(file: File, nombre: string, max = 1600, calidad = 0.82): Promise<File> {
  try {
    if (!file.type.startsWith("image/")) return file;
    const url = URL.createObjectURL(file), img: HTMLImageElement = await new Promise((ok, mal) => { const i = new Image(); i.onload = () => ok(i); i.onerror = mal; i.src = url; }); URL.revokeObjectURL(url);
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise(ok => c.toBlob(ok, "image/jpeg", calidad)); if (!blob || blob.size >= file.size) return file.size > 0 && blob && blob.size < file.size ? new File([blob], nombre + ".jpg", { type: "image/jpeg" }) : file;
    return new File([blob], nombre + ".jpg", { type: "image/jpeg" });
  } catch { return file; }
}
