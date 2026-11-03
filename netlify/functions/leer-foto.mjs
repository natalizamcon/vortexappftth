// Lee una foto con Claude (visión) y devuelve los datos en JSON.
// Necesita estas variables en Netlify (Site configuration → Environment variables):
//   ANTHROPIC_API_KEY   la clave de la API de Anthropic
//   SUPABASE_URL        el mismo Project URL de Supabase que usa la app
//   SUPABASE_ANON_KEY   la misma clave pública (anon) de Supabase
//   ANTHROPIC_MODEL     (opcional) el modelo a usar; por defecto claude-sonnet-5-5

const BASE = "Eres un asistente que lee fotos para una empresa de internet por fibra óptica en Bolivia. Responde ÚNICAMENTE con un objeto JSON válido, sin texto antes ni después y sin comillas triples. Si un dato no se ve con claridad, usa null: nunca lo inventes ni lo completes por lógica. Los números van sin separadores de miles y con punto decimal. En \"confianza\" pon \"alta\", \"media\" o \"baja\" según qué tan legible es la foto, y en \"notas\" una frase corta con cualquier duda.";

const FORM = "La foto es de una hoja impresa de Vortex (Internet de Fibra Óptica) llenada a mano. Lee lo escrito a mano junto a cada etiqueta impresa e ignora el texto impreso que no tenga nada escrito. Las casillas marcadas (con X, ✓ o rellenas) indican la opción elegida. Teléfonos y códigos van como texto sin espacios de más. Las fechas en Bolivia vienen día/mes/año: conviértelas a AAAA-MM-DD. En las tablas devuelve solo las filas que tengan algo escrito. ";
const EQUIPOS = '"equipos": [{"equipo": ..., "modelo": ..., "serie": ..., "mac": MAC en mayúsculas con formato AA:BB:CC:DD:EE:FF o null}]';
const MATERIALES = '"materiales": [{"material": ..., "cantidad": número o null, "unidad": ...}]';

const TIPOS = {
  etiqueta_equipo: { max: 400, prompt: `${BASE}\n\nLa foto es la etiqueta de un equipo de red (ONU, ONT, router, OLT u otro). Devuelve: {"serie": número de serie tal como está impreso (si hay SN y GPON SN, usa el GPON SN o el SN de la ONU y menciona el otro en notas) o null, "mac": dirección MAC en mayúsculas con formato AA:BB:CC:DD:EE:FF o null, "modelo": modelo o null, "marca": marca o null, "confianza": "...", "notas": "..."}` },
  comprobante: { max: 400, prompt: `${BASE}\n\nLa foto es el comprobante de un pago (transferencia QR, depósito o recibo) en Bolivia. Devuelve: {"monto": monto pagado como número o null, "moneda": "BOB" o "USD" o null, "fecha": fecha en formato AAAA-MM-DD o null (en Bolivia las fechas vienen día/mes/año), "referencia": número de operación o transacción o null, "banco": banco o aplicación o null, "remitente": quien pagó o null, "destinatario": quien recibió o null, "confianza": "...", "notas": "..."}` },
  potencia: { max: 300, prompt: `${BASE}\n\nLa foto muestra la lectura de potencia óptica (medidor de potencia o pantalla de una ONU u OLT). Devuelve: {"potencia_dbm": valor en dBm como número (normalmente negativo, por ejemplo -18.5) o null, "punto": "rx", "tx" o null según lo que indique la pantalla, "confianza": "...", "notas": "..."}` },
  carnet: { max: 300, prompt: `${BASE}\n\nLa foto es el carnet de identidad de una persona en Bolivia. Devuelve solamente: {"nombre": nombres y apellidos completos o null, "ci": número del carnet sin la extensión o null, "extension": extensión del departamento (por ejemplo CB, LP, SC) o null, "confianza": "...", "notas": "..."}. No incluyas ningún otro dato personal.` },
  formulario_instalacion: { max: 1600, prompt: `${BASE}\n\n${FORM}Es una ORDEN DE INSTALACIÓN. Devuelve: {"codigo": código del cliente o null, "nombre": ..., "ci": número de carnet o null, "direccion": ..., "telefono": ..., "referencia_nombre": ..., "referencia_telefono": ..., "plan": nombre del plan o null, "mbps": número o null, "precio_mensual": número o null, "precio_instalacion": número o null, "nap": código de la NAP (por ejemplo NAP-A1-01) o null, "puerto": número o null, ${EQUIPOS}, ${MATERIALES}, "potencia_nap_dbm": número o null, "potencia_onu_dbm": número o null, "velocidad_mbps": número o null, "observaciones": texto o null, "fecha": "AAAA-MM-DD" o null, "tecnico": nombre o null, "confianza": "...", "notas": "..."}. Ignora la sección "Fotos tomadas".` },
  formulario_baja: { max: 1400, prompt: `${BASE}\n\n${FORM}Es una ORDEN DE BAJA DE SERVICIO. Devuelve: {"codigo": código del cliente o null, "nombre": ..., "ci": ..., "plan": ..., "nap": ..., "puerto": número o null, "fecha": "AAAA-MM-DD" o null, "motivo": el texto exacto de la opción de motivo marcada, o lo que se escribió en "Otro", o null, "destino_equipo": "Almacén", "Mantenimiento", "Descarte" o "Aún no recuperado" según la casilla marcada, o null, ${EQUIPOS}, "estado_fisico": texto o null, "autorizo": nombre o null, "tecnico": nombre o null, "confianza": "...", "notas": "..."}` },
  formulario_mantenimiento: { max: 1400, prompt: `${BASE}\n\n${FORM}Es una ORDEN DE MANTENIMIENTO. Devuelve: {"objeto": "NAP", "Red troncal", "Equipo", "Cambio de antena" u "Otro" según la casilla marcada, o null, "referencia": código de la NAP, troncal o equipo, o null, "tipo": "Correctivo", "Preventivo", "Reemplazo de equipo", "Reparación de fibra" o "Cambio de NAP o puerto" según la casilla marcada, o null, "problema": texto o null, "solucion": texto o null, ${MATERIALES}, "potencia_antes_dbm": número o null, "potencia_despues_dbm": número o null, "costo": número en Bs o null, "fecha": "AAAA-MM-DD" o null, "tecnico": nombre o null, "confianza": "...", "notas": "..."}` },
};

