// Recibe las notificaciones de pago del banco o de la pasarela de pagos y las guarda en Vortex.
// El banco o la pasarela llama a:  https://TU-SITIO.netlify.app/.netlify/functions/banco-webhook
// Variables necesarias en Netlify (Site configuration → Environment variables):
//   BANCO_WEBHOOK_SECRET        una clave larga que tú inventas; se la das al banco para que firme sus avisos
//   SUPABASE_URL                el mismo Project URL de Supabase
//   SUPABASE_SERVICE_ROLE_KEY   la clave "service_role" (Supabase → Project settings → API). ¡Es secreta! Solo va en Netlify.
//   BANCO_PROYECTO_ID           (opcional) el id del proyecto al que pertenecen los pagos; si no, se usa el principal
//   BANCO_NOMBRE                (opcional) nombre del banco o pasarela, por ejemplo "Banco Unión"
import { timingSafeEqual } from "node:crypto";

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const pick = (o, claves) => { for (const k of claves) { const v = o?.[k]; if (v !== undefined && v !== null && String(v).trim() !== "") return v; } return undefined; };
const iguales = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

/** "1.234,56", "1,234.56", "140", "Bs 140.00" → número */
export function aNumero(v) {
  if (typeof v === "number") return isFinite(v) ? v : null;
  let s = String(v ?? "").replace(/[^0-9.,-]/g, ""); if (!s) return null;
  const c = s.lastIndexOf(","), p = s.lastIndexOf(".");
  if (c >= 0 && p >= 0) s = c > p ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (c >= 0) s = /,\d{1,2}$/.test(s) ? s.replace(",", ".") : s.replace(/,/g, "");
  const n = Number(s); return isFinite(n) ? n : null;
}
function aFecha(v) {
  if (!v) return new Date().toISOString();
  const s = String(v).trim(), m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/);
  const d = m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], (+m[4] || 0) + 4, +m[5] || 0)) : new Date(/^\d{10,13}$/.test(s) ? (s.length === 10 ? +s * 1000 : +s) : s); // 04:00 UTC = 00:00 en Bolivia
  return isNaN(d) ? new Date().toISOString() : d.toISOString();
}
const PAGADO = ["pagado", "paid", "completed", "complete", "success", "successful", "exitoso", "confirmado", "confirmed", "aprobado", "approved", "processed", "procesado", "ok", "1", "true", "acreditado"];

/** Cada banco o pasarela manda sus campos con nombres distintos: aquí se reconocen los más comunes. */
export function normalizar(item, banco) {
  const o = { ...item }; for (const k of ["data", "payload", "transaction", "transaccion", "pago", "payment", "attributes"]) if (item?.[k] && typeof item[k] === "object" && !Array.isArray(item[k])) Object.assign(o, item[k]);
  const estado = pick(o, ["estado", "status", "state", "estado_pago"]);
  if (estado !== undefined && !PAGADO.includes(String(estado).trim().toLowerCase())) return { omitido: `estado "${estado}"` };
  const monto = aNumero(pick(o, ["monto", "amount", "importe", "total", "monto_pagado", "montoPagado", "valor", "abono"]));
  const referencia = pick(o, ["referencia", "reference", "ref", "id", "transactionId", "transaction_id", "idTransaccion", "id_transaccion", "nro_operacion", "numeroOperacion", "numero_operacion", "nroTransaccion", "numero_transaccion", "comprobante", "idQr", "id_qr"]);
  if (monto === null || monto <= 0) return { error: "no trae un monto válido" };
  if (referencia === undefined) return { error: "no trae número de operación o referencia" };
  const moneda = String(pick(o, ["moneda", "currency"]) ?? "BOB").toUpperCase();
  return { ok: { referencia: String(referencia), monto, fecha: aFecha(pick(o, ["fecha", "date", "fechaHora", "fecha_pago", "fechaPago", "created_at", "createdAt", "timestamp", "datetime", "fecha_transaccion"])),
    moneda: ["BS", "BOB", "BS.", "BOLIVIANOS"].includes(moneda) ? "BOB" : moneda, remitente: pick(o, ["remitente", "payer", "payer_name", "nombre", "nombre_cliente", "nombreCliente", "ordenante", "titular", "debtor", "customer_name", "sender", "cliente", "razon_social"]),
    cuenta: pick(o, ["cuenta", "account", "cuenta_origen", "cuentaOrigen", "numero_cuenta"]), glosa: pick(o, ["glosa", "description", "descripcion", "concepto", "detalle", "memo", "motivo", "observaciones", "mensaje", "message"]),
    banco: String(pick(o, ["banco", "bank", "entidad", "entidad_origen"]) ?? banco ?? "") } };
}

const rpc = async (url, clave, nombre, cuerpo) => {
  const r = await fetch(`${url}/rest/v1/rpc/${nombre}`, { method: "POST", headers: { apikey: clave, authorization: `Bearer ${clave}`, "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { /* sin cuerpo */ }
  if (!r.ok) throw new Error(j?.message || t.slice(0, 200) || `error ${r.status}`); return j;
};

export default async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Solo se permite POST" });
  const { BANCO_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BANCO_PROYECTO_ID, BANCO_NOMBRE } = process.env;
  if (!BANCO_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return json(503, { ok: false, error: "La conexión con el banco no está configurada en Netlify" });
  const u = new URL(req.url), recibido = (req.headers.get("x-webhook-secret") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || u.searchParams.get("token") || "").trim();
  if (!recibido || !iguales(recibido, BANCO_WEBHOOK_SECRET)) return json(401, { ok: false, error: "No autorizado" });
  let cuerpo; try { cuerpo = await req.json(); } catch { return json(400, { ok: false, error: "El cuerpo no es un JSON válido" }); }
  const lista = Array.isArray(cuerpo) ? cuerpo : Array.isArray(cuerpo?.transacciones) ? cuerpo.transacciones : Array.isArray(cuerpo?.transactions) ? cuerpo.transactions : Array.isArray(cuerpo?.data) ? cuerpo.data : [cuerpo];
  if (!lista.length || lista.length > 500) return json(400, { ok: false, error: "Debe traer entre 1 y 500 movimientos" });
  const url = SUPABASE_URL.replace(/\/+$/, ""), r = { ok: true, recibidos: lista.length, nuevos: 0, duplicados: 0, omitidos: [], errores: [] };
  for (const [i, item] of lista.entries()) {
    const n = normalizar(item, BANCO_NOMBRE); if (n.omitido) { r.omitidos.push(`#${i + 1}: ${n.omitido}`); continue; } if (n.error) { r.errores.push(`#${i + 1}: ${n.error}`); continue; }
    try { const x = await rpc(url, SUPABASE_SERVICE_ROLE_KEY, "registrar_movimiento_banco", { p: { ...n.ok, origen: "webhook", proyecto_id: BANCO_PROYECTO_ID || null, crudo: item } }); if (x?.nuevo) r.nuevos++; else r.duplicados++; }
    catch (e) { r.errores.push(`#${i + 1}: ${e.message}`); }
  }
  if (r.nuevos) { try { Object.assign(r, await rpc(url, SUPABASE_SERVICE_ROLE_KEY, "conciliar_banco", {})); } catch (e) { r.errores.push("No se pudo reconocer a los clientes: " + e.message); } }
  console.log("banco-webhook", JSON.stringify({ recibidos: r.recibidos, nuevos: r.nuevos, duplicados: r.duplicados, errores: r.errores.length }));
  return json(r.errores.length && !r.nuevos && !r.duplicados ? 422 : 200, r);
};
