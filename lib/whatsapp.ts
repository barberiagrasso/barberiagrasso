import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Nota: v21.0 es una versión reciente de la Graph API en el momento de
// escribir esto. Meta va sacando versiones nuevas cada pocos meses; si
// en el futuro te avisan de que esta versión queda obsoleta, solo hay
// que cambiar este número (Meta for Developers → Changelog).
const GRAPH_API_VERSION = "v21.0";

/**
 * Envía un mensaje de texto de WhatsApp al número indicado, usando el
 * número de negocio configurado en las variables de entorno.
 * Solo funciona dentro de la ventana de 24h desde el último mensaje del
 * cliente, o usando una plantilla aprobada fuera de esa ventana (no
 * implementado aquí: para campañas salientes fuera de la ventana de 24h
 * hace falta usar plantillas, ver sección 8/10 del documento de
 * especificación).
 */
export async function sendWhatsAppMessage(to: string, body: string) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneNumberId || !token) {
    console.warn("WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_TOKEN no configurados; no se envía el mensaje.");
    return;
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    }
  );

  if (!res.ok) {
    const detalle = await res.text();
    console.error("Error enviando mensaje de WhatsApp", res.status, detalle);
    throw new Error(`WhatsApp respondió ${res.status}: ${detalle}`);
  }
}

/**
 * Envía un mensaje usando una plantilla ya aprobada por Meta. Es
 * obligatorio para cualquier mensaje que el negocio inicia sin que el
 * cliente haya escrito antes en las últimas 24h (recordatorios,
 * campañas comerciales): WhatsApp rechaza el texto libre en ese caso.
 * `nombreMeta` es el nombre exacto de la plantilla tal y como se creó y
 * aprobó en Meta Business Manager (Diego lo registra en /admin/plantillas
 * una vez se la aprueban). `variables` son los valores, en orden, de los
 * huecos {{1}}, {{2}}... que tenga la plantilla.
 */
export async function sendWhatsAppTemplate(
  to: string,
  nombreMeta: string,
  idioma: string,
  variables: string[]
) {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneNumberId || !token) {
    throw new Error("WHATSAPP_PHONE_NUMBER_ID o WHATSAPP_TOKEN no configurados.");
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: nombreMeta,
          language: { code: idioma },
          components:
            variables.length > 0
              ? [
                  {
                    type: "body",
                    parameters: variables.map((texto) => ({ type: "text", text: texto })),
                  },
                ]
              : undefined,
        },
      }),
    }
  );

  if (!res.ok) {
    const detalle = await res.text();
    console.error("Error enviando plantilla de WhatsApp", res.status, detalle);
    throw new Error(`WhatsApp respondió ${res.status}: ${detalle}`);
  }
}


/**
 * Comprueba que una petición entrante al webhook de WhatsApp viene de
 * verdad de Meta: recalcula el HMAC-SHA256 del cuerpo CRUDO (antes de
 * parsear el JSON) con el "App Secret" de la app de Meta y lo compara,
 * en tiempo constante, con la cabecera `X-Hub-Signature-256` que Meta
 * manda en cada mensaje (formato `sha256=<hex>`).
 *
 * Devuelve `false` de inmediato, sin calcular nada, si falta cualquiera
 * de las tres cosas (cuerpo, cabecera o secreto) o si la cabecera no
 * tiene el prefijo esperado — un secreto vacío nunca se considera
 * "válido" aunque matemáticamente cuadre con una firma calculada con clave
 * vacía.
 */
export function firmaWebhookValida(
  cuerpoCrudo: string,
  firmaRecibida: string | null,
  appSecret: string
): boolean {
  if (!appSecret || !firmaRecibida) {
    return false;
  }
  const PREFIJO = "sha256=";
  if (!firmaRecibida.startsWith(PREFIJO)) {
    return false;
  }
  const firmaEsperada = createHmac("sha256", appSecret).update(cuerpoCrudo).digest("hex");
  const bufferRecibido = Buffer.from(firmaRecibida.slice(PREFIJO.length), "hex");
  const bufferEsperado = Buffer.from(firmaEsperada, "hex");
  if (bufferRecibido.length !== bufferEsperado.length) {
    return false;
  }
  return timingSafeEqual(bufferRecibido, bufferEsperado);
}
