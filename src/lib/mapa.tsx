import { ReactNode, useEffect, useRef, useState } from "react";

export type PuntoMapa = { id: string; lat: number; lng: number; color: string; radio?: number; titulo: string; detalle?: ReactNode; capa: string };
export type LineaMapa = { id: string; coords: [number, number][]; color: string; ancho?: number; titulo: string; detalle?: ReactNode; capa: string; poligono?: boolean };
type Vista = { x: number; y: number; z: number };

const T = 256, ZMIN = 3, ZMAX = 19;
const LIM = 85.0511;
/** Proyección Web Mercator: longitud/latitud ↔ posición del 0 al 1 dentro del mapa del mundo. */
export const nx = (lng: number) => (lng + 180) / 360;
export const ny = (lat: number) => { const s = Math.sin((Math.max(-LIM, Math.min(LIM, lat)) * Math.PI) / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
export const lngDe = (x: number) => x * 360 - 180;
export const latDe = (y: number) => { const k = Math.PI - 2 * Math.PI * y; return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(k) - Math.exp(-k))); };
/** Qué azulejo (columna, fila) cubre un punto en un nivel de zoom. */
export const azulejoDe = (lat: number, lng: number, z: number) => [Math.floor(nx(lng) * 2 ** z), Math.floor(ny(lat) * 2 ** z)] as [number, number];

const BASES: Record<string, { url: (z: number, x: number, y: number) => string; texto: string }> = {
  calle: { url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, texto: "© OpenStreetMap" },
  satelite: { url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, texto: "Imagen © Esri" },
};

type Props = { puntos: PuntoMapa[]; lineas: LineaMapa[]; base?: "calle" | "satelite"; alto?: number; ajustar?: number; onClickMapa?: (lat: number, lng: number) => void; usuario?: { lat: number; lng: number } | null; marca?: { lat: number; lng: number } | null; irA?: { lat: number; lng: number; z?: number; k: number } | null };

