import { ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Cargando, Vacio, useAlcance, useQuery } from "../lib/ui";
import { PERDIDA_ALTA } from "./RedInfra";
import { BarrasAgrupadas, BarrasApiladas, BarrasH, Donut, Leyenda } from "../lib/graficos";

const n = (x: any) => Number(x) || 0;
const suma = (a: any[], k: string) => a.reduce((s, x) => s + n(x[k]), 0);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function Mini({ t, v, s, clase, ver }: { t: string; v: ReactNode; s?: ReactNode; clase?: string; ver?: () => void }) {
  return <div className={"kmini " + (clase || "")}><span>{t}</span><b>{v}</b>{s && <small>{s}</small>}{ver && <a onClick={ver}>Ver detalle →</a>}</div>;
}

export function PanelRed({ ir }: { ir: (tab: string, sub?: string) => void }) {
  const { proyectoId, zonaId, zonas } = useApp(), al = useAlcance(), dep = [proyectoId, zonaId];
  const naps = useQuery(() => al(supabase.from("v_naps_ocupacion").select("*").order("codigo").limit(500)), dep);
  const trs = useQuery(() => al(supabase.from("v_troncales_resumen").select("*").limit(300)), dep);
  const fus = useQuery(() => al(supabase.from("fusiones").select("perdida_db").limit(5000)), dep);
  const postes = useQuery(() => al(supabase.from("postes").select("id", { count: "exact", head: true })).then((r: any) => ({ data: r.count ?? 0, error: r.error })), dep);
  const mant = useQuery(() => al(supabase.from("mantenimientos").select("objeto, referencia, tipo, estado").limit(3000)), dep);
  if ([naps, trs, fus, mant].some(q => q.loading)) return <Cargando />;

  const N: any[] = (naps.data as any[]) || [], T: any[] = (trs.data as any[]) || [], F: any[] = (fus.data as any[]) || [], M: any[] = (mant.data as any[]) || [];
  const zona = zonas.find(z => z.id === zonaId);
  const tot = suma(N, "total"), oc = suma(N, "ocupados"), li = suma(N, "libres"), re = suma(N, "reservados"), da = suma(N, "danados");
  const hilos = suma(T, "total"), hl = suma(T, "libres"), hu = suma(T, "utilizados"), hr = suma(T, "reservados"), hd = suma(T, "danados");
  const abiertos = M.filter(x => ["PENDIENTE", "EN PROCESO", "PAUSADO"].includes(x.estado)).length;
  const altas = F.filter(x => x.perdida_db != null && n(x.perdida_db) > PERDIDA_ALTA).length;
  const ocup = pct(oc, tot);
  const colorOcup = ocup >= 90 ? "bad" : ocup >= 70 ? "warn" : "ok";

  const porOcup = [...N].filter(x => n(x.total) > 0).sort((a, b) => n(b.ocupados) / n(b.total) - n(a.ocupados) / n(a.total)).slice(0, 6);
  const fallas: Record<string, number> = {}; M.filter(x => x.objeto === "NAP" && x.referencia && /correctiv/i.test(x.tipo || "Correctivo")).forEach(x => { fallas[x.referencia] = (fallas[x.referencia] || 0) + 1; });
  const filasFallas = Object.entries(fallas).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([nombre, valor]) => ({ nombre, valor, extra: `${valor} correctivo${valor === 1 ? "" : "s"}` }));
  const llenas = N.filter(x => n(x.libres) === 0 && n(x.total) > 0), pocoHilo = T.filter(x => n(x.libres) <= 2);
  const revisar = [
    ...llenas.map(x => `La NAP ${x.codigo} no tiene puertos libres.`),
    ...pocoHilo.map(x => `La troncal ${x.codigo} tiene solo ${n(x.libres)} ${n(x.libres) === 1 ? "hilo libre" : "hilos libres"}.`),
    ...(hd ? [`Hay ${hd} ${hd === 1 ? "hilo dañado" : "hilos dañados"} en las troncales.`] : []),
    ...(altas ? [`${altas} ${altas === 1 ? "fusión tiene" : "fusiones tienen"} pérdida alta (más de ${PERDIDA_ALTA} dB).`] : []),
    ...(da ? [`Hay ${da} ${da === 1 ? "puerto dañado" : "puertos dañados"} en las NAP.`] : []),
  ];
  const C = { oc: "var(--lil)", re: "var(--warn)", da: "var(--bad)", li: "var(--ok)" };
  const NAPS_GRAFICO = N.slice(0, 16);

  return <>
    <div className="kpis-mini">
      <Mini t="NAP registradas" v={N.length} s={zona ? "En la zona " + zona.nombre : "En todas las zonas"} ver={() => ir("naps")} />
      <Mini t="Puertos instalados" v={tot} s="Capacidad total" />
      <Mini t="Puertos ocupados" v={oc} s={`${ocup}% del total`} clase="acc" />
      <Mini t="Puertos libres" v={li} s={`${pct(li, tot)}% del total`} clase="ok" />
      <Mini t="Puertos reservados" v={re} s={`${pct(re, tot)}% del total`} clase="warn" />
      <Mini t="Puertos dañados" v={da} s={`${pct(da, tot)}% del total`} clase={da ? "bad" : ""} />
      <div className={"kmini " + colorOcup}><span>Ocupación de la red</span><b>{ocup}%</b><div className="barra-estados" style={{ marginTop: 4 }}><i style={{ width: ocup + "%", background: `var(--${colorOcup === "ok" ? "ok" : colorOcup})` }} /></div></div>
      <Mini t="Troncales" v={T.length} s={`${suma(T, "longitud_km").toLocaleString("es-BO", { maximumFractionDigits: 2 })} km de fibra`} ver={() => ir("troncales", "troncales")} />
      <Mini t="Fibras" v={hilos} s={`Libres ${hl} · Usadas ${hu}${hr ? ` · Reserv. ${hr}` : ""} · Dañadas ${hd}`} ver={() => ir("troncales", "hilos")} />
      <Mini t="Empalmes" v={F.length} s={altas ? `${altas} con pérdida alta` : "Fusiones registradas"} clase={altas ? "warn" : ""} ver={() => ir("troncales", "hilos")} />
      <Mini t="Postes" v={postes.data ?? 0} ver={() => ir("troncales", "postes")} />
      <Mini t="Mantenimientos pendientes" v={abiertos} s={abiertos ? "Por atender" : "Ninguno pendiente"} clase={abiertos ? "warn" : ""} />
    </div>

    <div className="mitades">
      <div className="card"><h2>Estado de los puertos por NAP</h2>{NAPS_GRAFICO.length ? <>
        <BarrasAgrupadas alto={230} fmt={v => String(v)} etiquetas={NAPS_GRAFICO.map(x => String(x.codigo).replace(/^NAP-?/i, ""))} series={[{ nombre: "Ocupado", color: C.oc, datos: NAPS_GRAFICO.map(x => n(x.ocupados)) }, { nombre: "Reservado", color: C.re, datos: NAPS_GRAFICO.map(x => n(x.reservados)) }, { nombre: "Dañado", color: C.da, datos: NAPS_GRAFICO.map(x => n(x.danados)) }, { nombre: "Libre", color: C.li, datos: NAPS_GRAFICO.map(x => n(x.libres)) }]} />
        <Leyenda items={[{ nombre: "Ocupado", color: C.oc }, { nombre: "Reservado", color: C.re }, { nombre: "Dañado", color: C.da }, { nombre: "Libre", color: C.li }]} />
        {N.length > 16 && <p className="mute" style={{ margin: "6px 0 0" }}>Se muestran 16 de {N.length} NAP. Elige una zona arriba para ver menos.</p>}</> : <Vacio>Aún no hay NAP.</Vacio>}</div>
      <div className="card"><h2>¿Cómo está ocupada la red?</h2>{tot ? <Donut fmt={v => String(v)} partes={[{ nombre: "Ocupados", valor: oc, color: C.oc }, { nombre: "Reservados", valor: re, color: C.re }, { nombre: "Dañados", valor: da, color: C.da }, { nombre: "Libres", valor: li, color: C.li }].filter(x => x.valor > 0).map(x => ({ ...x }))} /> : <Vacio>Sin puertos todavía.</Vacio>}</div>
      <div className="card"><h2>NAP con mayor ocupación</h2>{porOcup.length ? <BarrasH filas={porOcup.map(x => ({ nombre: x.codigo, valor: pct(n(x.ocupados), n(x.total)), color: pct(n(x.ocupados), n(x.total)) >= 90 ? "var(--bad)" : pct(n(x.ocupados), n(x.total)) >= 70 ? "var(--warn)" : "var(--lil)", extra: `${pct(n(x.ocupados), n(x.total))}% · ${n(x.ocupados)} cliente${n(x.ocupados) === 1 ? "" : "s"}` }))} /> : <Vacio>Sin datos.</Vacio>}
        <h2 style={{ marginTop: 14 }}>NAP con más fallas</h2>{filasFallas.length ? <BarrasH color="var(--bad)" filas={filasFallas} /> : <p className="mute" style={{ margin: 0 }}>Ninguna NAP tiene mantenimientos correctivos registrados.</p>}</div>
      <div className="card"><h2>Uso de fibras por troncal</h2>{T.length ? <BarrasApiladas partes={[{ nombre: "Usadas", color: C.oc }, { nombre: "Reservadas", color: C.re }, { nombre: "Dañadas", color: C.da }, { nombre: "Libres", color: C.li }]}
        filas={T.map(t => ({ nombre: t.codigo + (t.hasta ? " · " + t.hasta : ""), valores: [n(t.utilizados), n(t.reservados), n(t.danados), n(t.libres)], extra: `${n(t.libres)} libres de ${n(t.total)}` }))} /> : <Vacio>Aún no hay troncales.</Vacio>}</div>
    </div>

    <div className="card"><h2>Estructura de la red</h2>
      <div className="estruct">
        <span className="nodo">{zona ? "Zona " + zona.nombre.replace(/^zona\s+/i, "") : "Todas las zonas"}</span><span className="flecha">→</span>
        <span className="nodo">Troncales<b>{T.length}</b></span><span className="flecha">→</span>
        <span className="nodo">Fibras<b>{hilos}</b></span><span className="flecha">→</span>
        <span className="nodo">Empalmes<b>{F.length}</b></span><span className="flecha">→</span>
        <span className="nodo">NAP<b>{N.length}</b></span><span className="flecha">→</span>
        <span className="nodo">Puertos<b>{tot}</b></span><span className="flecha">→</span>
        <span className="nodo">Clientes conectados<b>{oc}</b></span></div>
      <p className="mute" style={{ margin: "10px 0 0" }}>Un puerto ocupado, reservado o dañado nunca se asigna a un cliente nuevo: Instalaciones solo ofrece puertos libres. Cada puerto guarda su historial de uso (clientes, fechas y técnico).</p>
      <h2 style={{ marginTop: 14 }}>Lo que conviene revisar</h2>
      {revisar.length ? <ul style={{ margin: 0, paddingLeft: 18 }}>{revisar.map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="mute" style={{ margin: 0 }}>Todo en orden en la red.</p>}
    </div>
  </>;
}
