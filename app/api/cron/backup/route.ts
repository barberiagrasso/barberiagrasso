import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { registrarError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Todas las tablas con datos del negocio (no se incluye
// `intentos_seguridad`: es un rastro técnico y temporal del limitador de
// intentos, sin ningún valor que conservar).
const TABLAS = [
  "sedes",
  "servicios",
  "sede_servicios",
  "profesionales",
  "profesional_sedes",
  "profesional_servicios",
  "horarios",
  "bloqueos",
  "clientes",
  "consentimientos",
  "citas",
  "cita_extras",
  "conversaciones",
  "mensajes",
  "campanas",
  "campana_destinatarios",
  "plantillas_whatsapp",
  "admins",
  "lista_espera",
  "retencion_envios",
  "fallos_asistente",
  "errores_sistema",
] as const;

const TAMANO_PAGINA = 1000;

/**
 * Copia de seguridad diaria en JSON de todas las tablas de negocio.
 * Pensada para llamarse una vez al día desde GitHub Actions (ver
 * .github/workflows/backup.yml), que sube la respuesta como artifact —
 * así no hace falta ninguna cuenta ni servicio de almacenamiento nuevo:
 * reutiliza los mismos secretos (CRON_SECRET, APP_URL) que ya usan
 * recordatorios y retención.
 *
 * No es un pg_dump (no incluye el esquema/las políticas de RLS: eso ya
 * está versionado en supabase/*.sql dentro del propio proyecto), es una
 * copia de los DATOS, tabla por tabla, para poder recuperarlos si algo
 * se borra o se corrompe por accidente.
 */
export async function POST(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  const recibido = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secreto || recibido !== secreto) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const tablas: Record<string, unknown[]> = {};

  try {
    for (const tabla of TABLAS) {
      tablas[tabla] = await descargarTablaCompleta(supabase, tabla);
    }
  } catch (err) {
    console.error("Error generando la copia de seguridad", err);
    await registrarError({ origen: "cron_backup", mensaje: "Fallo generando la copia de seguridad diaria", detalle: err });
    return NextResponse.json({ error: "No se pudo generar la copia de seguridad." }, { status: 500 });
  }

  return NextResponse.json({
    generadoEn: new Date().toISOString(),
    tablas,
  });
}

/** Trae TODAS las filas de una tabla, paginando de 1000 en 1000 (el
 * límite por defecto de una consulta a Supabase), para que una tabla que
 * crezca con el tiempo (por ejemplo `mensajes`) nunca se quede corta en
 * la copia de seguridad. */
async function descargarTablaCompleta(
  supabase: ReturnType<typeof createAdminClient>,
  tabla: string
): Promise<unknown[]> {
  const filas: unknown[] = [];
  let desde = 0;

  while (true) {
    const { data, error } = await supabase
      .from(tabla)
      .select("*")
      .range(desde, desde + TAMANO_PAGINA - 1);

    if (error) throw new Error(`Fallo leyendo la tabla "${tabla}": ${error.message}`);
    if (!data || data.length === 0) break;

    filas.push(...data);
    if (data.length < TAMANO_PAGINA) break;
    desde += TAMANO_PAGINA;
  }

  return filas;
}