/** Mapa interactivo: arrastrar, zoom con rueda o pellizco, puntos, líneas y ventana de información al tocar. */
export function MapaBase({ puntos, lineas, base = "calle", alto = 520, ajustar = 0, onClickMapa, usuario, marca, irA }: Props) {
  const caja = useRef<HTMLDivElement>(null), [tam, setTam] = useState({ w: 800, h: alto }), [v, setV] = useState<Vista>({ x: nx(-66.157), y: ny(-17.393), z: 12 });
  const [sel, setSel] = useState<{ tipo: "p" | "l"; id: string; px: number; py: number } | null>(null);
  const punteros = useRef(new Map<number, { x: number; y: number }>()), mov = useRef(0), pinch = useRef<number | null>(null), ultimaRueda = useRef(0);
  const vRef = useRef(v); vRef.current = v;
  const mundo = T * 2 ** v.z, izq = v.x * mundo - tam.w / 2, arr = v.y * mundo - tam.h / 2;
  const aPx = (lat: number, lng: number): [number, number] => [nx(lng) * mundo - izq, ny(lat) * mundo - arr];

  useEffect(() => { const el = caja.current!; const f = () => setTam({ w: el.clientWidth, h: el.clientHeight }); f(); const ro = new ResizeObserver(f); ro.observe(el); return () => ro.disconnect(); }, []);

  /** Ajusta el mapa para que se vea todo lo que hay (puntos y líneas). */
  const ajustarTodo = () => {
    const pts: [number, number][] = [...puntos.map(p => [p.lat, p.lng] as [number, number]), ...lineas.flatMap(l => l.coords)];
    if (!pts.length) return;
    const lats = pts.map(p => p[0]), lngs = pts.map(p => p[1]), a = Math.min(...lats), b = Math.max(...lats), c = Math.min(...lngs), d = Math.max(...lngs);
    const w = Math.max(200, tam.w - 90), h = Math.max(200, tam.h - 90); let z = ZMAX;
    if (pts.length === 1 || (a === b && c === d)) z = 16; else for (z = ZMAX; z > ZMIN; z--) { if ((nx(d) - nx(c)) * T * 2 ** z <= w && (ny(a) - ny(b)) * T * 2 ** z <= h) break; }
    setV({ x: (nx(c) + nx(d)) / 2, y: (ny(a) + ny(b)) / 2, z: Math.min(z, 17) }); setSel(null);
  };
  useEffect(() => { if (ajustar) ajustarTodo(); }, [ajustar]);
  useEffect(() => { if (irA) { setV({ x: nx(irA.lng), y: ny(irA.lat), z: irA.z || 17 }); setSel(null); } }, [irA?.k]);

  const zoomEn = (dz: number, cx: number, cy: number) => {
    const a = vRef.current, z2 = Math.max(ZMIN, Math.min(ZMAX, a.z + dz)); if (z2 === a.z) return;
    const m1 = T * 2 ** a.z, m2 = T * 2 ** z2, wx = (a.x * m1 - tam.w / 2 + cx) / m1, wy = (a.y * m1 - tam.h / 2 + cy) / m1;
    setV({ x: wx - (cx - tam.w / 2) / m2, y: wy - (cy - tam.h / 2) / m2, z: z2 }); setSel(null);
  };
  useEffect(() => { // la rueda necesita escucharse sin "passive" para poder frenar el desplazamiento de la página
    const el = caja.current!; const f = (e: WheelEvent) => { e.preventDefault(); const ahora = Date.now(); if (ahora - ultimaRueda.current < 180) return; ultimaRueda.current = ahora; const r = el.getBoundingClientRect(); zoomEn(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top); };
    el.addEventListener("wheel", f, { passive: false }); return () => el.removeEventListener("wheel", f);
  }, [tam.w, tam.h]);

  const abajo = (e: React.PointerEvent) => { caja.current!.setPointerCapture(e.pointerId); punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); mov.current = 0; if (punteros.current.size === 2) { const [a, b] = [...punteros.current.values()]; pinch.current = Math.hypot(a.x - b.x, a.y - b.y); } };
  const mueve = (e: React.PointerEvent) => {
    const p = punteros.current.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; punteros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (punteros.current.size === 2 && pinch.current) {
      const [a, b] = [...punteros.current.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = caja.current!.getBoundingClientRect();
      if (d / pinch.current > 1.35) { zoomEn(1, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); pinch.current = d; } else if (d / pinch.current < 0.74) { zoomEn(-1, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); pinch.current = d; }
      mov.current += 10; return;
    }
    mov.current += Math.abs(dx) + Math.abs(dy);
    if (mov.current > 3) { const a = vRef.current, m = T * 2 ** a.z; setV({ ...a, x: a.x - dx / m, y: Math.max(0, Math.min(1, a.y - dy / m)) }); }
  };
  const arriba = (e: React.PointerEvent) => {
    const hubo = punteros.current.has(e.pointerId); punteros.current.delete(e.pointerId); if (punteros.current.size < 2) pinch.current = null;
    if (hubo && mov.current <= 3 && punteros.current.size === 0) { // fue un toque, no un arrastre
      const r = caja.current!.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top, m = T * 2 ** vRef.current.z;
      setSel(null); onClickMapa?.(latDe((arr + cy) / m), lngDe((izq + cx) / m));
    }
  };

  const colX0 = Math.floor(izq / T), colX1 = Math.floor((izq + tam.w) / T), filaY0 = Math.max(0, Math.floor(arr / T)), filaY1 = Math.min(2 ** v.z - 1, Math.floor((arr + tam.h) / T)), n = 2 ** v.z;
  const azulejos: { k: string; src: string; left: number; top: number }[] = [];
  for (let y = filaY0; y <= filaY1; y++) for (let x = colX0; x <= colX1; x++) azulejos.push({ k: `${v.z}/${x}/${y}`, src: BASES[base].url(v.z, ((x % n) + n) % n, y), left: x * T - izq, top: y * T - arr });
  const visible = (px: number, py: number, m = 30) => px > -m && py > -m && px < tam.w + m && py < tam.h + m;
  const ptsVis = puntos.map(p => ({ p, xy: aPx(p.lat, p.lng) })).filter(o => visible(o.xy[0], o.xy[1]));
  const tarjeta = sel && (sel.tipo === "p" ? puntos.find(p => p.id === sel.id) : lineas.find(l => l.id === sel.id));
  const estilo = { position: "absolute" as const, border: "1px solid var(--line)", background: "#fff", borderRadius: 8, boxShadow: "0 2px 8px #0003", width: 34, height: 34, fontSize: 18, cursor: "pointer", color: "#222" };

  return <div ref={caja} className="mapa-base" role="application" aria-label="Mapa" style={{ position: "relative", height: alto, overflow: "hidden", background: "#dfe3ea", touchAction: "none", cursor: "grab", userSelect: "none", borderRadius: 10 }}
    onPointerDown={abajo} onPointerMove={mueve} onPointerUp={arriba} onPointerCancel={arriba} onDoubleClick={e => { const r = caja.current!.getBoundingClientRect(); zoomEn(1, e.clientX - r.left, e.clientY - r.top); }}>
    {azulejos.map(t => <img key={t.k} src={t.src} alt="" draggable={false} referrerPolicy="no-referrer" onError={e => { e.currentTarget.style.visibility = "hidden"; }} style={{ position: "absolute", left: t.left, top: t.top, width: T, height: T, pointerEvents: "none" }} />)}
    <svg width={tam.w} height={tam.h} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }}>
      {lineas.map(l => {
        const ps = l.coords.map(c => aPx(c[0], c[1])); if (!ps.length) return null;
        let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const q of ps) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
        if (x1 < 0 || x0 > tam.w || y1 < 0 || y0 > tam.h) return null;
        const pts = ps.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" "), clic = (e: React.MouseEvent) => { e.stopPropagation(); const r = caja.current!.getBoundingClientRect(); setSel({ tipo: "l", id: l.id, px: e.clientX - r.left, py: e.clientY - r.top }); };
        return l.poligono ? <g key={l.id}><polygon points={pts} fill={l.color} fillOpacity={0.15} stroke={l.color} strokeWidth={l.ancho || 3} style={{ pointerEvents: "all", cursor: "pointer" }} onClick={clic} onPointerDown={e => e.stopPropagation()} /></g>
          : <g key={l.id}><polyline points={pts} fill="none" stroke={l.color} strokeWidth={l.ancho || 4} strokeLinejoin="round" strokeLinecap="round" opacity={0.9} /><polyline className="mapa-linea" data-id={l.id} points={pts} fill="none" stroke="transparent" strokeWidth={14} style={{ pointerEvents: "stroke", cursor: "pointer" }} onClick={clic} onPointerDown={e => e.stopPropagation()} /></g>;
      })}
    </svg>
    {ptsVis.map(({ p, xy }) => { const r = p.radio || 7; return <div key={p.id} className="mapa-punto" data-id={p.id} data-capa={p.capa} title={p.titulo} onPointerDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); setSel({ tipo: "p", id: p.id, px: xy[0], py: xy[1] }); }}
      style={{ position: "absolute", left: xy[0] - r, top: xy[1] - r, width: r * 2, height: r * 2, borderRadius: "50%", background: p.color, border: "2px solid #fff", boxShadow: "0 0 0 1px #0004", cursor: "pointer" }} />; })}
    {usuario && (() => { const [px, py] = aPx(usuario.lat, usuario.lng); return visible(px, py) ? <div title="Tu ubicación" style={{ position: "absolute", left: px - 9, top: py - 9, width: 18, height: 18, borderRadius: "50%", background: "#1a73e8", border: "3px solid #fff", boxShadow: "0 0 0 2px #1a73e855" }} /> : null; })()}
    {marca && (() => { const [px, py] = aPx(marca.lat, marca.lng); return visible(px, py) ? <div title="Punto elegido" style={{ position: "absolute", left: px - 8, top: py - 8, width: 16, height: 16, borderRadius: 3, background: "#e11d48", border: "2px solid #fff", transform: "rotate(45deg)" }} /> : null; })()}
    {tarjeta && sel && <div onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()} style={{ position: "absolute", left: Math.max(8, Math.min(tam.w - 268, sel.px - 130)), top: Math.max(8, Math.min(tam.h - 150, sel.py - 130)), width: 260, background: "#fff", borderRadius: 10, boxShadow: "0 4px 16px #0004", padding: 10, cursor: "default", fontSize: 13, maxHeight: 220, overflow: "auto" }}>
      <div className="fila entre"><b>{tarjeta.titulo}</b><button className="btn suave chico" onClick={() => setSel(null)} aria-label="Cerrar">✕</button></div>{tarjeta.detalle}</div>}
    <button style={{ ...estilo, right: 8, top: 8 }} aria-label="Acercar" onPointerDown={e => e.stopPropagation()} onClick={() => zoomEn(1, tam.w / 2, tam.h / 2)}>+</button>
    <button style={{ ...estilo, right: 8, top: 46 }} aria-label="Alejar" onPointerDown={e => e.stopPropagation()} onClick={() => zoomEn(-1, tam.w / 2, tam.h / 2)}>−</button>
    <button style={{ ...estilo, right: 8, top: 84, fontSize: 15 }} aria-label="Ver todo" title="Ver todo" onPointerDown={e => e.stopPropagation()} onClick={ajustarTodo}>⤢</button>
    <div style={{ position: "absolute", left: 6, bottom: 4, fontSize: 11, background: "#fffc", padding: "1px 6px", borderRadius: 4, pointerEvents: "none" }}>{BASES[base].texto} · zoom {v.z}</div>
  </div>;
}
