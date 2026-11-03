import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Kpi, Tabs, Vacio, bs, useAlcance, useQuery } from "../lib/ui";
import { todas } from "../lib/datos";
import { Mapeo, aMovimientos, detectarMapeo, leerTabla } from "../lib/extracto";

const n = (x: any) => Number(x) || 0;
const aDatos = (p: Promise<any[]>) => p.then(data => ({ data, error: null })).catch(e => ({ data: [] as any[], error: { message: e.message } }));
/** Fecha de hoy en la hora del dispositivo (en Bolivia, no la de Londres). */
const hoyLocal = () => new Date().toLocaleDateString("en-CA");
const hora = (t: string) => (t ? new Date(t).toLocaleString("es-BO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const csv = (filas: any[][]) => filas.map(f => f.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
const descargar = (nombre: string, texto: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\uFEFF" + texto], { type: "text/csv;charset=utf-8" })); a.download = nombre; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); };
const imprimir = (titulo: string, cab: string[], filas: any[][]) => {
  const w = window.open("", "_blank"); if (!w) return alert("El navegador bloqueó la ventana. Permite las ventanas emergentes para imprimir.");
  w.document.write(`<html><head><title>${titulo}</title><style>body{font:13px system-ui;padding:16px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:4px 6px;text-align:left}h1{font-size:18px}</style></head><body><h1>${titulo}</h1><p>${new Date().toLocaleString("es-BO")} · ${filas.length} cliente(s)</p><table><thead><tr>${cab.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>${filas.map(f => `<tr>${f.map(c => `<td>${String(c ?? "").replace(/</g, "&lt;")}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`);
  w.document.close(); w.focus(); w.print();
};

/** Banco: quiénes pagaron y hay que habilitar, quiénes siguen sin pagar y hay que cortar, y los movimientos que llegan del banco. */
export function Banco() {
  const [sub, setSub] = useState("dia");
  const rev = useQuery(() => supabase.from("banco_movimientos").select("id").in("estado", ["NUEVO", "REVISAR"]).limit(999), []);
  const porRevisar = ((rev.data as any[]) || []).length;
  return <>
    <Tabs items={[["dia", "Lista del día"], ["mov", `Movimientos del banco${porRevisar ? ` (${porRevisar})` : ""}`], ["importar", "Importar extracto"], ["conexion", "Conexión automática"]]} valor={sub} onChange={setSub} />
    {sub === "dia" && <ListaDia />}{sub === "mov" && <Movimientos onCambio={rev.recargar} />}{sub === "importar" && <ImportarExtracto onListo={rev.recargar} />}{sub === "conexion" && <Conexion />}
  </>;
}

/* ---------------- Lista del día ---------------- */
function ListaDia() {
  const { zonas } = useApp(), al = useAlcance(), nz = (id: string) => zonas.find(z => z.id === id)?.nombre || "";
  const hab = useQuery(() => aDatos(todas(() => al(supabase.from("v_habilitar").select("*").order("cliente_id")))), []);
  const cor = useQuery(() => aDatos(todas(() => al(supabase.from("v_cortar").select("*").order("cliente_id")))), []);
  const hoyP = useQuery(() => aDatos(todas(() => al(supabase.from("v_pagos_registro").select("id, cliente_codigo, cliente_nombre, monto, medio, comprobante_path, creado_en, anulado").eq("fecha", hoyLocal()).eq("anulado", false).order("id")))), []);
  const [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [selH, setSelH] = useState<string[]>([]), [selC, setSelC] = useState<string[]>([]), [ocup, setOcup] = useState(false), [act, setAct] = useState(Date.now()), [, tic] = useState(0);
  const H: any[] = [...((hab.data as any[]) || [])].sort((a, b) => String(b.pago_en || "").localeCompare(String(a.pago_en || ""))), C: any[] = [...((cor.data as any[]) || [])].sort((a, b) => n(b.deuda) - n(a.deuda)), P: any[] = [...((hoyP.data as any[]) || [])].sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)));
  const actualizar = async (conRec = true) => { setMsg(""); setOcup(true); try { if (conRec) await supabase.rpc("conciliar_banco", {}); } catch { /* si no hay nada nuevo, no pasa nada */ } hab.recargar(); cor.recargar(); hoyP.recargar(); setAct(Date.now()); setOcup(false); };
  const ref = useRef(actualizar); ref.current = actualizar;
  useEffect(() => { const t = setInterval(() => ref.current(true), 60000), r = setInterval(() => tic(x => x + 1), 15000); return () => { clearInterval(t); clearInterval(r); }; }, []);
  const hace = Math.max(0, Math.round((Date.now() - act) / 1000)), haceTxt = hace < 60 ? `hace ${hace} s` : `hace ${Math.round(hace / 60)} min`;
  const accion = async (ids: string[], tipo: "RECONECTAR" | "SUSPENDER") => {
    if (!ids.length) return; if (!confirm(tipo === "RECONECTAR" ? `¿Marcar ${ids.length} cliente(s) como HABILITADOS en la red?\n\nHazlo después de habilitarlos en el equipo.` : `¿Marcar ${ids.length} cliente(s) como CORTADOS por falta de pago?\n\nHazlo después de cortarlos en el equipo.`)) return;
    setOcup(true); setMsg(""); setOk(""); let bien = 0, mal = 0, ultimo = "";
    for (const id of ids) { const { error } = await supabase.rpc("cambiar_estado_cliente", { p_cliente: id, p_accion: tipo, p_motivo: tipo === "RECONECTAR" ? "Pagó y se habilitó en la red" : "Corte por falta de pago", p_hasta: null }); if (error) { mal++; ultimo = error.message; } else bien++; }
    setOcup(false); if (mal) setMsg(`${mal} no se pudieron marcar: ${ultimo}`); if (bien) setOk(`${bien} cliente(s) marcados como ${tipo === "RECONECTAR" ? "habilitados" : "cortados"}.`); setSelH([]); setSelC([]); actualizar(false);
  };
  const copiar = async (titulo: string, filas: string[]) => { try { await navigator.clipboard.writeText(titulo + "\n" + filas.join("\n")); setOk("Lista copiada."); } catch { setMsg("No se pudo copiar."); } };
  const filasH = H.map(x => [x.codigo, x.nombre, x.telefono || "", nz(x.zona_id), `${x.nap_codigo || ""}${x.puerto_numero ? " / " + x.puerto_numero : ""}`, hora(x.pago_en)]), filasC = C.map(x => [x.codigo, x.nombre, x.telefono || "", nz(x.zona_id), `${x.nap_codigo || ""}${x.puerto_numero ? " / " + x.puerto_numero : ""}`, Math.round(n(x.deuda)), x.meses_deuda]);
  const cabH = ["Código", "Cliente", "Teléfono", "Zona", "NAP / puerto", "Pagó"], cabC = ["Código", "Cliente", "Teléfono", "Zona", "NAP / puerto", "Debe (Bs)", "Meses"];
  const Barra = ({ titulo, cab, filas, sel, todos }: any) => <div className="fila" style={{ margin: "6px 0 8px" }}>
    <button className="btn suave chico" onClick={() => copiar(titulo, filas.map((f: any[]) => f.join(" · ")))}>Copiar</button><button className="btn suave chico" onClick={() => descargar(`${titulo.toLowerCase().replace(/\s+/g, "-")}-${hoyLocal()}.csv`, csv([cab, ...filas]))}>Descargar CSV</button><button className="btn suave chico" onClick={() => imprimir(titulo, cab, filas)}>Imprimir</button>
    {todos.length > 0 && <button className="btn suave chico" onClick={() => sel[1](sel[0].length === todos.length ? [] : todos)}>{sel[0].length === todos.length ? "Quitar selección" : "Marcar todos"}</button>}</div>;
  const Caja = ({ id, v, set }: { id: string; v: string[]; set: (x: string[]) => void }) => <input type="checkbox" checked={v.includes(id)} onChange={e => set(e.target.checked ? [...v, id] : v.filter(x => x !== id))} />;
  if (hab.loading || cor.loading) return <Cargando />;
  return <>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="fila entre" style={{ marginBottom: 10 }}><div className="mute">Se actualiza sola cada minuto · última vez {haceTxt}</div><button className="btn mor" disabled={ocup} onClick={() => actualizar(true)}>{ocup ? "Actualizando…" : "🔄 Actualizar lista ahora"}</button></div>
    <div className="grid gk" style={{ marginBottom: 14 }}><Kpi t="Por habilitar" v={H.length} s="Ya pagaron y están cortados" c="var(--ok)" /><Kpi t="Por cortar" v={C.length} s={`Deben ${bs(C.reduce((s, x) => s + n(x.deuda), 0))}`} c="var(--bad)" /><Kpi t="Pagaron hoy" v={P.length} s={bs(P.reduce((s, x) => s + n(x.monto), 0))} /></div>

    <div className="card tw"><div className="fila entre"><h2 style={{ margin: 0 }}>✅ Pagaron: hay que habilitarlos en la red ({H.length})</h2>{selH.length > 0 && <button className="btn" disabled={ocup} onClick={() => accion(selH, "RECONECTAR")}>Marcar {selH.length} como habilitados</button>}</div>
      <p className="mute" style={{ margin: "4px 0" }}>Clientes cortados que ya no deben nada. Habilítalos en el equipo y luego tócales "Habilitado". Los más recientes arriba.</p>
      <Barra titulo="Por habilitar" cab={cabH} filas={filasH} sel={[selH, setSelH]} todos={H.map(x => x.cliente_id)} />
      {H.length ? <table><thead><tr><th /><th>Cliente</th><th>Zona</th><th>NAP / puerto</th><th>Teléfono</th><th>Pagó</th><th>Motivo del corte</th><th /></tr></thead>
        <tbody>{H.map(x => <tr key={x.cliente_id}><td><Caja id={x.cliente_id} v={selH} set={setSelH} /></td><td><b>{x.nombre}</b><br /><small className="mute">{x.codigo}</small></td><td>{nz(x.zona_id)}</td><td>{x.nap_codigo || "—"}{x.puerto_numero ? " / " + x.puerto_numero : ""}</td><td>{x.telefono || "—"}</td><td>{hora(x.pago_en)}</td><td><small>{x.motivo_estado || "—"}</small></td><td><button className="btn chico" disabled={ocup} onClick={() => accion([x.cliente_id], "RECONECTAR")}>Habilitado ✓</button></td></tr>)}</tbody></table> : <Vacio>No hay nadie por habilitar ahora mismo. 🎉</Vacio>}</div>

    <div className="card tw"><div className="fila entre"><h2 style={{ margin: 0 }}>⛔ No han pagado: hay que cortarlos ({C.length})</h2>{selC.length > 0 && <button className="btn" disabled={ocup} onClick={() => accion(selC, "SUSPENDER")}>Marcar {selC.length} como cortados</button>}</div>
      <p className="mute" style={{ margin: "4px 0" }}>Clientes activos con meses vencidos. No aparecen los que tienen "No cortar". <b>Antes de cortar, toca "Actualizar lista"</b> por si alguien acaba de pagar.</p>
      <Barra titulo="Por cortar" cab={cabC} filas={filasC} sel={[selC, setSelC]} todos={C.map(x => x.cliente_id)} />
      {C.length ? <table><thead><tr><th /><th>Cliente</th><th>Zona</th><th>NAP / puerto</th><th>Teléfono</th><th>Debe</th><th>Vencido desde</th><th /></tr></thead>
        <tbody>{C.map(x => <tr key={x.cliente_id}><td><Caja id={x.cliente_id} v={selC} set={setSelC} /></td><td><b>{x.nombre}</b><br /><small className="mute">{x.codigo}</small></td><td>{nz(x.zona_id)}</td><td>{x.nap_codigo || "—"}{x.puerto_numero ? " / " + x.puerto_numero : ""}</td><td>{x.telefono || "—"}</td><td><b style={{ color: "var(--bad)" }}>{bs(x.deuda)}</b><br /><small className="mute">{x.meses_deuda} mes(es)</small></td><td>{String(x.mas_antiguo || "").slice(0, 10) || "—"}</td><td><button className="btn suave chico" disabled={ocup} onClick={() => accion([x.cliente_id], "SUSPENDER")}>Cortado ✓</button></td></tr>)}</tbody></table> : <Vacio>Nadie por cortar. Todos están al día.</Vacio>}</div>

    <div className="card tw"><h2>💵 Pagaron hoy ({P.length})</h2>{P.length ? <table><thead><tr><th>Hora</th><th>Cliente</th><th>Monto</th><th>Medio</th><th>Origen</th></tr></thead><tbody>{P.map(x => <tr key={x.id}><td>{hora(x.creado_en)}</td><td><b>{x.cliente_nombre}</b> <small className="mute">{x.cliente_codigo}</small></td><td>{bs(x.monto)}</td><td>{x.medio || "—"}</td><td>{String(x.comprobante_path || "").startsWith("banco:") ? <span className="pill acc">Banco (automático)</span> : "Registrado a mano"}</td></tr>)}</tbody></table> : <Vacio>Todavía no hay pagos hoy.</Vacio>}</div>
  </>;
}

/* ---------------- Movimientos del banco ---------------- */
function Movimientos({ onCambio }: { onCambio: () => void }) {
  const { proyectoId } = useApp(), al = useAlcance();
  const [f, setF] = useState("revisar"), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [abierto, setAbierto] = useState(""), [q, setQ] = useState(""), [ocup, setOcup] = useState(false);
  const mov = useQuery(() => aDatos(todas(() => al(supabase.from("banco_movimientos").select("*").order("fecha", { ascending: false }).order("id"), false))), [f]);
  const cli = useQuery(() => aDatos(todas(() => al(supabase.from("clientes").select("id, codigo, nombre, estado, telefono").neq("estado", "BAJA").order("nombre").order("id"), false))), []);
  const M: any[] = ((mov.data as any[]) || []).filter(x => f === "todos" || (f === "revisar" ? ["NUEVO", "REVISAR"].includes(x.estado) : f === "conciliados" ? x.estado === "CONCILIADO" : x.estado === "IGNORADO"));
  const C: any[] = (cli.data as any[]) || [], lista = useMemo(() => { const t = q.trim().toLowerCase(); return t ? C.filter(c => (c.nombre + " " + c.codigo).toLowerCase().includes(t)).slice(0, 8) : []; }, [q, C.length]);
  const listo = (t: string) => { setOk(t); setAbierto(""); setQ(""); mov.recargar(); onCambio(); };
  const aplicar = async (m: any, cliente: string, aprender = true) => { setMsg(""); setOk(""); setOcup(true); const { error } = await supabase.rpc("aplicar_banco", { p_mov: m.id, p_cliente: cliente, p_aprender: aprender }); setOcup(false); if (error) setMsg(error.message); else listo("Pago registrado."); };
  const ignorar = async (m: any) => { const motivo = prompt("¿Por qué se ignora? (por ejemplo: no es un pago de internet)", "No corresponde a un cliente"); if (motivo === null) return; const { error } = await supabase.rpc("ignorar_banco", { p_mov: m.id, p_motivo: motivo }); if (error) setMsg(error.message); else listo("Movimiento ignorado."); };
  const anular = async (m: any) => { const motivo = prompt("Motivo de la anulación del pago:"); if (!motivo || !motivo.trim()) return; const { error } = await supabase.rpc("anular_pago", { p_pago: m.pago_id, p_motivo: motivo.trim() }); if (error) setMsg(error.message); else listo("Pago anulado: el movimiento volvió a 'por revisar'."); };
  const reconocer = async () => { setMsg(""); setOcup(true); const { data, error } = await supabase.rpc("conciliar_banco", {}); setOcup(false); if (error) setMsg(error.message); else listo(`Listo: ${(data as any)?.automaticos ?? 0} pago(s) registrados solos y ${(data as any)?.por_revisar ?? 0} por revisar.`); };
  const pill = (e: string) => <span className={"pill " + (e === "CONCILIADO" ? "ok" : e === "IGNORADO" ? "" : "warn")}>{e === "CONCILIADO" ? "Registrado" : e === "IGNORADO" ? "Ignorado" : "Por revisar"}</span>;
  return <>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="fila entre" style={{ marginBottom: 10 }}><Tabs items={[["revisar", "Por revisar"], ["conciliados", "Registrados"], ["ignorados", "Ignorados"], ["todos", "Todos"]]} valor={f} onChange={setF} /><button className="btn suave" disabled={ocup} onClick={reconocer}>Reconocer pagos ahora</button></div>
    {mov.loading ? <Cargando /> : M.length ? <div className="card tw"><table><thead><tr><th>Fecha</th><th>Monto</th><th>Quién pagó / glosa</th><th>Banco · ref.</th><th>Estado</th><th>Cliente</th><th /></tr></thead>
      <tbody>{M.map(m => <tr key={m.id}><td>{hora(m.fecha)}</td><td><b>{bs(m.monto)}</b></td><td><b>{m.remitente || "—"}</b><br /><small className="mute">{m.glosa || ""}</small></td><td><small>{m.banco || "—"}<br />{m.referencia}</small></td>
        <td>{pill(m.estado)}{m.motivo && <><br /><small className="mute">{m.motivo}</small></>}</td><td>{m.cliente_id ? C.find(c => c.id === m.cliente_id)?.nombre || "—" : "—"}</td>
        <td>{["NUEVO", "REVISAR"].includes(m.estado) && <div style={{ minWidth: 230 }}>
          {(m.candidatos || []).map((c: any) => <button key={c.id} className="btn chico" style={{ marginBottom: 4 }} disabled={ocup} onClick={() => aplicar(m, c.id)}>Es {c.codigo} · {c.nombre}</button>)}
          {abierto === m.id ? <div><input autoFocus placeholder="Buscar cliente por nombre o código" value={q} onChange={e => setQ(e.target.value)} />{lista.map(c => <div key={c.id}><button className="btn suave chico" style={{ width: "100%", textAlign: "left", marginTop: 2 }} disabled={ocup} onClick={() => aplicar(m, c.id)}>{c.codigo} · {c.nombre}{c.estado === "SUSPENDIDO" ? " (cortado)" : ""}</button></div>)}</div>
            : <div className="fila"><button className="btn suave chico" onClick={() => { setAbierto(m.id); setQ(""); }}>Elegir cliente…</button><button className="btn suave chico" onClick={() => ignorar(m)}>Ignorar</button></div>}</div>}
          {m.estado === "CONCILIADO" && m.pago_id && <button className="btn suave chico" onClick={() => anular(m)}>Anular pago</button>}</td></tr>)}</tbody></table></div> : <Vacio>{f === "revisar" ? "No hay movimientos por revisar. 🎉" : "No hay movimientos en esta lista."}</Vacio>}
    {!proyectoId && <p className="mute">Se muestran los movimientos de todos tus proyectos.</p>}
  </>;
}

/* ---------------- Importar extracto ---------------- */
const CAMPOS: [keyof Mapeo, string][] = [["fecha", "Fecha"], ["monto", "Monto (abono o crédito)"], ["referencia", "Número de operación"], ["remitente", "Quién pagó (nombre)"], ["glosa", "Glosa o detalle"]];
function ImportarExtracto({ onListo }: { onListo: () => void }) {
  const { proyectoId, proyectos } = useApp();
  const [texto, setTexto] = useState(""), [mapa, setMapa] = useState<Mapeo>({ fecha: -1, monto: -1, referencia: -1, remitente: -1, glosa: -1 }), [conEnc, setConEnc] = useState(true), [banco, setBanco] = useState("Extracto"), [proy, setProy] = useState(proyectoId || proyectos[0]?.id || ""), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false);
  const tabla = useMemo(() => (texto.trim() ? leerTabla(texto) : []), [texto]);
  const cols = tabla[0]?.length || 0, nombres = (i: number) => (conEnc && tabla[0]?.[i] ? tabla[0][i] : `Columna ${i + 1}`);
  const cargar = (t: string) => { setMsg(""); setOk(""); setTexto(t); const tb = leerTabla(t); if (!tb.length) return; const enc = tb[0].some(c => /[a-zA-ZáéíóúÁÉÍÓÚ]{3,}/.test(c)) && !tb[0].some(c => /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(c)); setConEnc(enc); setMapa(enc ? detectarMapeo(tb[0]) : { fecha: 0, monto: tb[0].length > 2 ? 2 : 1, referencia: -1, remitente: -1, glosa: tb[0].length > 2 ? 1 : -1 }); };
  const res = useMemo(() => (tabla.length && mapa.fecha >= 0 && mapa.monto >= 0 ? aMovimientos(tabla, mapa, conEnc) : null), [tabla, mapa, conEnc]);
  const subir = async (f?: File | null) => { if (!f) return; if (/\.xlsx?$/i.test(f.name)) return setMsg("Los archivos de Excel no se pueden leer directamente. En Excel usa Guardar como → CSV, o selecciona las filas, cópialas y pégalas en el cuadro de abajo."); cargar(await f.text()); };
  const importar = async () => {
    if (!res || !res.movs.length) return; if (!proy) return setMsg("Elige un proyecto."); setOcup(true); setMsg(""); setOk(""); let nuevos = 0, dup = 0, mal = 0, ultimo = "";
    for (let i = 0; i < res.movs.length; i += 8) await Promise.all(res.movs.slice(i, i + 8).map(async m => { const { data, error } = await supabase.rpc("registrar_movimiento_banco", { p: { ...m, proyecto_id: proy, banco: banco.trim(), origen: "extracto" } }); if (error) { mal++; ultimo = error.message; } else if ((data as any)?.nuevo) nuevos++; else dup++; }));
    let extra = ""; if (nuevos) { const { data, error } = await supabase.rpc("conciliar_banco", {}); extra = error ? ` No se pudo reconocer a los clientes: ${error.message}` : ` ${(data as any)?.automaticos ?? 0} pago(s) registrados solos y ${(data as any)?.por_revisar ?? 0} por revisar (pestaña Movimientos del banco).`; }
    setOcup(false); if (mal) setMsg(`${mal} movimientos no se pudieron guardar: ${ultimo}`); setOk(`${nuevos} movimiento(s) nuevos, ${dup} ya estaban cargados.${extra}`); if (nuevos) { setTexto(""); onListo(); }
  };
  return <div className="card"><h2>Importar el extracto del banco</h2>
    <p className="mute" style={{ marginTop: 0 }}>1) En la banca por internet de tu banco descarga los movimientos del día (CSV o Excel). 2) Súbelos aquí, o copia las filas desde Excel y pégalas. 3) Revisa las columnas y toca Importar. <b>Si cargas el mismo extracto dos veces, no se duplica nada.</b></p>
    {msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
    <div className="fila" style={{ marginBottom: 8 }}><label className="btn" style={{ cursor: "pointer" }}>📂 Subir archivo CSV o de texto<input type="file" style={{ display: "none" }} onChange={e => { subir(e.target.files?.[0]); e.target.value = ""; }} /></label><span className="mute">o pega aquí las filas:</span></div>
    <textarea rows={5} style={{ width: "100%" }} placeholder="Fecha;Nro. operación;Descripción;Crédito&#10;22/10/2026;88123;TRANSF MARIA QUISPE C-0001;140,00" value={texto} onChange={e => cargar(e.target.value)} />
    {tabla.length > 0 && <>
      <h3 style={{ marginBottom: 4 }}>¿Qué columna es cada cosa?</h3>
      <div className="form">{CAMPOS.map(([k, l]) => <Campo key={k} l={l + (k === "fecha" || k === "monto" ? " *" : "")}><select value={mapa[k]} onChange={e => setMapa({ ...mapa, [k]: Number(e.target.value) })}><option value={-1}>(ninguna)</option>{Array.from({ length: cols }, (_, i) => <option key={i} value={i}>{nombres(i)}</option>)}</select></Campo>)}
        <Campo l="Banco o cuenta"><input value={banco} onChange={e => setBanco(e.target.value)} /></Campo>{proyectos.length > 1 && <Campo l="Proyecto"><select value={proy} onChange={e => setProy(e.target.value)}>{proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></Campo>}</div>
      <label className="fila" style={{ margin: "6px 0" }}><input type="checkbox" checked={conEnc} onChange={e => setConEnc(e.target.checked)} /> La primera fila son los títulos de las columnas</label>
      {res ? <><div className="pill ok" style={{ whiteSpace: "normal" }}>{res.movs.length} abono(s) para importar · {bs(res.movs.reduce((s, m) => s + m.monto, 0))}{res.omitidas.length ? ` · ${res.omitidas.length} fila(s) omitidas (retiros, comisiones o sin datos válidos)` : ""}</div>
        <div className="tw" style={{ margin: "8px 0" }}><table><thead><tr><th>Fecha</th><th>Monto</th><th>Operación</th><th>Quién pagó</th><th>Glosa</th></tr></thead><tbody>{res.movs.slice(0, 8).map((m, i) => <tr key={i}><td>{m.fecha.slice(0, 10)}</td><td>{bs(m.monto)}</td><td>{m.referencia}</td><td>{m.remitente || "—"}</td><td>{m.glosa || "—"}</td></tr>)}</tbody></table></div>
        <button className="btn" disabled={ocup || !res.movs.length} onClick={importar}>{ocup ? "Importando…" : `Importar ${res.movs.length} movimiento(s) y reconocer los pagos`}</button></> : <p className="mute">Elige las columnas de fecha y monto para ver la vista previa.</p>}</>}
  </div>;
}

/* ---------------- Conexión automática ---------------- */
function Conexion() {
  const ult = useQuery(() => supabase.from("banco_movimientos").select("creado_en, banco, monto").eq("origen", "webhook").order("creado_en", { ascending: false }).limit(1), []);
  const u = ((ult.data as any[]) || [])[0], url = `${location.origin}/.netlify/functions/banco-webhook`, [ok, setOk] = useState("");
  return <div className="card"><h2>Conexión automática con el banco</h2>
    {ult.loading ? <Cargando /> : u ? <Aviso tipo="ok">✅ La conexión funciona: el último aviso del banco llegó el {hora(u.creado_en)} ({u.banco || "banco"}, {bs(u.monto)}).</Aviso> : <Aviso>Todavía no ha llegado ningún aviso automático del banco. Mientras tanto puedes usar <b>Importar extracto</b> todos los días.</Aviso>}
    <p>Cuando el banco o la pasarela de pagos te habiliten las notificaciones de pago, pídeles que las envíen a esta dirección:</p>
    <div className="fila"><code style={{ padding: "6px 10px", background: "var(--lilb)", borderRadius: 8, wordBreak: "break-all" }}>{url}</code><button className="btn suave chico" onClick={async () => { try { await navigator.clipboard.writeText(url); setOk("Dirección copiada."); } catch { setOk(url); } }}>Copiar</button></div>{ok && <p className="mute">{ok}</p>}
    <p className="mute">La dirección va con tu clave secreta (BANCO_WEBHOOK_SECRET). Los pasos completos, las preguntas que debes hacerle al banco y cómo configurar Netlify están en la guía <b>GUIA_BANCO.md</b>.</p>
    <h3>Cómo reconoce a quien pagó</h3>
    <ul style={{ margin: 0, paddingLeft: 18 }}><li><b>Registra el pago solo</b> cuando en la glosa está el <b>código del cliente</b> (por ejemplo C-0001), su <b>carnet</b>, o un nombre con el que ya pagó antes y tú confirmaste.</li><li>Si el nombre solo <b>se parece</b>, o hay dudas, queda <b>por revisar</b> con un botón para confirmar con un toque. La próxima vez ya lo reconoce.</li><li>Un pago registrado por error se puede <b>anular</b>: el movimiento vuelve a "por revisar".</li></ul>
    <p className="mute">👉 Pídele a cada cliente que escriba su código (C-0001) en la glosa al pagar. Así casi todo se registra solo.</p></div>;
}
