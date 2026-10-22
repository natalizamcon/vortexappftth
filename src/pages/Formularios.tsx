import { ReactNode, useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../lib/auth";
import { Aviso, Cargando, bs, hoy, useAlcance, useQuery } from "../lib/ui";

const n = (x: any) => Number(x) || 0;
const fechaLarga = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("es-BO", { day: "numeric", month: "long", year: "numeric" });
const sumaDias = (d: string, k: number) => new Date(+new Date(d + "T12:00:00") + k * 86400000).toISOString().slice(0, 10);
const vacio = Promise.resolve({ data: [], error: null });

type Uso = "cliente" | "nap" | "viaje" | "materiales" | "zona";
const FORMS: { id: string; nombre: string; desc: string; usa: Uso }[] = [
  { id: "contrato", nombre: "Contrato de servicio", desc: "Con permanencia mínima de 1 año y devolución de equipos. Se llena con los datos del cliente.", usa: "cliente" },
  { id: "instalacion", nombre: "Orden de instalación", desc: "Para el técnico: datos del cliente, equipos, materiales, mediciones y firmas.", usa: "cliente" },
  { id: "nap", nombre: "Ficha de NAP", desc: "Puertos de una NAP con su estado y a quién pertenece cada uno.", usa: "nap" },
  { id: "troncal", nombre: "Registro de troncal", desc: "Ruta, longitud, hilos y postes de una troncal.", usa: "zona" },
  { id: "fusiones", nombre: "Registro de fusiones", desc: "Planilla para anotar cada fusión de hilos con su pérdida.", usa: "zona" },
  { id: "ferreteria", nombre: "Lista de compras de ferretería", desc: "Materiales a comprar. Puede traer solo los que están bajo el mínimo.", usa: "materiales" },
  { id: "viaje", nombre: "Gastos del viaje", desc: "Planilla diaria de gasolina, viáticos y movilidad de un viaje.", usa: "viaje" },
];

/* ---------- piezas de la hoja ---------- */
const L = ({ v, w }: { v?: any; w?: number }) => <span className="linea" style={w ? { minWidth: w } : undefined}>{v ?? ""}</span>;
const D = ({ e, v, w }: { e: string; v?: any; w?: number }) => <span className="dato"><b>{e}:</b><L v={v} w={w} /></span>;
const Pend = ({ children }: { children: ReactNode }) => <span className="pend">{children}</span>;
function Tabla({ cols, filas = [], vacias = 0 }: { cols: string[]; filas?: any[][]; vacias?: number }) {
  return <table><thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
    <tbody>{filas.map((f, i) => <tr key={i}>{f.map((c, j) => <td key={j}>{c}</td>)}</tr>)}{Array.from({ length: vacias }).map((_, i) => <tr key={"v" + i}>{cols.map(c => <td key={c} />)}</tr>)}</tbody></table>;
}
const Cab = ({ titulo, sub }: { titulo: string; sub?: string }) => <div className="cab"><img src="/logo.png" alt="Vortex" /><div className="t"><h1>{titulo}</h1>{sub && <div className="sub">{sub}</div>}</div><div className="sub">Fecha: {fechaLarga(hoy())}</div></div>;
const Firmas = ({ a, b }: { a: string; b: string }) => <div className="firmas"><div>{a}</div><div>{b}</div></div>;
const Casilla = ({ children }: { children: ReactNode }) => <div><span className="caja" />{children}</div>;

/* ---------- los formularios ---------- */
function Contrato({ c, zona, equipos, puerto, nap }: any) {
  const inst = c?.fecha_instalacion || hoy();
  return <>
    <Cab titulo="CONTRATO DE SERVICIO DE INTERNET POR FIBRA ÓPTICA" sub={zona ? "Zona " + zona.nombre : undefined} />
    <p>Entre <b>VORTEX, Internet de Fibra Óptica</b>, en adelante <b>LA EMPRESA</b>, y <b>{c?.nombre || "______________________________"}</b>, con C.I. <b>{c?.ci || "______________"}</b>, domiciliado(a) en <b>{c?.direccion || "______________________________________"}</b>, teléfono <b>{c?.telefono || "______________"}</b>, en adelante <b>EL CLIENTE</b>, se acuerda lo siguiente:</p>
    <h2>PRIMERA · Objeto</h2>
    <p>LA EMPRESA presta a EL CLIENTE el servicio de acceso a internet por fibra óptica, plan <b>{c?.plan_nombre || "__________"}</b> de <b>{c?.mbps || "____"} Mbps</b>{nap ? <>, conectado a la NAP <b>{nap.codigo}</b>{puerto ? <>, puerto <b>{puerto.numero}</b></> : null}</> : null}, en el domicilio indicado.</p>
    <h2>SEGUNDA · Precio y forma de pago</h2>
    <p>El precio del servicio es de <b>{c ? bs(c.precio_mensual) : "Bs ________"}</b> por mes. El pago se realiza por mes y debe efectuarse a más tardar el día <b>{zona?.dia_corte || "____"}</b> de cada mes. El primer cobro se calcula en proporción a los días reales desde la instalación hasta el siguiente día de corte. EL CLIENTE debe conservar su comprobante de pago.</p>
    <h2>TERCERA · Instalación</h2>
    <p>El costo de instalación es de <b>{c ? bs(c.precio_instalacion) : "Bs ________"}</b>. La instalación se realizó o realizará el <b>{fechaLarga(inst)}</b>.</p>
    <h2>CUARTA · Plazo mínimo de permanencia</h2>
    <p>El servicio tiene una vigencia mínima de <b>UN (1) AÑO</b> contado desde la fecha de instalación. Cumplido ese plazo, el servicio continúa mes a mes hasta que EL CLIENTE solicite la baja. Si EL CLIENTE solicita la baja antes de cumplir el año, deberá cumplir con la siguiente condición: <Pend>__________________________ (definir)</Pend>.</p>
    <h2>QUINTA · Equipos y devolución</h2>
    <p>Los equipos entregados para prestar el servicio (ONU, router y accesorios) son <b>propiedad de LA EMPRESA</b> y se entregan en calidad de uso. EL CLIENTE se compromete a cuidarlos, no abrirlos, no prestarlos ni cambiarlos de lugar sin avisar. Al terminar el servicio, EL CLIENTE debe <b>devolverlos en buen estado</b> dentro de <Pend>____ días</Pend>. En caso de pérdida, robo o daño por mal uso, EL CLIENTE pagará su costo de reposición.</p>
    <Tabla cols={["Equipo", "Modelo", "N° de serie", "MAC"]} filas={(equipos || []).map((e: any) => ["Equipo", e.modelo || "", e.serie || "", e.mac || ""])} vacias={Math.max(0, 3 - (equipos || []).length)} />
    <h2>SEXTA · Falta de pago y suspensión</h2>
    <p>Si el pago no se realiza hasta el día de corte, LA EMPRESA puede suspender el servicio. El servicio se restablece una vez regularizada la deuda.</p>
    <h2>SÉPTIMA · Soporte</h2>
    <p>EL CLIENTE puede reportar fallas a LA EMPRESA, que las atenderá en el menor tiempo posible. LA EMPRESA no responde por interrupciones causadas por cortes de energía, fuerza mayor o hechos ajenos a su red.</p>
    <h2>OCTAVA · Uso del servicio</h2>
    <p>EL CLIENTE usará el servicio de forma lícita y no lo revenderá ni lo compartirá con terceros fuera de su domicilio sin autorización de LA EMPRESA.</p>
    <h2>NOVENA · Datos personales</h2>
    <p>EL CLIENTE autoriza a LA EMPRESA a usar sus datos para la prestación del servicio, la facturación y la atención de reclamos.</p>
    <p style={{ marginTop: 12 }}>En conformidad, firman las partes en ____________________, a los {new Date().getDate()} días del mes de {new Date().toLocaleDateString("es-BO", { month: "long" })} de {new Date().getFullYear()}.</p>
    <Firmas a={`EL CLIENTE${c ? " · " + c.nombre : ""}`} b="LA EMPRESA · VORTEX" />
  </>;
}

function Instalacion({ c, zona, equipos, puerto, nap }: any) {
  return <>
    <Cab titulo="ORDEN DE INSTALACIÓN" sub={zona ? "Zona " + zona.nombre : undefined} />
    <h2>Datos del cliente</h2>
    <D e="Código" v={c?.codigo} w={90} /><D e="Nombre" v={c?.nombre} w={280} /><D e="C.I." v={c?.ci} w={110} /><br />
    <D e="Dirección" v={c?.direccion} w={380} /><D e="Teléfono" v={c?.telefono} w={110} />
    <h2>Servicio</h2>
    <D e="Plan" v={c?.plan_nombre} w={120} /><D e="Mbps" v={c?.mbps} w={60} /><D e="Precio mensual" v={c ? bs(c.precio_mensual) : ""} w={100} /><D e="NAP" v={nap?.codigo} w={90} /><D e="Puerto" v={puerto?.numero} w={50} />
    <h2>Equipos instalados</h2>
    <Tabla cols={["Equipo", "Modelo", "N° de serie", "MAC"]} filas={(equipos || []).map((e: any) => ["", e.modelo || "", e.serie || "", e.mac || ""])} vacias={Math.max(2, 4 - (equipos || []).length)} />
    <h2>Materiales usados</h2>
    <Tabla cols={["Material", "Cantidad", "Unidad"]} vacias={7} />
    <h2>Mediciones</h2>
    <D e="Potencia en la NAP (dBm)" w={90} /><D e="Potencia en la ONU (dBm)" w={90} /><D e="Velocidad medida (Mbps)" w={90} />
    <h2>Fotos tomadas</h2>
    <Casilla>Equipo instalado</Casilla><Casilla>Conexión en la NAP</Casilla><Casilla>Fachada de la casa</Casilla><Casilla>Prueba de velocidad</Casilla>
    <h2>Observaciones</h2><div className="linea" style={{ display: "block", minHeight: 44 }} />
    <D e="Fecha de instalación" v={c?.fecha_instalacion} w={120} /><D e="Técnico" w={200} />
    <Firmas a="Técnico instalador" b={`Conformidad del cliente${c ? " · " + c.nombre : ""}`} />
  </>;
}

function FichaNap({ nap, zona, puertos, clientesNap }: any) {
  const porPuerto: Record<string, string> = {}; (clientesNap || []).forEach((c: any) => { porPuerto[c.puerto_id] = c.nombre; });
  const filas = (puertos || []).map((p: any) => [p.numero, p.estado, porPuerto[p.id] || p.reservado_para || "", ""]);
  return <>
    <Cab titulo="FICHA DE NAP" sub={zona ? "Zona " + zona.nombre : undefined} />
    <D e="Código" v={nap?.codigo} w={110} /><D e="Tipo" v={nap?.tipo} w={100} /><D e="Cantidad de puertos" v={nap?.puertos} w={60} /><br />
    <D e="Ubicación / coordenadas" v={nap?.lat != null && nap?.lng != null ? `${nap.lat}, ${nap.lng}` : ""} w={300} /><D e="Poste N°" w={80} />
    <h2>Puertos</h2>
    {nap ? <Tabla cols={["Puerto", "Estado", "Cliente o reservado para", "Observación"]} filas={filas} /> : <Tabla cols={["Puerto", "Estado", "Cliente o reservado para", "Observación"]} vacias={16} />}
    <h2>Observaciones</h2><div className="linea" style={{ display: "block", minHeight: 40 }} />
    <D e="Revisado por" w={200} /><D e="Fecha" w={100} />
  </>;
}

function Troncal({ zona }: any) {
  return <>
    <Cab titulo="REGISTRO DE TRONCAL" sub={zona ? "Zona " + zona.nombre : undefined} />
    <D e="Código de troncal" w={120} /><D e="Desde" w={160} /><D e="Hasta" w={160} /><br />
    <D e="Longitud total (m)" w={90} /><D e="Cantidad de hilos" w={70} /><D e="Tipo de fibra" w={120} /><D e="Fecha" w={100} />
    <h2>Postes</h2>
    <Tabla cols={["N° de poste", "Coordenadas", "Tramo (m)", "Estado", "Observación"]} vacias={12} />
    <h2>Hilos de la troncal</h2>
    <Tabla cols={["Hilo", "Color", "Destino", "Estado"]} vacias={6} />
    <D e="Responsable" w={220} />
    <Firmas a="Técnico responsable" b="Supervisor" />
  </>;
}

function Fusiones({ zona }: any) {
  return <>
    <Cab titulo="REGISTRO DE FUSIONES" sub={zona ? "Zona " + zona.nombre : undefined} />
    <D e="Troncal / caja" w={200} /><D e="Fecha" w={100} /><D e="Técnico" w={180} />
    <Tabla cols={["N°", "Hilo / color", "Origen", "Destino", "Pérdida (dB)", "Observación"]} vacias={20} />
    <Firmas a="Técnico" b="Supervisor" />
  </>;
}

function Ferreteria({ filas, zona }: any) {
  const total = filas.reduce((s: number, f: any) => s + f.comprar * n(f.costo), 0);
  return <>
    <Cab titulo="LISTA DE COMPRAS DE FERRETERÍA" sub={zona ? "Zona " + zona.nombre : undefined} />
    <D e="Proveedor" w={220} /><D e="Solicitado por" w={200} />
    <Tabla cols={["Material", "Unidad", "Hay", "Mínimo", "Comprar", "Costo unit.", "Total est."]}
      filas={filas.map((f: any) => [f.nombre, f.unidad, f.tiene, n(f.minimo), f.comprar, bs(f.costo), bs(f.comprar * n(f.costo))])} vacias={Math.max(4, 12 - filas.length)} />
    <p><b>Total estimado: {bs(total)}</b></p>
    <Firmas a="Solicita" b="Aprueba" />
  </>;
}

function Viaje({ v, zona }: any) {
  const dias: string[] = []; if (v) for (let d = v.fecha_inicio, i = 0; d <= v.fecha_fin && i < 31; d = sumaDias(d, 1), i++) dias.push(d);
  return <>
    <Cab titulo="PLANILLA DE GASTOS DEL VIAJE" sub={zona ? "Zona " + zona.nombre : undefined} />
    <D e="Tipo" v={v?.tipo} w={140} /><D e="Detalle" v={v?.detalle} w={260} /><br />
    <D e="Desde" v={v?.fecha_inicio} w={100} /><D e="Hasta" v={v?.fecha_fin} w={100} /><D e="Personal" v={v?.personal} w={220} /><D e="Personas" v={v?.personas} w={50} />
    {v && <p><b>Presupuestado:</b> gasolina {bs(v.gasolina)} · movilidad {bs(v.movilidad)} · pago por día {bs(v.pago_dia)} · viáticos por día {bs(v.viaticos_dia)}</p>}
    <Tabla cols={["Fecha", "Actividad", "Gasolina", "Viáticos", "Movilidad", "Otros", "N° comprobante"]} filas={dias.map(d => [d, "", "", "", "", "", ""])} vacias={v ? 2 : 8} />
    <p><b>Total gastado:</b> <L w={140} /></p>
    <Firmas a="Responsable del viaje" b="Revisado por" />
  </>;
}

/* ---------- pantalla ---------- */
export default function Formularios() {
  const { zonas, zonaId } = useApp(), al = useAlcance();
  const [formId, setFormId] = useState("contrato"), [rec, setRec] = useState(""), [soloBajos, setSoloBajos] = useState(true), [version, setVersion] = useState(0);
  const F = FORMS.find(f => f.id === formId)!;
  const elegir = (id: string) => { setFormId(id); setRec(""); setVersion(v => v + 1); };

  const clientes = useQuery(() => F.usa === "cliente" ? al(supabase.from("clientes").select("id, codigo, nombre, ci, telefono, direccion, plan_nombre, mbps, precio_mensual, precio_instalacion, fecha_instalacion, zona_id, nap_id, puerto_id").neq("estado", "BAJA").order("nombre").limit(500)) : vacio, [formId, zonaId]);
  const naps = useQuery(() => F.usa === "nap" ? al(supabase.from("naps").select("id, codigo, tipo, puertos, zona_id, lat, lng").order("codigo").limit(300)) : vacio, [formId, zonaId]);
  const viajes = useQuery(() => F.usa === "viaje" ? al(supabase.from("viajes").select("*").order("fecha_inicio", { ascending: false }).limit(60)) : vacio, [formId, zonaId]);
  const mats = useQuery(() => F.usa === "materiales" ? al(supabase.from("materiales").select("id, nombre, unidad, minimo, costo").order("nombre").limit(500), false) : vacio, [formId, zonaId]);
  const stock = useQuery(() => F.usa === "materiales" ? al(supabase.from("stock").select("material_id, cantidad").limit(5000), false) : vacio, [formId, zonaId]);

  const C: any = ((clientes.data as any[]) || []).find(x => x.id === rec), N: any = ((naps.data as any[]) || []).find(x => x.id === rec), V: any = ((viajes.data as any[]) || []).find(x => x.id === rec);
  const equipos = useQuery(() => C ? supabase.from("equipos_serie").select("serie, modelo, mac").eq("cliente_id", C.id) : vacio, [C?.id]);
  const puerto = useQuery(() => C?.puerto_id ? supabase.from("puertos").select("numero").eq("id", C.puerto_id).maybeSingle() : vacio, [C?.puerto_id]);
  const napC = useQuery(() => C?.nap_id ? supabase.from("naps").select("codigo").eq("id", C.nap_id).maybeSingle() : vacio, [C?.nap_id]);
  const puertos = useQuery(() => N ? supabase.from("puertos").select("id, numero, estado, reservado_para").eq("nap_id", N.id).order("numero") : vacio, [N?.id]);
  const clientesNap = useQuery(() => N ? supabase.from("clientes").select("puerto_id, nombre").eq("nap_id", N.id).neq("estado", "BAJA") : vacio, [N?.id]);

  const zona = zonas.find(z => z.id === (C?.zona_id || N?.zona_id || V?.zona_id || zonaId));
  const tot: Record<string, number> = {}; ((stock.data as any[]) || []).forEach(s => { tot[s.material_id] = (tot[s.material_id] || 0) + n(s.cantidad); });
  const filasMat = ((mats.data as any[]) || []).map(m => ({ ...m, tiene: tot[m.id] || 0, comprar: Math.max(0, n(m.minimo) - (tot[m.id] || 0)) })).filter(m => !soloBajos || m.comprar > 0);
  const lista: any[] = F.usa === "cliente" ? (clientes.data as any[]) || [] : F.usa === "nap" ? (naps.data as any[]) || [] : F.usa === "viaje" ? (viajes.data as any[]) || [] : [];
  const cargando = clientes.loading || naps.loading || viajes.loading || mats.loading;
  const ep = (equipos.data as any[]) || [], pu: any = puerto.data, nc: any = napC.data;

  return <>
    <h1>Formularios</h1>
    <Aviso>Elige un formulario, y si quieres, el registro con el que se llena solo. Puedes <b>escribir sobre la hoja</b> para ajustar el texto antes de imprimir. Para guardar en PDF, en la ventana de impresión elige "Guardar como PDF".</Aviso>
    <div className="grid g2" style={{ marginBottom: 14 }}>
      <div className="card"><h2>1. Elige el formulario</h2><div style={{ display: "grid", gap: 6 }}>{FORMS.map(f => <button key={f.id} className={"btn suave" + (f.id === formId ? " on" : "")} style={{ textAlign: "left", outline: f.id === formId ? "2px solid var(--acc)" : undefined }} onClick={() => elegir(f.id)}><b>{f.nombre}</b><br /><span className="mute" style={{ fontWeight: 400 }}>{f.desc}</span></button>)}</div></div>
      <div className="card"><h2>2. Llénalo con datos (opcional)</h2>
        {F.usa === "cliente" && <select value={rec} onChange={e => setRec(e.target.value)}><option value="">En blanco</option>{((clientes.data as any[]) || []).map(c => <option key={c.id} value={c.id}>{c.codigo} · {c.nombre}</option>)}</select>}
        {F.usa === "nap" && <select value={rec} onChange={e => setRec(e.target.value)}><option value="">En blanco</option>{((naps.data as any[]) || []).map(c => <option key={c.id} value={c.id}>{c.codigo} ({c.puertos} puertos)</option>)}</select>}
        {F.usa === "viaje" && <select value={rec} onChange={e => setRec(e.target.value)}><option value="">En blanco</option>{((viajes.data as any[]) || []).map(c => <option key={c.id} value={c.id}>{c.fecha_inicio} · {c.tipo}{c.detalle ? " · " + c.detalle : ""}</option>)}</select>}
        {F.usa === "materiales" && <label className="fila"><input type="checkbox" checked={soloBajos} onChange={e => setSoloBajos(e.target.checked)} /> Solo los materiales bajo el mínimo</label>}
        {F.usa === "zona" && <p className="mute">Se imprime en blanco{zona ? <> con la zona <b>{zona.nombre}</b></> : ". Elige una zona arriba para que aparezca en el encabezado"}.</p>}
        {F.usa !== "zona" && F.usa !== "materiales" && !lista.length && !cargando && <p className="mute">No hay registros{zonaId ? " en esta zona" : ""}; puedes imprimirlo en blanco.</p>}
        <div className="fila" style={{ marginTop: 12 }}><button className="btn" onClick={() => window.print()}>Imprimir / Guardar PDF</button><button className="btn suave" onClick={() => setVersion(v => v + 1)}>Quitar mis ajustes de texto</button></div>
        {formId === "contrato" && <Aviso tipo="mal">El texto del contrato es un modelo. Las partes marcadas en amarillo debes definirlas tú, y conviene que un abogado lo revise antes de usarlo con clientes.</Aviso>}
      </div>
    </div>
    {cargando ? <Cargando /> : <div className="hoja" key={formId + rec + version + soloBajos} contentEditable suppressContentEditableWarning>
      {formId === "contrato" && <Contrato c={C} zona={zona} equipos={ep} puerto={pu} nap={nc ? { codigo: nc.codigo } : null} />}
      {formId === "instalacion" && <Instalacion c={C} zona={zona} equipos={ep} puerto={pu} nap={nc} />}
      {formId === "nap" && <FichaNap nap={N} zona={zona} puertos={(puertos.data as any[]) || []} clientesNap={(clientesNap.data as any[]) || []} />}
      {formId === "troncal" && <Troncal zona={zona} />}
      {formId === "fusiones" && <Fusiones zona={zona} />}
      {formId === "ferreteria" && <Ferreteria filas={filasMat} zona={zona} />}
      {formId === "viaje" && <Viaje v={V} zona={zona} />}
    </div>}
  </>;
}
