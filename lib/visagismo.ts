import "server-only";
import Anthropic from "@anthropic-ai/sdk";

// Asesor de estilo con IA (visagismo), pedido de David 15/11/2026: el
// cliente sube un selfie y Claude le dice qué corte y qué barba le
// favorecen según la forma de su cara. La foto NO se guarda: se manda a
// la IA solo para este análisis y se descarta.

const MODEL = "claude-sonnet-5";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Catálogo de estilos y servicios de Barbería Grasso (cartel "¿Qué estilo
// llevas hoy?", 15/11/2026). La IA recomienda SOLO de aquí, con estos
// mismos nombres, para que el cliente pida algo que el barbero reconoce.
export const CATALOGO_CORTES = [
  "Clásico",
  "Degradado alto",
  "Degradado medio",
  "Degradado bajo",
  "Raya a navaja",
  "Falso mohicano",
  "Rapado",
  "Undercut",
  "Flequillo corto",
  "Old money",
  "Old money con degradado suave",
  "Tupé a tijera",
  "Mohicano",
  "Mullet",
  "Rizado (definido arriba)",
  "Rizado con degradado",
  "Degradado y arriba al 2",
  "Afro clásico",
  "Afro con esponja",
];
export const CATALOGO_BARBAS = ["Barba italiana", "Barba corta", "Barba clásica", "Barba degradada", "Barba larga", "Afeitado"];
export const CATALOGO_DETALLES = ["Diseño o raya con navaja (detalles a medida)"];
export const CATALOGO_EXTRAS = [
  "Depilación de nariz y orejas con cera",
  "Limpieza facial",
  "Hidratación capilar",
  "Alisado (brasileño o botox)",
  "Rubio platino",
  "Perfilado de cejas",
  "Mechas",
  "Camuflaje de canas",
];

// Precio orientativo que se enseña al cliente junto al extra sugerido
// (los que David ha dado; el resto se consulta en la barbería).
export const PRECIO_EXTRAS: Record<string, string> = {
  "Alisado (brasileño o botox)": "de 19 € a 30 €",
  Mechas: "44,99 €",
  "Rubio platino": "69,90 €",
};

export const FORMAS_CARA = ["ovalada", "redonda", "cuadrada", "rectangular", "alargada", "triangular", "diamante", "corazon"] as const;

export interface RecomendacionEstilo {
  hayCara: boolean;
  motivoSinCara?: string;
  formaCara: (typeof FORMAS_CARA)[number];
  explicacionForma: string;
  tipoPelo: string;
  cortes: { nombre: string; porQue: string }[];
  evitar: string[];
  barba: { recomendacion: string; porQue: string } | null;
  extras: { nombre: string; porQue: string; precio: string | null }[];
  consejo: string;
  servicioIds: string[];
}

export interface PreferenciasEstilo {
  estilo?: "clasico" | "moderno" | "comodo" | "atrevido" | null;
  barba?: "si" | "no" | "quiero_probar" | null;
}

const HERRAMIENTA = {
  name: "recomendar_estilo",
  description: "Devuelve el análisis de visagismo y las recomendaciones para el cliente.",
  input_schema: {
    type: "object" as const,
    properties: {
      hay_cara: { type: "boolean", description: "true solo si en la foto se ve bien de frente la cara de UNA persona." },
      motivo_sin_cara: { type: "string", description: "Si hay_cara es false: qué falla en la foto, en una frase amable (p. ej. 'Se ve de perfil')." },
      forma_cara: { type: "string", enum: [...FORMAS_CARA] },
      explicacion_forma: { type: "string", description: "1-2 frases: por qué esa forma (frente, pómulos, mandíbula, largo)." },
      tipo_pelo: { type: "string", description: "Tipo y estado del pelo que se ve: liso/ondulado/rizado, grosor, densidad, entradas si las hay (dicho con tacto)." },
      cortes: {
        type: "array",
        minItems: 2,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            nombre: { type: "string", enum: CATALOGO_CORTES, description: "Uno de los cortes del catálogo de Grasso." },
            por_que: { type: "string", description: "Por qué le favorece, en una frase." },
          },
          required: ["nombre", "por_que"],
        },
      },
      evitar: { type: "array", maxItems: 3, items: { type: "string" }, description: "Estilos que no le favorecen, breves." },
      barba: {
        type: "object",
        properties: {
          recomendacion: { type: "string", enum: CATALOGO_BARBAS },
          por_que: { type: "string" },
        },
        required: ["recomendacion", "por_que"],
      },
      extras: {
        type: "array",
        maxItems: 2,
        description: "1-2 servicios extra del catálogo que de verdad le vendrían bien por lo que se ve (canas → camuflaje; pelo seco → hidratación; pelo encrespado o con mucho volumen que quiera domar → alisado; cejas pobladas → perfilado; piel → limpieza facial). Vacío si nada encaja.",
        items: {
          type: "object",
          properties: {
            nombre: { type: "string", enum: [...CATALOGO_EXTRAS, ...CATALOGO_DETALLES] },
            por_que: { type: "string", description: "Por qué, en una frase amable y sin juzgar." },
          },
          required: ["nombre", "por_que"],
        },
      },
      consejo: { type: "string", description: "Un consejo práctico de mantenimiento o peinado, en una frase." },
      servicio_ids: {
        type: "array",
        items: { type: "string" },
        description: "IDs de la lista de servicios de la barbería que encajan con lo recomendado: el corte (o corte y barba) y, si existen en la lista, los extras sugeridos. Máximo 3. Solo IDs de la lista.",
      },
    },
    required: ["hay_cara", "forma_cara", "explicacion_forma", "tipo_pelo", "cortes", "evitar", "barba", "extras", "consejo", "servicio_ids"],
  },
};

