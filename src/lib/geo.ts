/** Lectura de archivos GPS (KML, KMZ, GPX), cálculo de distancias y exportación a KML. No usa librerías externas. */
export type Geo = { tipo: "punto" | "linea" | "poligono"; nombre: string; descripcion?: string; coords: [number, number][] }; // coords = [latitud, longitud]

const valida = (lat: number, lng: number) => isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
const limpiarHtml = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
const hijo = (el: Element, nombre: string) => Array.from(el.children).find(c => c.localName === nombre);
const textoDe = (el: Element, nombre: string) => (hijo(el, nombre)?.textContent || "").trim();
const xml = (texto: string) => { const d = new DOMParser().parseFromString(texto, "text/xml"); if (d.getElementsByTagName("parsererror").length) throw new Error("El archivo no se pudo leer: está dañado o no es un archivo de mapa válido."); return d; };

/** "lng,lat,alt lng,lat,alt …" → [[lat,lng], …] */
const coordsKML = (s: string): [number, number][] => s.split(/\s+/).map(t => t.split(",")).filter(p => p.length >= 2).map(p => [parseFloat(p[1]), parseFloat(p[0])] as [number, number]).filter(c => valida(c[0], c[1]));

export function parseKML(texto: string): Geo[] {
  const d = xml(texto), out: Geo[] = [];
  Array.from(d.getElementsByTagName("Placemark")).forEach(pm => {
    const nombre = textoDe(pm, "name") || "Sin nombre", descripcion = limpiarHtml(textoDe(pm, "description")) || undefined;
    Array.from(pm.getElementsByTagName("Point")).forEach(p => { const c = coordsKML(p.getElementsByTagName("coordinates")[0]?.textContent || ""); if (c.length) out.push({ tipo: "punto", nombre, descripcion, coords: [c[0]] }); });
    Array.from(pm.getElementsByTagName("LineString")).forEach(l => { const c = coordsKML(l.getElementsByTagName("coordinates")[0]?.textContent || ""); if (c.length >= 2) out.push({ tipo: "linea", nombre, descripcion, coords: c }); });
    Array.from(pm.getElementsByTagName("Polygon")).forEach(g => { const anillo = g.getElementsByTagName("outerBoundaryIs")[0]?.getElementsByTagName("coordinates")[0] || g.getElementsByTagName("coordinates")[0]; const c = coordsKML(anillo?.textContent || ""); if (c.length >= 3) out.push({ tipo: "poligono", nombre, descripcion, coords: c }); });
    Array.from(pm.getElementsByTagName("gx:Track")).forEach(t => { const c = Array.from(t.getElementsByTagName("gx:coord")).map(x => (x.textContent || "").trim().split(/\s+/)).filter(p => p.length >= 2).map(p => [parseFloat(p[1]), parseFloat(p[0])] as [number, number]).filter(c => valida(c[0], c[1])); if (c.length >= 2) out.push({ tipo: "linea", nombre, descripcion, coords: c }); });
  });
  return out;
}

export function parseGPX(texto: string): Geo[] {
  const d = xml(texto), out: Geo[] = [], pt = (e: Element): [number, number] => [parseFloat(e.getAttribute("lat") || ""), parseFloat(e.getAttribute("lon") || "")];
  Array.from(d.getElementsByTagName("wpt")).forEach(w => { const c = pt(w); if (valida(c[0], c[1])) out.push({ tipo: "punto", nombre: textoDe(w, "name") || "Punto", descripcion: limpiarHtml(textoDe(w, "desc") || textoDe(w, "cmt")) || undefined, coords: [c] }); });
  Array.from(d.getElementsByTagName("trk")).forEach(t => {
    const base = textoDe(t, "name") || "Recorrido", segs = Array.from(t.getElementsByTagName("trkseg"));
    segs.forEach((s, i) => { const c = Array.from(s.getElementsByTagName("trkpt")).map(pt).filter(x => valida(x[0], x[1])); if (c.length >= 2) out.push({ tipo: "linea", nombre: segs.length > 1 ? `${base} (${i + 1})` : base, coords: c }); });
  });
  Array.from(d.getElementsByTagName("rte")).forEach(r => { const c = Array.from(r.getElementsByTagName("rtept")).map(pt).filter(x => valida(x[0], x[1])); if (c.length >= 2) out.push({ tipo: "linea", nombre: textoDe(r, "name") || "Ruta", coords: c }); });
  return out;
}

