# Vortex y el banco · Guía para automatizar los pagos

## Qué hace Vortex (ya está listo)
1. **Llega un pago** del banco (por aviso automático, por el extracto que subes, o a mano).
2. **Vortex reconoce a quién corresponde** y registra el pago solo, aplicándolo al mes más antiguo que se debe.
3. **Te arma dos listas siempre al día** (Clientes → **Banco y listas** → **Lista del día**):
   - ✅ **Por habilitar:** ya pagaron y están cortados. Los habilitas en el equipo y tocas "Habilitado ✓".
   - ⛔ **Por cortar:** siguen sin pagar. Los cortas en el equipo y tocas "Cortado ✓".
   - 💵 **Pagaron hoy**, con la marca "Banco (automático)" o "Registrado a mano".
4. El botón **🔄 Actualizar lista ahora** reconoce los pagos nuevos y refresca las listas. Además se actualiza sola cada minuto mientras la pantalla está abierta. Cada lista se puede **copiar, descargar en CSV o imprimir**.

> Vortex **no habilita ni corta el servicio por sí mismo** en el OLT o en el router: te da la lista y tú confirmas. Eso es a propósito: un corte siempre pasa por una persona.

## Cómo reconoce a quien pagó
Registra el pago **solo cuando hay certeza**:
- el **código del cliente** (C-0001) o su **carnet** aparece en la glosa/concepto del pago, o
- el nombre del que paga es uno **con el que ya pagó antes** y tú confirmaste.

Si el nombre solo *se parece*, si hay dudas, o si el monto es muy alto para ese cliente, el movimiento queda **"por revisar"** (Movimientos del banco) con botones para confirmar con un toque. Lo que confirmas se **aprende**: la próxima vez ya lo reconoce. Un pago registrado por error se **anula** y el movimiento vuelve a "por revisar".

👉 **Lo más importante:** pídele a cada cliente que escriba su **código (C-0001)** en la glosa al pagar. Con eso casi todo se registra solo.

## Camino A · Funciona HOY, con cualquier banco: importar el extracto
1. Entra a la banca por internet de tu banco (la de empresas o la de tu cuenta) y descarga los **movimientos del día** en **CSV** o Excel.
2. En Vortex: **Clientes → Banco y listas → Importar extracto**.
3. Sube el CSV, o abre el Excel, **copia las filas y pégalas** en el cuadro. (Si es Excel: "Guardar como CSV" también sirve.)
4. Revisa que las columnas estén bien (Vortex las adivina por los títulos): fecha, monto/crédito, número de operación, quién pagó, glosa.
5. Toca **Importar**. Solo entran los **abonos**; retiros y comisiones se omiten. **Si cargas el mismo extracto dos veces no se duplica nada.**
6. Mira la **Lista del día**.

Rutina sugerida: importar 2 o 3 veces al día (por ejemplo 10:00, 15:00 y antes del corte de las 18:00).

## Camino B · Totalmente automático: el banco avisa a Vortex (webhook)
Es lo ideal ("cualquier rato pagan y la lista se actualiza sola"). Requiere que **el banco o una pasarela de pagos** te habilite **notificaciones de pago** hacia una dirección web. Vortex ya tiene esa dirección lista:

`https://TU-SITIO.netlify.app/.netlify/functions/banco-webhook`

### Qué pedirle al banco o a la pasarela
Pregunta, tal cual:
1. *"¿Tienen **notificación automática de pagos** (callback/webhook) para cobros por **QR**? ¿Puedo cobrar con un **QR por cada cliente** o con un **código de referencia** que yo defina?"*
2. *"¿La notificación trae **monto, fecha, número de operación, nombre de quien paga y la glosa o referencia**?"*
3. *"¿Pueden enviarla a mi dirección web con una **clave secreta** en un encabezado (o en la dirección)?"*
4. *"¿Tienen un **ambiente de pruebas**? ¿Cuánto cuesta y cuánto tarda la habilitación?"*

Opciones a consultar (verifica condiciones y costos con cada una):
- Tu **banco** (por ejemplo, el área de banca empresas / cobros por QR).
- Una **pasarela de pagos** de Bolivia que ofrezca QR Simple y avisos de pago.
- **OpenBCB**, la plataforma del Banco Central de Bolivia: según su comunicado de octubre de 2025, ofrece generación gratuita de QR, consulta del estado del QR y **notificación de pagos**, orientada a instituciones que no han podido automatizar su cobranza. Consulta directamente con el BCB cómo puede acceder una empresa como la tuya.

### Cómo se conecta (cuando ya tengas la habilitación)
1. En Netlify: **Site configuration → Environment variables**, agrega:

| Nombre | Qué pones |
|---|---|
| `BANCO_WEBHOOK_SECRET` | Una clave larga que tú inventas (mínimo 24 letras y números). Se la das al banco. |
| `SUPABASE_URL` | El Project URL de Supabase (el mismo de la guía de fotos). |
| `SUPABASE_SERVICE_ROLE_KEY` | La clave **service_role** (Supabase → Project settings → API → *service_role*). **Es secreta: solo va en Netlify, nunca en el código ni en WhatsApp.** |
| `BANCO_NOMBRE` | (opcional) Por ejemplo "Banco Unión". |
| `BANCO_PROYECTO_ID` | (opcional) El id del proyecto, si tienes varios. |

2. Vuelve a publicar (Deploys → Trigger deploy).
3. Entrega al banco la dirección y la clave: la clave puede ir en el encabezado `x-webhook-secret`, en `Authorization: Bearer …`, o al final de la dirección como `?token=TU_CLAVE`.
4. Haz una **prueba** (con un cliente de prueba, porque registra un pago de verdad). Desde cualquier computadora con `curl`:

```
curl -X POST "https://TU-SITIO.netlify.app/.netlify/functions/banco-webhook" -H "x-webhook-secret: TU_CLAVE" -H "content-type: application/json" -d '{"referencia":"PRUEBA-001","monto":140,"remitente":"MARIA QUISPE","glosa":"internet C-0001","fecha":"2026-11-03T10:00:00Z"}'
```
Debe responder `"ok":true`. En **Banco y listas → Conexión automática** aparecerá "✅ La conexión funciona".

Vortex entiende los nombres de campos más comunes (monto/amount/importe, referencia/id/nro_operacion, glosa/descripcion/concepto, remitente/nombre/ordenante, fecha/date…), acepta uno o varios movimientos por aviso, ignora los pagos fallidos y **no duplica** si el banco repite un aviso. Si el formato de tu banco es muy particular, mándame un ejemplo y lo adapto.

## Lo que NO conviene
- Leer SMS o correos del banco para sacar los pagos: es frágil y se rompe cuando el banco cambia el texto.
- Compartir la clave `service_role` o la del webhook. Si alguna se filtra, cámbiala en Netlify/Supabase.

## Preguntas frecuentes
**¿Y si alguien paga por transferencia sin poner su código?** Queda "por revisar": lo eliges con un toque y Vortex aprende ese nombre.
**¿Y si paga un familiar con otro nombre?** Igual: lo confirmas una vez y queda aprendido.
**¿Se habilita solo el internet?** No. La lista te dice a quién habilitar; automatizar el OLT/router es otro proyecto aparte.
**¿Qué pasa con un cliente que paga y ya estaba al día?** El pago se aplica como adelanto a los meses siguientes.
