import { NextRequest, NextResponse } from "next/server";
import { apuntarseListaEspera, ReservaError } from "@/lib/booking";
import { normalizarTelefono } from "@/lib/clientes";
import { comprobarLimite, ipDePeticion, RESPUESTA_DEMASIADOS_INTENTOS } from "@/lib/rateLimit";
import { esFlexibilidadValida } from "@/lib/listaEspera";

export const dynamic = "force-dynamic";

// Alta pública en la lista de espera: se usa desde el paso de fecha del
// flujo de reserva (app/reservar) cuando un día concreto no tiene huecos.
// Mismo patrón de límite de intentos que /api/citas, para que no se pueda
// usar para spam.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);

  if (!body?.sedeId || !body?.servicioId || !body?.fecha || !body?.cliente?.nombre || !body?.cliente?.telefono) {
    return NextResponse.json({ error: "Faltan datos obligatorios." }, { status: 400 });
  }
  // 0 si no se manda (compatibilidad hacia atrás: "solo ese día exacto").
  const flexibilidadDias = body.flexibilidadDias ?? 0;
  if (!esFlexibilidadValida(flexibilidadDias)) {
    return NextResponse.json({ error: "La flexibilidad de fecha no es válida." }, { status: 400 });
  }

  const telefono = normalizarTelefono(body.cliente.telefono);
  const [porTelefono, porIp] = await Promise.all([
    comprobarLimite(`lista-espera:tel:${telefono}`, { maxIntentos: 8, ventanaMinutos: 60 }),
    comprobarLimite(`lista-espera:ip:${ipDePeticion(request)}`, { maxIntentos: 20, ventanaMinutos: 60 }),
  ]);
  if (!porTelefono.permitido || !porIp.permitido) {
    return NextResponse.json(RESPUESTA_DEMASIADOS_INTENTOS, { status: 429 });
  }

  try {
    const { entrada } = await apuntarseListaEspera({
      sedeId: body.sedeId,
      servicioId: body.servicioId,
      profesionalId: body.profesionalId || null,
      fecha: body.fecha,
      flexibilidadDias,
      cliente: body.cliente,
      aceptaComercial: Boolean(body.aceptaComercial),
      canal: "app",
    });
    return NextResponse.json({ entrada });
  } catch (err) {
    if (err instanceof ReservaError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("Error al apuntar a la lista de espera", err);
    return NextResponse.json({ error: "No se pudo apuntar a la lista de espera." }, { status: 500 });
  }
}
