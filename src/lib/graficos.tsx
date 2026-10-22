import { ReactNode } from "react";
import { bs } from "./ui";

export const fmtk = (v: number) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1) + "k" : String(Math.round(v)));
export const Leyenda = ({ items }: { items: { nombre: string; color: string }[] }) => <div className="legend">{items.map(i => <span key={i.nombre} style={{ color: i.color }}>■ <span style={{ color: "var(--ink)" }}>{i.nombre}</span></span>)}</div>;

/** Barras agrupadas por etiqueta (por ejemplo, por mes). Si se pasan "totales", se escribe el número sobre cada grupo. */
export function BarrasAgrupadas({ etiquetas, series, totales, alto = 250, fmt = bs }: { etiquetas: string[]; series: { nombre: string; color: string; datos: number[] }[]; totales?: number[]; alto?: number; fmt?: (v: number) => string }) {
  const W = 640, H = alto, pl = 46, pr = 10, pt = totales ? 24 : 12, pb = 26, n = Math.max(1, etiquetas.length);
  const todos = series.flatMap(s => s.datos), lo = Math.min(0, ...todos), hiRaw = Math.max(0, ...todos), hi = hiRaw === lo ? lo + 1 : hiRaw;
  const y = (v: number) => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo)), gw = (W - pl - pr) / n, bw = Math.min(24, (gw * 0.78) / Math.max(1, series.length)), cada = Math.ceil(n / 12);
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Gráfico de barras">
    {[0, 1, 2, 3, 4].map(k => { const v = lo + ((hi - lo) * k) / 4; return <g key={k}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={pl - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--mute)">{fmtk(v)}</text></g>; })}
    <line x1={pl} x2={W - pr} y1={y(0)} y2={y(0)} stroke="var(--ink)" strokeWidth="1.2" />
    {etiquetas.map((e, i) => {
      const x0 = pl + i * gw + (gw - bw * series.length) / 2, tope = Math.min(...series.map(s => y(s.datos[i] ?? 0)));
      return <g key={i}>
        {series.map((s, j) => { const v = s.datos[i] ?? 0; return <rect key={s.nombre} x={x0 + j * bw} width={Math.max(1, bw - 2)} y={Math.min(y(v), y(0))} height={Math.abs(y(v) - y(0))} fill={s.color} rx="2"><title>{`${e} · ${s.nombre}: ${fmt(v)}`}</title></rect>; })}
        {totales && <text x={x0 + (bw * series.length) / 2} y={Math.max(11, tope - 6)} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink)">{fmtk(totales[i] ?? 0)}</text>}
        {i % cada === 0 && <text x={pl + i * gw + gw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--mute)">{e}</text>}
      </g>;
    })}
  </svg>;
}

/** Anillo con leyenda al costado. */
export function Donut({ partes, tamano = 130, fmt = bs }: { partes: { nombre: string; valor: number; color: string }[]; tamano?: number; fmt?: (v: number) => string }) {
  const total = partes.reduce((s, x) => s + x.valor, 0) || 1; let corrido = 0;
  return <div className="fila" style={{ gap: 18 }}>
    <svg viewBox="0 0 100 100" width={tamano} height={tamano} role="img" aria-label="Gráfico de anillo"><g transform="rotate(-90 50 50)">{partes.map(x => { const d = (x.valor / total) * 251.3, e = <circle key={x.nombre} cx="50" cy="50" r="40" fill="none" stroke={x.color} strokeWidth="16" strokeDasharray={`${d} ${251.3 - d}`} strokeDashoffset={-corrido} />; corrido += d; return e; })}</g></svg>
    <div>{partes.map(x => <div key={x.nombre} style={{ padding: "2px 0" }}><span style={{ color: x.color }}>■</span> {x.nombre}: <b>{fmt(x.valor)}</b> ({Math.round((x.valor / total) * 100)}%)</div>)}</div></div>;
}

/** Barras horizontales (una por fila). */
export function BarrasH({ filas, color = "var(--acc)" }: { filas: { nombre: string; valor: number; color?: string; extra?: ReactNode }[]; color?: string }) {
  const mx = Math.max(1, ...filas.map(f => Math.abs(f.valor)));
  return <div>{filas.map(f => <div key={f.nombre} style={{ marginBottom: 10 }}>
    <div className="fila" style={{ justifyContent: "space-between", gap: 8 }}><span>{f.nombre}</span><b>{f.extra ?? bs(f.valor)}</b></div>
    <div className="bar"><i style={{ width: (Math.abs(f.valor) / mx) * 100 + "%", background: f.color || color }} /></div></div>)}</div>;
}

/** Línea (por ejemplo, la caja acumulada del simulador) con marcas verticales opcionales. */
export function Linea({ etiquetas, series, marcas = [] }: { etiquetas: string[]; series: { nombre: string; color: string; datos: number[] }[]; marcas?: { i: number; etiqueta: string; color: string }[] }) {
  const W = 640, H = 230, pl = 48, pr = 12, pt = 16, pb = 26, todos = series.flatMap(s => s.datos), lo = Math.min(0, ...todos); let hi = Math.max(0, ...todos); if (hi === lo) hi = lo + 1;
  const x = (i: number) => pl + ((W - pl - pr) * i) / Math.max(1, etiquetas.length - 1), y = (v: number) => pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo));
  return <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Gráfico de líneas">
    {[0, 1, 2, 3, 4].map(k => { const v = lo + ((hi - lo) * k) / 4; return <g key={k}><line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={pl - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--mute)">{fmtk(v)}</text></g>; })}
    <line x1={pl} x2={W - pr} y1={y(0)} y2={y(0)} stroke="var(--ink)" strokeWidth="1.5" />
    {etiquetas.map((l, i) => i % Math.ceil(etiquetas.length / 9) === 0 && <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--mute)">{l}</text>)}
    {series.map(s => <polyline key={s.nombre} fill="none" stroke={s.color} strokeWidth="2.5" points={s.datos.map((v, i) => x(i) + "," + y(v)).join(" ")} />)}
    {marcas.map(m => <g key={m.etiqueta}><line x1={x(m.i)} x2={x(m.i)} y1={pt} y2={H - pb} stroke={m.color} strokeDasharray="4 3" /><text x={x(m.i) + 4} y={pt + 10} fontSize="11" fill={m.color}>{m.etiqueta}</text></g>)}
  </svg>;
}

/** Barras horizontales apiladas: cada fila se divide en partes (por ejemplo, hilos libres, usados y dañados). */
export function BarrasApiladas({ filas, partes }: { filas: { nombre: string; valores: number[]; extra?: ReactNode }[]; partes: { nombre: string; color: string }[] }) {
  return <div>{filas.map(f => { const t = f.valores.reduce((a, b) => a + b, 0) || 1;
    return <div key={f.nombre} style={{ marginBottom: 10 }}>
      <div className="fila" style={{ justifyContent: "space-between", gap: 8 }}><span>{f.nombre}</span><small className="mute">{f.extra}</small></div>
      <div className="barra-estados" style={{ maxWidth: "none", height: 12 }}>{f.valores.map((v, i) => <i key={i} style={{ width: (v / t) * 100 + "%", background: partes[i]?.color }} title={`${partes[i]?.nombre}: ${v}`} />)}</div></div>; })}
    <Leyenda items={partes} /></div>;
}