const ESTILOS: Record<string, string> = {
  clasico: "clásico y elegante",
  moderno: "moderno y a la moda",
  comodo: "cómodo y fácil de llevar",
  atrevido: "atrevido, que llame la atención",
};
const BARBAS: Record<string, string> = {
  si: "lleva o quiere llevar barba",
  no: "no quiere barba (prefiere ir afeitado)",
  quiero_probar: "quiere probar a dejarse barba",
};

export async function recomendarEstilo(
  imagenBase64: string,
  preferencias: PreferenciasEstilo,
  servicios: { id: string; nombre: string }[],
): Promise<RecomendacionEstilo> {
  const system = [
    "Eres el asesor de estilo de Barbería Grasso (Getafe), experto en visagismo masculino.",
    "Analizas SOLO la forma de la cara, el pelo y la barba que se ven en la foto para recomendar corte y barba.",
    "Nunca comentes ni deduzcas edad, origen, etnia, salud, peso, atractivo ni ningún otro rasgo personal. No identifiques a nadie.",
    "Escribe en español de España, cercano y positivo, como un barbero de confianza. Frases cortas.",
    "Recomienda cortes y barba SOLO del catálogo de Barbería Grasso (los nombres de la herramienta). Elige según la forma de cara, el tipo de pelo (rizado/afro → estilos rizados o afro) y lo que pide el cliente.",
    "Sugiere extras solo si se ven motivos en la foto; nunca más de 2.",
    "Si la foto no muestra bien de frente la cara de una sola persona, marca hay_cara=false y explica qué falla; rellena el resto con valores genéricos.",
    `Servicios de la barbería (usa sus IDs en servicio_ids): ${servicios.map((s) => `${s.id}=${s.nombre}`).join("; ")}`,
  ].join("\n");

  const pref: string[] = [];
  if (preferencias.estilo && ESTILOS[preferencias.estilo]) pref.push(`Busca un estilo ${ESTILOS[preferencias.estilo]}.`);
  if (preferencias.barba && BARBAS[preferencias.barba]) pref.push(`Sobre la barba: ${BARBAS[preferencias.barba]}.`);

  const respuesta = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system,
    tools: [HERRAMIENTA],
    tool_choice: { type: "tool", name: HERRAMIENTA.name },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imagenBase64 } },
          { type: "text", text: ["Analiza mi cara y dime qué corte y barba me favorecen.", ...pref].join(" ") },
        ],
      },
    ],
  });

  const bloque = respuesta.content.find((b) => b.type === "tool_use");
  if (!bloque || bloque.type !== "tool_use") throw new Error("La IA no devolvió recomendaciones.");
  const r = bloque.input as Record<string, unknown>;
  const idsValidos = new Set(servicios.map((s) => s.id));
  const forma = FORMAS_CARA.includes(r.forma_cara as (typeof FORMAS_CARA)[number]) ? (r.forma_cara as (typeof FORMAS_CARA)[number]) : "ovalada";
  const barba = r.barba as { recomendacion?: string; por_que?: string } | undefined;

  return {
    hayCara: r.hay_cara === true,
    motivoSinCara: typeof r.motivo_sin_cara === "string" ? r.motivo_sin_cara : undefined,
    formaCara: forma,
    explicacionForma: String(r.explicacion_forma ?? ""),
    tipoPelo: String(r.tipo_pelo ?? ""),
    cortes: (Array.isArray(r.cortes) ? r.cortes : [])
      .slice(0, 3)
      .map((c: { nombre?: string; por_que?: string }) => ({ nombre: String(c.nombre ?? ""), porQue: String(c.por_que ?? "") }))
      .filter((c) => c.nombre),
    evitar: (Array.isArray(r.evitar) ? r.evitar : []).slice(0, 3).map(String),
    barba: barba?.recomendacion ? { recomendacion: String(barba.recomendacion), porQue: String(barba.por_que ?? "") } : null,
    extras: (Array.isArray(r.extras) ? r.extras : [])
      .slice(0, 2)
      .map((e: { nombre?: string; por_que?: string }) => ({
        nombre: String(e.nombre ?? ""),
        porQue: String(e.por_que ?? ""),
        precio: PRECIO_EXTRAS[String(e.nombre ?? "")] ?? null,
      }))
      .filter((e) => e.nombre),
    consejo: String(r.consejo ?? ""),
    servicioIds: (Array.isArray(r.servicio_ids) ? r.servicio_ids : []).map(String).filter((id) => idsValidos.has(id)).slice(0, 3),
  };
}
