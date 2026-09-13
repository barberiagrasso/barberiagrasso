import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { resolverVariablesPlantilla } from "@/lib/plantillaVariables";
import { registrarError } from "@/lib/errorLog";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TZ = process.env.BUSINESS_TIMEZONE || "Europe/Madrid";

/**
 * Manda el recordatorio automático de las citas que empiezan dentro de
 * las próximas RECORDATORIO_HORAS_ANTES horas (3 por defecto) y que
 * todavía no lo tienen mandado. Pensado para llamarse una vez por hora
 * desde un disparador externo (ver .github/workflows/recordatorios.yml):
 * en Vercel Hobby los cron jobs propios solo pueden correr una vez al
 * día, así que este endpoint lo llama GitHub Actions en su lugar.
 *
 * Protegido con un secreto compartido (CRON_SECRET) en vez de sesión de
 * administrador, porque quien llama no es una persona con el navegador
 * abierto sino el propio disparador programado.
 */
export async function POST(request: NextRequest) {
  const secreto = process.env.CRON_SECRET;
  const recibido = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secreto || recibido !== secreto) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return NextResponse.json({ ok: true, motivo: "WhatsApp Business todavía no está conectado.", enviados: 0 });
  }

  const supabase = createAdminClient();
  const { data: plantilla } = await supabase
    .from("plantillas_whatsapp")
    .select("*")
    .eq("tipo", "recordatorio")
    .eq("activa", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();

  if (!plantilla) {
    return NextResponse.json({ ok: true, motivo: "No hay ninguna plantilla de recordatorio activa registrada en /admin/plantillas.", enviados: 0 });
  }

  const horasAntes = parseInt(process.env.RECORDATORIO_HORAS_ANTES || "3", 10);
  const ahora = new Date();
  const limite = new Date(ahora.getTime() + horasAntes * 3600000);

  const { data: citas } = await supabase
    .from("citas")
    .select("id, inicio, cliente:clientes(nombre, telefono), servicio:servicios(nombre), sede:sedes(nombre)")
    .eq("estado", "confirmada")
    .is("recordatorio_enviado_at", null)
    .gt("inicio", ahora.toISOString())
    .lte("inicio", limite.toISOString());

  let enviados = 0;
  let fallidos = 0;
  const citasFallidas: { id: string; error: string }[] = [];

  for (const cita of citas ?? []) {
    const cliente = Array.isArray(cita.cliente) ? cita.cliente[0] : cita.cliente;
    const servicio = Array.isArray(cita.servicio) ? cita.servicio[0] : cita.servicio;
    const sede = Array.isArray(cita.sede) ? cita.sede[0] : cita.sede;
    if (!cliente) continue;

    const hora = new Date(cita.inicio).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
    const fecha = new Date(cita.inicio).toLocaleDateString("es-ES", { timeZone: TZ, day: "2-digit", month: "2-digit" });

    try {
      const variables = resolverVariablesPlantilla(plantilla.variables ?? [], {
        nombre: cliente.nombre,
        servicio: servicio?.nombre ?? "",
        sede: sede?.nombre ?? "",
        hora,
        fecha,
      });
      await sendWhatsAppTemplate(cliente.telefono, plantilla.nombre_meta, plantilla.idioma, variables);
      await supabase.from("citas").update({ recordatorio_enviado_at: new Date().toISOString() }).eq("id", cita.id);
      enviados++;
    } catch (err) {
      console.error("Error mandando recordatorio de cita", cita.id, err);
      fallidos++;
      citasFallidas.push({ id: cita.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Un único registro agregado (no uno por cada recordatorio fallido):
  // si WhatsApp está caído un rato, esto evita llenar /admin/errores con
  // decenas de filas idénticas en la misma pasada horaria.
  if (fallidos > 0) {
    await registrarError({
      origen: "cron_recordatorios",
      mensaje: `${fallidos} de ${citas?.length ?? 0} recordatorios no se pudieron mandar`,
      detalle: citasFallidas,
    });
  }

  return NextResponse.json({ ok: true, procesadas: citas?.length ?? 0, enviados, fallidos });
}
