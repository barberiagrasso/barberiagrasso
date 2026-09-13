import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverSegmento, filtrarConConsentimientoComercial } from "@/lib/segmentacion";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { resolverVariablesPlantilla } from "@/lib/plantillaVariables";

// Un cliente sin ninguna visita completada en este margen de días se
// considera "inactivo" de cara a la campaña de reactivación.
const DIAS_INACTIVIDAD = 60;
// No se le vuelve a mandar el mismo aviso de "te echamos de menos" antes
// de que pase este margen, aunque siga sin volver — para no insistir cada
// día que se ejecute el cron.
const DIAS_ENFRIAMIENTO_INACTIVO = 90;
// Igual, pero para el mensaje de cumpleaños: como mucho una vez al año.
// 300 en vez de 365 deja margen por si el cron falla o se retrasa algún
// día sin arriesgarse a saltarse un año entero.
const DIAS_ENFRIAMIENTO_CUMPLE = 300;

type Cliente = { id: string; nombre: string; telefono: string };

// Referencia estable del "día de hoy" en la zona horaria del negocio, para
// poder restar días de calendario sin líos de huso horario cerca de
// medianoche (misma idea que lib/booking.ts:fechaMadrid, pero al revés:
// aquí partimos de "hoy", no de un instante ya guardado).
function hoyMadrid(): Date {
  const iso = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" });
  return new Date(`${iso}T00:00:00Z`);
}

function restarDiasISO(fecha: Date, dias: number): string {
  const copia = new Date(fecha);
  copia.setUTCDate(copia.getUTCDate() - dias);
  return copia.toISOString().slice(0, 10);
}

async function obtenerPlantillaActiva(supabase: ReturnType<typeof createAdminClient>, tipo: string) {
  const { data } = await supabase
    .from("plantillas_whatsapp")
    .select("*")
    .eq("tipo", tipo)
    .eq("activa", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data;
}

// Quiénes de esta lista ya recibieron este aviso desde `desdeISO` — para
// no insistirle a la misma persona en cada ejecución del cron.
async function idsYaAvisados(
  supabase: ReturnType<typeof createAdminClient>,
  ids: string[],
  tipo: "inactivo" | "cumpleanos",
  desdeISO: string
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data } = await supabase
    .from("retencion_envios")
    .select("cliente_id")
    .eq("tipo", tipo)
    .gte("enviado_at", desdeISO)
    .in("cliente_id", ids);
  return new Set((data ?? []).map((f) => f.cliente_id));
}

interface ResultadoRetencion {
  inactivosAvisados: number;
  cumpleanosAvisados: number;
  errores: string[];
}

/**
 * Punto de entrada único, llamado una vez al día desde
 * app/api/cron/retencion. Manda dos campañas automáticas por WhatsApp,
 * cada una con su propia plantilla aprobada (registrada en
 * /admin/plantillas con tipo "retencion_inactivo" / "retencion_cumple"):
 *
 * 1. Reactivación: clientes sin visitas completadas en DIAS_INACTIVIDAD
 *    días, reutilizando el mismo cálculo de segmento que ya usan las
 *    campañas manuales del panel (lib/segmentacion.ts).
 * 2. Cumpleaños: clientes cuyo cumpleaños (que ellos mismos rellenan en
 *    "Mi perfil") cae hoy en la zona horaria del negocio.
 *
 * Ambas respetan siempre el consentimiento comercial y nunca repiten un
 * aviso dentro de su margen de enfriamiento. Nunca lanza: cada envío
 * individual que falla se anota en `errores` y se sigue con el resto.
 */
export async function ejecutarRetencionDiaria(): Promise<ResultadoRetencion> {
  const supabase = createAdminClient();
  const resultado: ResultadoRetencion = { inactivosAvisados: 0, cumpleanosAvisados: 0, errores: [] };
  const hoy = hoyMadrid();

  // --- 1. Clientes inactivos ---
  const plantillaInactivo = await obtenerPlantillaActiva(supabase, "retencion_inactivo");
  if (!plantillaInactivo) {
    resultado.errores.push("No hay ninguna plantilla activa de tipo 'retencion_inactivo' en /admin/plantillas.");
  } else {
    const candidatos = await resolverSegmento({ sinVisitasDesde: restarDiasISO(hoy, DIAS_INACTIVIDAD) });
    const yaAvisados = await idsYaAvisados(
      supabase,
      candidatos.map((c) => c.id),
      "inactivo",
      restarDiasISO(hoy, DIAS_ENFRIAMIENTO_INACTIVO)
    );
    for (const cliente of candidatos) {
      if (yaAvisados.has(cliente.id)) continue;
      await avisar(supabase, cliente, plantillaInactivo, "inactivo", resultado, "inactivosAvisados");
    }
  }

  // --- 2. Cumpleaños ---
  const plantillaCumple = await obtenerPlantillaActiva(supabase, "retencion_cumple");
  if (!plantillaCumple) {
    resultado.errores.push("No hay ninguna plantilla activa de tipo 'retencion_cumple' en /admin/plantillas.");
  } else {
    const hoyISO = hoy.toISOString().slice(0, 10);
    const [, mesHoy, diaHoy] = hoyISO.split("-");

    const { data: conFecha } = await supabase
      .from("clientes")
      .select("id, nombre, telefono, fecha_nacimiento")
      .not("fecha_nacimiento", "is", null);

    const cumpleanerosHoy: Cliente[] = (conFecha ?? [])
      .filter((c) => {
        const [, mes, dia] = (c.fecha_nacimiento as string).split("-");
        return mes === mesHoy && dia === diaHoy;
      })
      .map((c) => ({ id: c.id, nombre: c.nombre, telefono: c.telefono }));

    const conConsentimiento = await filtrarConConsentimientoComercial(supabase, cumpleanerosHoy);
    const yaAvisados = await idsYaAvisados(
      supabase,
      conConsentimiento.map((c) => c.id),
      "cumpleanos",
      restarDiasISO(hoy, DIAS_ENFRIAMIENTO_CUMPLE)
    );
    for (const cliente of conConsentimiento) {
      if (yaAvisados.has(cliente.id)) continue;
      await avisar(supabase, cliente, plantillaCumple, "cumpleanos", resultado, "cumpleanosAvisados");
    }
  }

  return resultado;
}

async function avisar(
  supabase: ReturnType<typeof createAdminClient>,
  cliente: Cliente,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plantilla: any,
  tipo: "inactivo" | "cumpleanos",
  resultado: ResultadoRetencion,
  contador: "inactivosAvisados" | "cumpleanosAvisados"
) {
  try {
    const variables = resolverVariablesPlantilla(plantilla.variables ?? [], { nombre: cliente.nombre });
    await sendWhatsAppTemplate(cliente.telefono, plantilla.nombre_meta, plantilla.idioma, variables);
    await supabase.from("retencion_envios").insert({ cliente_id: cliente.id, tipo });
    resultado[contador]++;
  } catch (err) {
    resultado.errores.push(
      `${tipo === "inactivo" ? "Reactivación" : "Cumpleaños"} a ${cliente.nombre}: ${err instanceof Error ? err.message : "error desconocido"}`
    );
  }
}
