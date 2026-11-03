import { useEffect, useState } from "react";
import { supabase, subirArchivo, urlArchivo } from "../lib/supabase";
import { EscanerFormulario } from "../lib/EscanerFormulario";
import { coincidir, norm } from "../lib/coincidir";
import { useApp } from "../lib/auth";
import { Aviso, Campo, Cargando, Vacio, hoy, useAlcance, useQuery } from "../lib/ui";
import type { Accion } from "./Servicios";

const MOTIVOS = ["Cambio de domicilio", "Mala calidad del servicio", "Precio", "Falta de pago", "Se pasó a otro proveedor", "Ya no necesita internet", "Otro"];
const DESTINOS: [string, string, string][] = [["ALMACEN", "Almacén", "Almacén"], ["MANTENIMIENTO", "Mantenimiento", "Mantenimiento"], ["DESCARTE", "Descarte", "Descarte"], ["PENDIENTE", "Aún no recuperado", "Pendiente de recuperar"]];

export function Bajas({ accion }: { accion: Accion }) {
  const { zonaId, proyectoId, perfil } = useApp(), al = useAlcance();
  const clientes = useQuery(() => al(supabase.from("clientes").select("id, codigo, nombre, proyecto_id, naps(codigo), puertos!clientes_puerto_id_fkey(numero)").neq("estado", "BAJA").order("nombre").limit(1000)), [proyectoId, zonaId]);
  const bajas = useQuery(() => al(supabase.from("v_bajas_lista").select("*").order("fecha", { ascending: false }).limit(200)), [proyectoId, zonaId]);
  const quienes = useQuery(() => supabase.from("profiles").select("id, nombre, email, rol").eq("activo", true).in("rol", ["admin", "supervisor", "socio"]).order("nombre"), []);
  const yo = perfil?.nombre || perfil?.email || "";
  const [f, setF] = useState({ cliente: "", motivo: MOTIVOS[0], autorizo: yo, destino: "ALMACEN", fisico: "", fecha: hoy() }), [arch, setArch] = useState<File | null>(null), [msg, setMsg] = useState(""), [ok, setOk] = useState(""), [ocup, setOcup] = useState(false), [hoja, setHoja] = useState<{ archivo: File; ubic: { lat: number; lng: number } | null } | null>(null), [avisos, setAvisos] = useState<string[]>([]);
  useEffect(() => { if (accion?.orden?.cliente_id) setF(x => ({ ...x, cliente: accion.orden.cliente_id })); }, [accion?.ts]);
  const C: any[] = (clientes.data as any[]) || [], c = C.find(x => x.id === f.cliente), dest = DESTINOS.find(d => d[0] === f.destino)!;
  const autoriza = Array.from(new Set([yo, ...((quienes.data as any[]) || []).map(x => x.nombre || x.email)].filter(Boolean)));

  /** Llena la baja con lo que la IA leyó de la hoja escrita a mano y guarda la ubicación del celular. */
  const aplicarHoja = ({ datos: d, ubicacion }: { datos: any; ubicacion: { lat: number; lng: number } | null; archivo: File }) => {
    const antes = f, av: string[] = [], cli = coincidir(d.codigo, C, x => x.codigo) || coincidir(d.nombre, C, x => x.nombre); if (!cli) av.push(`No encontré al cliente "${d.nombre || d.codigo || "?"}" entre los activos: elígelo a mano.`);
    const mot = coincidir(d.motivo, MOTIVOS, m => m), nd = norm(d.destino_equipo), destino = nd.includes("almac") ? "ALMACEN" : nd.includes("mantenim") ? "MANTENIMIENTO" : nd.includes("descart") ? "DESCARTE" : nd.includes("recuper") ? "PENDIENTE" : "";
    const aut = coincidir(d.autorizo, autoriza, a => a), eqs = (d.equipos || []).map((e: any) => [e.modelo, e.serie].filter(Boolean).join(" ")).filter(Boolean).join(", ");
    const fis = [d.estado_fisico, eqs && "Equipos: " + eqs, d.motivo && !mot && "Motivo escrito: " + d.motivo].filter(Boolean).join(" · ");
    setF(x => ({ ...x, cliente: cli?.id || x.cliente, motivo: mot || (d.motivo ? "Otro" : x.motivo), destino: destino || x.destino, fisico: fis || x.fisico, fecha: d.fecha && d.fecha <= hoy() ? d.fecha : x.fecha, autorizo: aut || x.autorizo }));
    setAvisos(ubicacion ? av : [...av, "No se pudo marcar la ubicación del celular."]);
    return () => { setF(antes); setAvisos([]); };
  };
  const completar = async () => {
    setMsg(""); setOk(""); if (!c) return setMsg("Elige el cliente."); if (!f.motivo) return setMsg("Elige el motivo.");
    if (!confirm(`¿Completar la baja de ${c.nombre}?\n\nQuedará inactivo y su puerto se libera. Esta acción queda registrada con tu nombre.`)) return;
    setOcup(true);
    try {
      const ruta = arch ? await subirArchivo("fotos", c.proyecto_id, arch) : null;
      let rutaHoja: string | null = null; if (hoja) { try { rutaHoja = await subirArchivo("fotos", c.proyecto_id, hoja.archivo); } catch { /* la baja igual se guarda */ } }
      const { error } = await supabase.rpc("completar_baja", { p: { cliente_id: c.id, fecha: f.fecha, motivo: f.motivo, destino: f.destino, estado_fisico: f.fisico, autorizado_nombre: f.autorizo, fotos_path: ruta, lat: hoja?.ubic?.lat ?? null, lng: hoja?.ubic?.lng ?? null, formulario_path: rutaHoja } });
      if (error) throw new Error(error.message);
      setOk(`Baja completada: ${c.nombre} quedó inactivo.`); setF({ ...f, cliente: "", fisico: "" }); setArch(null); setHoja(null); setAvisos([]); clientes.recargar(); bajas.recargar();
    } catch (e: any) { setMsg(e.message); }
    setOcup(false);
  };
  return <>
    <div className="grid g2" style={{ alignItems: "start" }}>
      <div className="card"><h2>Registrar baja</h2>{msg && <Aviso tipo="mal">{msg}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
        <EscanerFormulario tipo="formulario_baja" titulo="Hoja de baja llena a mano" onArchivo={x => setHoja(x ? { archivo: x, ubic: null } : null)} onUbicacion={u => setHoja(h => (h ? { ...h, ubic: u } : h))} onUsar={aplicarHoja} />{avisos.map((a, i) => <Aviso key={i}>{a}</Aviso>)}
        <div className="form" style={{ gridTemplateColumns: "1fr" }}>
          <Campo l="Cliente"><select value={f.cliente} onChange={e => setF({ ...f, cliente: e.target.value })}><option value="">Elige un cliente…</option>{C.map(x => <option key={x.id} value={x.id}>{x.codigo} — {x.nombre}</option>)}</select></Campo>
          <Campo l="Motivo"><select value={f.motivo} onChange={e => setF({ ...f, motivo: e.target.value })}>{MOTIVOS.map(m => <option key={m}>{m}</option>)}</select></Campo>
          <Campo l="Autorizó"><select value={f.autorizo} onChange={e => setF({ ...f, autorizo: e.target.value })}>{autoriza.map(a => <option key={a}>{a}</option>)}</select></Campo>
          <Campo l="Destino del equipo recuperado"><select value={f.destino} onChange={e => setF({ ...f, destino: e.target.value })}>{DESTINOS.map(d => <option key={d[0]} value={d[0]}>{d[1]}</option>)}</select></Campo>
          <Campo l="Estado físico y accesorios"><input placeholder="Ej.: ONU buena, fuente y patch cord" value={f.fisico} onChange={e => setF({ ...f, fisico: e.target.value })} /></Campo>
          <Campo l="Fotos"><input type="file" accept="image/*" key={String(ok)} onChange={e => setArch(e.target.files?.[0] || null)} /></Campo>
          <Campo l="Fecha de la baja"><input type="date" value={f.fecha} max={hoy()} onChange={e => setF({ ...f, fecha: e.target.value })} /></Campo></div>
        <button className="btn" style={{ width: "100%", marginTop: 8 }} disabled={ocup} onClick={completar}>{ocup ? "Procesando…" : "Completar baja"}</button></div>
      <div className="card"><h2>Qué ocurre al completar</h2>{c ? <dl className="ficha">
        <dt>Cliente</dt><dd>{c.nombre} → <b>Inactivo</b></dd><dt>Puerto</dt><dd>{c.naps?.codigo ? `${c.naps.codigo} / ${c.puertos?.numero ?? "—"}` : "—"} → <b>Libre</b>, con su historial</dd>
        <dt>Equipo</dt><dd>→ <b>{dest[2]}</b></dd><dt>Accesorios</dt><dd>{f.fisico ? f.fisico : "Se anotan en el estado físico"}</dd><dt>Historial</dt><dd>Se registra quién, cuándo y por qué</dd></dl> : <Vacio>Elige un cliente para ver qué pasará con su puerto y su equipo.</Vacio>}</div></div>
    <div className="card tw"><h2>Bajas registradas</h2>{bajas.loading ? <Cargando /> : ((bajas.data as any[]) || []).length ? <table><thead><tr><th>Fecha</th><th>Cliente</th><th>Motivo</th><th>Equipo</th><th>Estado físico</th><th>Autorizó</th><th>Ubicación</th><th>Formulario</th></tr></thead>
      <tbody>{((bajas.data as any[]) || []).map(b => <tr key={b.id}><td>{b.fecha}</td><td><b>{b.cliente_nombre}</b><br /><small className="mute">{b.cliente_codigo}</small></td><td>{b.motivo || "—"}</td><td>{b.destino_equipo || "—"}</td><td>{b.estado_fisico || "—"}</td><td>{b.autorizado_nombre || "—"}</td><td>{b.lat != null && b.lng != null ? <a href={`https://www.google.com/maps?q=${b.lat},${b.lng}`} target="_blank" rel="noreferrer">Ver en el mapa</a> : "—"}</td><td>{b.formulario_path ? <button className="btn suave chico" onClick={async () => { const u = await urlArchivo("fotos", b.formulario_path); if (u) window.open(u, "_blank"); }}>Ver formulario</button> : "—"}</td></tr>)}</tbody></table> : <Vacio>Aún no hay bajas registradas.</Vacio>}</div>
  </>;
}
