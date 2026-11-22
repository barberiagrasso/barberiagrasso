import { NextRequest, NextResponse } from "next/server";
import { crearReserva, ReservaError } from "@/lib/booking";
import { getAvailableSlots } from "@/lib/availability";
import { comprobarLimite, ipDePeticion, RESPUESTA_DEMASIADOS_INTENTOS } from "@/lib/rateLimit";
import { registrarError } from "@/lib/errorLog";
import { obtenerClienteActual } from "@/lib/sesionCliente";
import { createAdminClient } from "@/lib/supabase/admin";

// Reserva para varias personas de una vez (padre + hijos…), pedido de David 22/11/2026.
// Se llama DESPUÉS de crear la cita principal (POST /api/citas): aquí se busca hueco para cada
// persona extra el mismo día — a la misma hora con otro barbero si lo hay, y si no, lo más
// cerca posible después. Solo para clientes reconocidos en este móvil (se usan SUS datos).

export const dynamic = "force-dynamic";

const MAX_PERSONAS_EXTRA = 5;
const MAX_CITAS_FUTURAS_GRUPO = 10;

interface PersonaExtra {
  nombre?: unknown;
  servicioId?: unknown;
  // Hueco que el cliente vio y aceptó antes de confirmar (hora + barbero). Si no llega, se busca solo.
  horaInicioISO?: unknown;
  profesionalId?: unknown;
}

export async function POST(request: NextRequest) {
  const actual = await obtenerClienteActual();
  if (!actual) return NextResponse.json({ error: "Entra en tu perfil para reservar para varias personas." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const sedeId = typeof body?.sedeId === "string" ? body.sedeId : "";
  const fecha = typeof body?.fecha === "string" ? body.fecha : "";
  const horaInicioISO = typeof body?.horaInicioISO === "string" ? body.horaInicioISO : "";
  const personas: PersonaExtra[] = Array.isArray(body?.personas) ? body.personas.slice(0, MAX_PERSONAS_EXTRA) : [];
  if (!sedeId || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(horaInicioISO)) || personas.length === 0) {
    return NextResponse.json({ error: "Faltan datos para reservar a las demás personas." }, { status: 400 });
  }

  const limite = await comprobarLimite(`reserva:extras:${ipDePeticion(request)}`, { maxIntentos: 10, ventanaMinutos: 60 });
  if (!limite.permitido) return NextResponse.json(RESPUESTA_DEMASIADOS_INTENTOS, { status: 429 });

  const admin = createAdminClient();
  const { count } = await admin
    .from("citas")
    .select("id", { count: "exact", head: true })
    .eq("cliente_id", actual.cliente.id)
    .eq("estado", "confirmada")
    .gt("inicio", new Date().toISOString());
  if ((count ?? 0) + personas.length > MAX_CITAS_FUTURAS_GRUPO) {
    return NextResponse.json({ error: "Demasiadas citas pendientes. Escríbenos por WhatsApp para añadir más." }, { status: 409 });
  }

  const referencia = Date.parse(horaInicioISO);
  const resultados: { nombre: string; ok: boolean; inicio?: string; profesionalNombre?: string; servicioNombre?: string; error?: string }[] = [];

  for (const persona of personas) {
    const nombre = typeof persona.nombre === "string" ? persona.nombre.trim().slice(0, 40) : "";
    const servicioId = typeof persona.servicioId === "string" ? persona.servicioId : "";
    if (!nombre || !servicioId) {
      resultados.push({ nombre: nombre || "Persona", ok: false, error: "Faltan el nombre o el servicio." });
      continue;
    }
    try {
      // Se recalcula en cada vuelta: así cuenta lo que ya se ha reservado a las anteriores.
      const horaPedida = typeof persona.horaInicioISO === "string" ? persona.horaInicioISO : "";
      const proPedido = typeof persona.profesionalId === "string" ? persona.profesionalId : "";
      const slots = await getAvailableSlots({ sedeId, servicioId, fecha });
      const candidatos = slots
        .filter((s) => Date.parse(s.hora_inicio) >= referencia)
        .sort((a, b) => Date.parse(a.hora_inicio) - Date.parse(b.hora_inicio));
      // Primero el hueco que el cliente vio en pantalla; si ya no está libre, el más cercano.
      const slot =
        (horaPedida && proPedido
          ? slots.find((s) => s.hora_inicio === horaPedida && s.profesional_id === proPedido)
          : undefined) ?? candidatos[0];
      if (!slot) {
        resultados.push({ nombre, ok: false, error: "No queda hueco ese día a esa hora o después." });
        continue;
      }
      const { cita, profesionalNombre } = await crearReserva({
        sedeId,
        servicioId,
        profesionalId: slot.profesional_id,
        fecha,
        horaInicioISO: slot.hora_inicio,
        cliente: { nombre: actual.cliente.nombre, telefono: actual.cliente.telefono, email: actual.cliente.email ?? "" },
        aceptaComercial: false,
        canal: "app",
        origen: "app",
        complementoIds: [],
        profesionalElegidoPorCliente: false,
        notaCliente: `Cita para ${nombre} (reservada junto a otras)`,
      });
      const { data: servicio } = await admin.from("servicios").select("nombre").eq("id", servicioId).maybeSingle();
      resultados.push({ nombre, ok: true, inicio: cita.inicio, profesionalNombre, servicioNombre: servicio?.nombre ?? "" });
    } catch (err) {
      if (err instanceof ReservaError) {
        resultados.push({ nombre, ok: false, error: err.message });
      } else {
        await registrarError({ origen: "reserva", mensaje: "Fallo creando una cita de grupo", detalle: err });
        resultados.push({ nombre, ok: false, error: "No se pudo crear esta cita." });
      }
    }
  }

  return NextResponse.json({ resultados });
}
