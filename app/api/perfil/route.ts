import { NextRequest, NextResponse } from "next/server";
import { requireClienteApi, NoAutorizadoError } from "@/lib/clienteApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizarTelefono, emailSinteticoParaTelefono } from "@/lib/clientes";

export const dynamic = "force-dynamic";

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Deja que un cliente actualice datos de su propia ficha desde "Editar
// perfil" (reorganización del apartado de perfil, pedido de Diego,
// 19/09/2026): cumpleaños, nombre, teléfono y email — antes solo se podía
// tocar la fecha de nacimiento. Usa el cliente de servicio porque
// `clientes` solo tiene política de RLS de auto-lectura, no de
// auto-actualización — la comprobación de que es SU propia ficha ya la
// hace requireClienteApi().
export async function PATCH(request: NextRequest) {
  let cliente, user;
  try {
    ({ cliente, user } = await requireClienteApi());
  } catch (err) {
    if (err instanceof NoAutorizadoError) return NextResponse.json({ error: err.message }, { status: 401 });
    throw err;
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });

  const campos: Record<string, unknown> = {};

  if ("fechaNacimiento" in body) {
    const fechaNacimiento = body.fechaNacimiento;
    if (fechaNacimiento !== null) {
      if (typeof fechaNacimiento !== "string" || !FECHA_REGEX.test(fechaNacimiento)) {
        return NextResponse.json({ error: "Fecha no válida." }, { status: 400 });
      }
      if (fechaNacimiento > new Date().toISOString().slice(0, 10)) {
        return NextResponse.json({ error: "La fecha no puede ser futura." }, { status: 400 });
      }
    }
    campos.fecha_nacimiento = fechaNacimiento;
  }

  if ("nombre" in body) {
    const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre) return NextResponse.json({ error: "El nombre no puede estar vacío." }, { status: 400 });
    campos.nombre = nombre;
  }

  if ("email" in body) {
    const email = typeof body.email === "string" ? body.email.trim() : "";
    if (email && !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "El email no es válido." }, { status: 400 });
    }
    campos.email = email || null;
  }

  // Cambiar el teléfono es más delicado que el resto de campos: el login
  // con contraseña usa un email "sintético" generado a partir del
  // teléfono (ver lib/clientes.ts) como identificador de Supabase Auth,
  // así que hay que regenerarlo y actualizarlo en el propio usuario de
  // Auth — si no, el cliente se quedaría iniciando sesión con su NÚMERO
  // ANTIGUO aunque la ficha ya muestre el nuevo, lo cual sería muy
  // confuso. `clientes.telefono` tiene un unique en la base de datos, así
  // que un número repetido se detecta abajo por el error 23505.
  let telefonoNormalizado: string | null = null;
  if ("telefono" in body) {
    const telefonoTexto = typeof body.telefono === "string" ? body.telefono.trim() : "";
    if (!telefonoTexto) return NextResponse.json({ error: "El teléfono no puede estar vacío." }, { status: 400 });
    telefonoNormalizado = normalizarTelefono(telefonoTexto);
    if (telefonoNormalizado.replace(/^\+/, "").length < 9) {
      return NextResponse.json({ error: "El teléfono no es válido." }, { status: 400 });
    }
    campos.telefono = telefonoNormalizado;
  }

  if (Object.keys(campos).length === 0) {
    return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });
  }

  const admin = createAdminClient();

  if (telefonoNormalizado && telefonoNormalizado !== cliente.telefono) {
    const { error: errorAuth } = await admin.auth.admin.updateUserById(user.id, {
      email: emailSinteticoParaTelefono(telefonoNormalizado),
    });
    if (errorAuth) {
      return NextResponse.json({ error: "Ese teléfono ya está en uso por otra cuenta." }, { status: 409 });
    }
  }

  const { error } = await admin.from("clientes").update(campos).eq("id", cliente.id);
  if (error) {
    // Si falló también hay que deshacer el cambio de email de Auth de
    // arriba, para no dejar el teléfono de acceso desincronizado del que
    // se ve en la ficha.
    if (telefonoNormalizado && telefonoNormalizado !== cliente.telefono) {
      await admin.auth.admin.updateUserById(user.id, { email: emailSinteticoParaTelefono(cliente.telefono) });
    }
    const mensaje = error.code === "23505" ? "Ese teléfono ya está en uso por otra cuenta." : "No se pudo guardar. Inténtalo de nuevo.";
    return NextResponse.json({ error: mensaje }, { status: error.code === "23505" ? 409 : 500 });
  }

  return NextResponse.json({ ok: true });
}