const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
const usos = new Map(); // límite suave por usuario (se reinicia cuando la función "duerme")
const POR_HORA = 60;

function extraerJSON(texto) {
  if (!texto) return null;
  const limpio = texto.replace(/```json|```/gi, "").trim();
  try { return JSON.parse(limpio); } catch { /* sigue */ }
  const a = limpio.indexOf("{"), b = limpio.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(limpio.slice(a, b + 1)); } catch { /* nada */ } }
  return null;
}

const mensajeIA = (estado) => estado === 401 || estado === 403 ? "La clave de Anthropic no es válida o no tiene permiso. Revisa ANTHROPIC_API_KEY en Netlify."
  : estado === 404 ? "El modelo configurado no existe. Revisa ANTHROPIC_MODEL en Netlify o quítala para usar el de por defecto."
  : estado === 429 ? "Se hicieron demasiadas lecturas seguidas. Espera un minuto y vuelve a intentar."
  : estado === 400 ? "La IA no pudo procesar esa imagen. Prueba con otra foto."
  : estado === 529 || estado >= 500 ? "El servicio de IA está ocupado. Intenta de nuevo en un momento." : "La IA no pudo leer la foto.";

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "metodo", detalle: "Solo se permite POST." });
  const { ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } = process.env, modelo = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
  if (!ANTHROPIC_API_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) return json(503, { error: "configuracion", detalle: "Falta configurar la lectura con IA en Netlify (ANTHROPIC_API_KEY, SUPABASE_URL y SUPABASE_ANON_KEY)." });

  // 1) Solo usuarios con sesión y cuenta activa
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return json(401, { error: "sesion", detalle: "Inicia sesión para usar esta función." });
  const url = SUPABASE_URL.replace(/\/+$/, "");
  let usuario;
  try {
    const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` } });
    if (!r.ok) return json(401, { error: "sesion", detalle: "Tu sesión venció. Vuelve a entrar." });
    usuario = await r.json();
    const p = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(usuario.id)}&select=rol,activo`, { headers: { apikey: SUPABASE_ANON_KEY, authorization: `Bearer ${token}` } });
    const perfil = p.ok ? (await p.json())[0] : null;
    if (!perfil || !perfil.activo || perfil.rol === "pendiente") return json(403, { error: "permiso", detalle: "Tu cuenta no tiene acceso." });
  } catch { return json(502, { error: "supabase", detalle: "No se pudo verificar tu sesión. Intenta de nuevo." }); }

  // 2) Límite suave por hora
  const hora = Math.floor(Date.now() / 3600000), clave = `${usuario.id}:${hora}`, n = (usos.get(clave) || 0) + 1;
  for (const k of usos.keys()) if (!k.endsWith(":" + hora)) usos.delete(k);
  if (n > POR_HORA) return json(429, { error: "limite", detalle: `Llegaste al límite de ${POR_HORA} lecturas por hora. Intenta más tarde.` });
  usos.set(clave, n);

  // 3) Datos recibidos
  let c; try { c = await req.json(); } catch { return json(400, { error: "datos", detalle: "La solicitud no es válida." }); }
  const tipo = TIPOS[c?.tipo]; if (!tipo) return json(400, { error: "tipo", detalle: "Tipo de foto no válido." });
  if (!["image/jpeg", "image/png", "image/webp"].includes(c.mime)) return json(400, { error: "formato", detalle: "La foto debe ser JPG, PNG o WEBP." });
  if (typeof c.imagen !== "string" || c.imagen.length < 100) return json(400, { error: "imagen", detalle: "No llegó la foto." });
  if (c.imagen.length > 5_500_000) return json(413, { error: "tamano", detalle: "La foto es demasiado grande." });

  // 4) Lectura con Claude
  let res;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: modelo, max_tokens: tipo.max, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: c.mime, data: c.imagen } }, { type: "text", text: tipo.prompt }] }] }),
    });
  } catch { return json(502, { error: "ia", detalle: "No se pudo conectar con el servicio de IA." }); }
  if (!res.ok) { console.error("Anthropic respondió", res.status, (await res.text()).slice(0, 300)); return json(502, { error: "ia", detalle: mensajeIA(res.status) }); }
  const data = await res.json(), texto = (data.content || []).filter(x => x.type === "text").map(x => x.text).join("\n"), datos = extraerJSON(texto);
  if (!datos || typeof datos !== "object") return json(502, { error: "formato", detalle: "La IA respondió en un formato que no se pudo leer. Intenta con otra foto." });
  return json(200, { ok: true, tipo: c.tipo, datos });
};
