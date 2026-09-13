import type { Instrumentation } from "next";

// Red de seguridad global: cualquier error que se escape sin que el
// propio código lo haya capturado ya (por ejemplo con registrarError en
// lib/errorLog.ts) llega aquí y queda registrado igualmente, para que
// nunca desaparezca en silencio en los logs de Vercel.
//
// No se registran aquí los errores que el código YA captura y anota a
// mano (reserva, cancelación, webhook, crons): esos no llegan a "escapar"
// porque su ruta responde con un NextResponse normal en vez de relanzar
// el error, así que no hay riesgo de duplicados.
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  // No usa "server-only" lib/errorLog.ts vía import estático arriba para
  // evitar tirar de él en el runtime "edge" si algún día se usa; se
  // importa aquí dentro, solo cuando realmente hace falta.
  const { registrarError } = await import("@/lib/errorLog");

  const mensaje = error instanceof Error ? error.message : String(error);
  await registrarError({
    origen: "servidor",
    mensaje: `${context.routeType} ${request.path}: ${mensaje}`,
    detalle: { request, context, stack: error instanceof Error ? error.stack : undefined },
  });
};