/** Un KMZ es un ZIP con un KML adentro. Se abre con lo que ya trae el navegador (sin librerías). */
export async function textoDeKMZ(buf: ArrayBuffer): Promise<string> {
  const v = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder();
  let fin = -1; for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 70000); i--) if (v.getUint32(i, true) === 0x06054b50) { fin = i; break; }
  if (fin < 0) throw new Error("El KMZ está dañado (no es un ZIP válido).");
  const n = v.getUint16(fin + 10, true); let p = v.getUint32(fin + 16, true), kml: { metodo: number; tam: number; off: number; nombre: string } | null = null;
  for (let k = 0; k < n; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const metodo = v.getUint16(p + 10, true), tam = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true), nombre = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    if (/\.kml$/i.test(nombre) && (!kml || /(^|\/)doc\.kml$/i.test(nombre))) kml = { metodo, tam, off, nombre };
    p += 46 + nl + el + cl;
  }
  if (!kml) throw new Error("El KMZ no trae ningún archivo KML.");
  const nl = v.getUint16(kml.off + 26, true), el = v.getUint16(kml.off + 28, true), ini = kml.off + 30 + nl + el, datos = u8.slice(ini, ini + kml.tam);
  if (kml.metodo === 0) return dec.decode(datos);
  if (kml.metodo !== 8) throw new Error("Este KMZ usa una compresión que no se puede leer. Ábrelo en Google Earth y expórtalo de nuevo.");
  if (typeof DecompressionStream === "undefined") throw new Error("Tu navegador es muy antiguo para abrir KMZ. Actualízalo o usa un archivo KML.");
  const buffer = await new Response(new Blob([datos]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer();
  return dec.decode(buffer);
}

/** Lee un archivo KML, KMZ o GPX y devuelve sus puntos, líneas y áreas. */
export async function leerArchivoGeo(archivo: File): Promise<Geo[]> {
  const nombre = archivo.name.toLowerCase();
  const r = nombre.endsWith(".kmz") ? parseKML(await textoDeKMZ(await archivo.arrayBuffer())) : nombre.endsWith(".kml") ? parseKML(await archivo.text()) : nombre.endsWith(".gpx") ? parseGPX(await archivo.text()) : null;
  if (r === null) throw new Error("Solo se pueden abrir archivos KML, KMZ o GPX.");
  if (!r.length) throw new Error("El archivo se leyó bien, pero no trae puntos ni líneas.");
  return r;
}

/** Largo de una línea en metros (suma de tramos). */
export function longitudMetros(c: [number, number][]) {
  const R = 6371008.8, rad = Math.PI / 180; let s = 0;
  for (let i = 1; i < c.length; i++) { const [a, b] = c[i - 1], [d, e] = c[i], dl = (d - a) * rad, dn = (e - b) * rad, h = Math.sin(dl / 2) ** 2 + Math.cos(a * rad) * Math.cos(d * rad) * Math.sin(dn / 2) ** 2; s += 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); }
  return s;
}
export const fmtLong = (m: number) => (m >= 1000 ? (m / 1000).toLocaleString("es-BO", { maximumFractionDigits: 2 }) + " km" : Math.round(m).toLocaleString("es-BO") + " m");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export type CapaKML = { nombre: string; puntos?: { nombre: string; descripcion?: string; lat: number; lng: number }[]; lineas?: { nombre: string; coords: [number, number][] }[] };
/** Arma un archivo KML (se abre en Google Earth y en celulares). */
export function aKML(titulo: string, capas: CapaKML[]): string {
  const carpeta = (c: CapaKML) => `<Folder><name>${esc(c.nombre)}</name>${(c.puntos || []).map(p => `<Placemark><name>${esc(p.nombre)}</name>${p.descripcion ? `<description>${esc(p.descripcion)}</description>` : ""}<Point><coordinates>${p.lng},${p.lat},0</coordinates></Point></Placemark>`).join("")}${(c.lineas || []).map(l => `<Placemark><name>${esc(l.nombre)}</name><LineString><tessellate>1</tessellate><coordinates>${l.coords.map(x => `${x[1]},${x[0]},0`).join(" ")}</coordinates></LineString></Placemark>`).join("")}</Folder>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(titulo)}</name>${capas.filter(c => (c.puntos?.length || 0) + (c.lineas?.length || 0) > 0).map(carpeta).join("")}</Document></kml>`;
}
