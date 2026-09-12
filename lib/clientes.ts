import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Normaliza un teléfono a un formato consistente (aprox. E.164) para que
 * el mismo cliente se reconozca tanto si reserva desde la app (puede
 * escribir "612 345 678") como si escribe por WhatsApp (llega como
 * "34612345678", sin "+") o lo damos de alta a mano desde el panel.
 * Ajusta el prefijo "34" si en el futuro abres en otro país.
 */
export function normalizarTelefono(telefono: string): string {
  const soloDigitosYMas = telefono.replace(/[^\d+]/g, "");
  if (soloDigitosYMas.startsWith("+")) return soloDigitosYMas;
  if (soloDigitosYMas.length === 9 && /^[679]/.test(soloDigitosYMas)) {
    return `+34${soloDigitosYMas}`;
  }
  return `+${soloDigitosYMas}`;
}

/**
 * Email "sintético" y determinista a partir de un teléfono ya
 * normalizado. Supabase Auth necesita un identificador con forma de
 * email para el login con contraseña, pero de cara al cliente (y a
 * nosotros) el identificador real es el teléfono — nunca se manda nada a
 * esta dirección, el usuario se crea ya confirmado desde el servidor.
 */
export function emailSinteticoParaTelefono(telefonoNormalizado: string): string {
  return `${telefonoNormalizado.replace(/^\+/, "")}@clientes.barberiagrasso.internal`;
}

interface DatosCliente {
  nombre: string;
  telefono: string;
  email?: string | null;
  sedeId?: string | null;
}

/**
 * Busca un cliente por teléfono y lo crea si no existe. Es el ÚNICO
 * sitio donde se decide si dos altas son "la misma persona" — lo usan
 * por igual la reserva desde la app, el asistente de WhatsApp, el alta
 * manual desde el panel (cliente que llama por teléfono) y el registro
 * de cuenta con contraseña. Así, sea cual sea la puerta de entrada,
 * siempre casa con el mismo historial de citas.
 */
export async function buscarOCrearCliente(
  supabase: SupabaseClient,
  datos: DatosCliente
): Promise<{ clienteId: string; esNuevo: boolean }> {
  const telefono = normalizarTelefono(datos.telefono);
  const { data: existente } = await supabase
    .from("clientes")
    .select("id")
    .eq("telefono", telefono)
    .maybeSingle();

  if (existente?.id) {
    return { clienteId: existente.id, esNuevo: false };
  }

  const { data: nuevo, error } = await supabase
    .from("clientes")
    .insert({
      nombre: datos.nombre,
      telefono,
      email: datos.email || null,
      sede_habitual_id: datos.sedeId || null,
    })
    .select("id")
    .single();

  if (error || !nuevo) {
    throw new Error("No se pudo registrar el cliente.");
  }
  return { clienteId: nuevo.id, esNuevo: true };
}
