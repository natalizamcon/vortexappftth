/** Ubicación precisa: en vez de quedarse con la primera lectura (que puede estar a cientos de metros), el celular sigue midiendo unos segundos y se queda con la más exacta. */
export type Fix = { lat: number; lng: number; precision: number }; // precision = radio de error en metros
export type Medicion = { parar: () => void; primera: Promise<Fix | null>; final: Promise<Fix | null> };

export const calidad = (p?: number | null) => (p == null ? { texto: "sin medir", clase: "warn" } : p <= 15 ? { texto: "precisa", clase: "ok" } : p <= 50 ? { texto: "aceptable", clase: "warn" } : { texto: "poco precisa", clase: "bad" });
export const textoGPS = (f: { lat: number; lng: number }) => `${f.lat.toFixed(6)}, ${f.lng.toFixed(6)}`;

/** Mide hasta "maxMs" milisegundos o hasta lograr "objetivo" metros de precisión. Avisa cada vez que mejora. */
export function medirUbicacion(o: { maxMs?: number; objetivo?: number; alMejorar?: (f: Fix, definitivo: boolean) => void } = {}): Medicion {
  const maxMs = o.maxMs ?? (globalThis as any).__GPS_MAX_MS ?? 25000, objetivo = o.objetivo ?? 12;
  let mejor: Fix | null = null, id: number | null = null, reloj: any = null, cerrado = false, cerrarPrimera: (f: Fix | null) => void = () => {}, cerrarFinal: (f: Fix | null) => void = () => {};
  const primera = new Promise<Fix | null>(r => { cerrarPrimera = r; }), final = new Promise<Fix | null>(r => { cerrarFinal = r; });
  const parar = () => { if (cerrado) return; cerrado = true; if (id !== null) navigator.geolocation.clearWatch(id); clearTimeout(reloj); cerrarPrimera(mejor); cerrarFinal(mejor); if (mejor) o.alMejorar?.(mejor, true); };
  if (!navigator.geolocation) { cerrado = true; cerrarPrimera(null); cerrarFinal(null); return { parar, primera, final }; }
  let primeraEntregada = false;
  id = navigator.geolocation.watchPosition(p => {
    if (cerrado) return;
    const f: Fix = { lat: Math.round(p.coords.latitude * 1e6) / 1e6, lng: Math.round(p.coords.longitude * 1e6) / 1e6, precision: Math.max(1, Math.round(p.coords.accuracy || 9999)) };
    if (!mejor || f.precision < mejor.precision) { mejor = f; o.alMejorar?.(f, false); }
    if (!primeraEntregada) { primeraEntregada = true; cerrarPrimera(mejor); }
    if (mejor.precision <= objetivo) parar();
  }, e => { if (e.code === 1) parar(); /* sin permiso: se termina; otros errores se siguen intentando hasta el tiempo máximo */ }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  reloj = setTimeout(parar, maxMs);
  // si pasan 10 segundos sin ninguna lectura, la "primera" se entrega vacía para no hacer esperar de más
  setTimeout(() => { if (!primeraEntregada) cerrarPrimera(null); }, 10000);
  return { parar, primera, final };
}
