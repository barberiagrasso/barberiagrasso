import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi, NoAutorizadoError } from "@/lib/adminApiAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { fechaMadrid, textoAvisoCierre } from "@/lib/caja";
import { citasSinResolver, cobrosDelDia, diasSinCerrar, filaCaja, sedesDeCaja, ultimoFondo } from "@/lib/cajaServidor";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const BUCKET = "caja";

async function auth() {
  try {
    return (await requireAdminApi()).admin as { id: string; nombre: string | null; rol: string; profesional_id: string | null };
  } catch (err) {
    if (err instanceof NoAutorizadoError) return null;
    throw err;
  }
}

const centimos = (v: FormDataEntryValue | null): number | null => {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Math.round(parseFloat(v.replace(",", ".")) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// Estado de la caja de una sede en un día + historial (para el dueño).
export async function GET(request: NextRequest) {
  const admin = await auth();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const { sedes, faltaSql } = await sedesDeCaja(admin);
  if (faltaSql) return NextResponse.json({ faltaSql: true });
  if (sedes.length === 0) return NextResponse.json({ faltaSql: false, sedes: [] });

  const hoy = fechaMadrid();
  const sp = request.nextUrl.searchParams;
  const sede = sedes.find((s) => s.id === sp.get("sede")) ?? sedes[0];
  const fecha = FECHA.test(sp.get("fecha") ?? "") && sp.get("fecha")! <= hoy ? sp.get("fecha")! : hoy;

  const [fila, pendientes, cobros, sinCerrar, fondoAnterior] = await Promise.all([
    filaCaja(sede.id, fecha),
    citasSinResolver(sede.id, fecha),
    cobrosDelDia(sede.id, fecha),
    diasSinCerrar(sede.id, fecha),
    ultimoFondo(sede.id, fecha),
  ]);

  const supabase = createAdminClient();
  let fotoUrl: string | null = null;
  if (fila?.foto_ruta) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(fila.foto_ruta, 3600);
    fotoUrl = data?.signedUrl ?? null;
  }

  let historial: unknown[] = [];
  let cuentas: unknown[] = [];
  if (admin.rol === "admin") {
    const [{ data: h }, { data: c }] = await Promise.all([
      supabase.from("caja_dias").select("*").eq("sede_id", sede.id).order("fecha", { ascending: false }).limit(31),
      supabase.from("admins").select("id, nombre, rol").order("nombre"),
    ]);
    historial = h ?? [];
    cuentas = c ?? [];
  }

  return NextResponse.json({
    faltaSql: false,
    esAdmin: admin.rol === "admin",
    hoy,
    fecha,
    sedes,
    sedeId: sede.id,
    fila,
    fotoUrl,
    pendientes,
    cobros,
    sinCerrar,
    fondoAnterior,
    historial,
    cuentas,
  });
}

// accion=abrir (cualquiera del equipo de la sede) o accion=cerrar (solo
// el encargado de caja de la sede o el dueño). Llega como formulario
// porque el cierre trae la foto del sobre.
export async function POST(request: NextRequest) {
  const admin = await auth();
  if (!admin) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Datos no válidos." }, { status: 400 });
  const { sedes, faltaSql } = await sedesDeCaja(admin);
  if (faltaSql) return NextResponse.json({ error: "La caja aún no está activada (falta el script de la base de datos)." }, { status: 400 });
  const sede = sedes.find((s) => s.id === form.get("sedeId"));
  if (!sede) return NextResponse.json({ error: "No tienes acceso a la caja de esta sede." }, { status: 403 });
  const hoy = fechaMadrid();
  const fecha = String(form.get("fecha") ?? "");
  if (!FECHA.test(fecha) || fecha > hoy) return NextResponse.json({ error: "Fecha no válida." }, { status: 400 });
  const supabase = createAdminClient();
  const fila = await filaCaja(sede.id, fecha);
  const nombre = admin.nombre || "Equipo";

  if (form.get("accion") === "abrir") {
    if (fecha !== hoy) return NextResponse.json({ error: "Solo se puede abrir la caja de hoy." }, { status: 400 });
    if (fila?.abierta_at) return NextResponse.json({ error: "La caja de hoy ya está abierta." }, { status: 400 });
    const sinCerrar = await diasSinCerrar(sede.id, fecha);
    if (sinCerrar.length > 0) {
      return NextResponse.json({ error: `No se puede abrir: falta cerrar la caja del ${sinCerrar.map((f) => f.split("-").reverse().join("/")).join(", ")}. Avisa al encargado.` }, { status: 409 });
    }
    const fondo = centimos(form.get("fondo"));
    if (fondo === null) return NextResponse.json({ error: "Escribe el fondo de caja que has contado." }, { status: 400 });
    const { error } = await supabase.from("caja_dias").upsert(
      { sede_id: sede.id, fecha, abierta_at: new Date().toISOString(), abierta_por: admin.id, abierta_por_nombre: nombre, fondo_inicial_centimos: fondo },
      { onConflict: "sede_id,fecha" },
    );
    if (error) return NextResponse.json({ error: "No se pudo abrir la caja." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (form.get("accion") === "cerrar") {
    if (!sede.puedeCerrar) return NextResponse.json({ error: "Solo el encargado de caja de esta sede puede cerrarla." }, { status: 403 });
    if (fila?.cerrada_at) return NextResponse.json({ error: "Esta caja ya está cerrada." }, { status: 400 });
    const anteriores = await diasSinCerrar(sede.id, fecha);
    if (anteriores.length > 0) return NextResponse.json({ error: `Primero cierra la caja del ${anteriores[0].split("-").reverse().join("/")}.` }, { status: 409 });
    const pendientes = await citasSinResolver(sede.id, fecha);
    if (pendientes.length > 0) {
      return NextResponse.json({ error: `Hay ${pendientes.length} cita(s) sin resolver. Márcalas como cobradas, canceladas o no presentadas antes de cerrar.`, pendientes }, { status: 409 });
    }
    const contado = centimos(form.get("contado"));
    const fondoSiguiente = centimos(form.get("fondoSiguiente"));
    if (contado === null || fondoSiguiente === null) return NextResponse.json({ error: "Escribe el efectivo contado y el fondo que se deja para mañana." }, { status: 400 });
    if (fondoSiguiente > contado) return NextResponse.json({ error: "El fondo para mañana no puede ser mayor que lo que hay en caja." }, { status: 400 });
    const cobros = await cobrosDelDia(sede.id, fecha);
    const fondoInicial = fila?.fondo_inicial_centimos ?? (await ultimoFondo(sede.id, fecha)) ?? 0;
    const esperado = fondoInicial + cobros.efectivo;
    const diferencia = contado - esperado;
    const motivo = String(form.get("motivo") ?? "").trim().slice(0, 500) || null;
    if (diferencia !== 0 && !motivo) return NextResponse.json({ error: "La caja no cuadra: explica el motivo de la diferencia.", diferencia }, { status: 400 });

    const foto = form.get("foto");
    if (!(foto instanceof File) || foto.size === 0) return NextResponse.json({ error: "Haz la foto del sobre antes de cerrar." }, { status: 400 });
    if (foto.size > 10 * 1024 * 1024) return NextResponse.json({ error: "La foto es demasiado grande." }, { status: 400 });
    const ruta = `${sede.id}/${fecha}-${Date.now()}.jpg`;
    const { error: errFoto } = await supabase.storage.from(BUCKET).upload(ruta, foto, { contentType: foto.type || "image/jpeg" });
    if (errFoto) return NextResponse.json({ error: "No se pudo subir la foto del sobre." }, { status: 500 });

    const { error } = await supabase.from("caja_dias").upsert(
      {
        sede_id: sede.id,
        fecha,
        fondo_inicial_centimos: fondoInicial,
        cerrada_at: new Date().toISOString(),
        cerrada_por: admin.id,
        cerrada_por_nombre: nombre,
        efectivo_cobrado_centimos: cobros.efectivo,
        tarjeta_centimos: cobros.tarjeta,
        bizum_centimos: cobros.bizum,
        otros_centimos: cobros.otros,
        num_cobros: cobros.numCobros,
        efectivo_esperado_centimos: esperado,
        efectivo_contado_centimos: contado,
        diferencia_centimos: diferencia,
        motivo_diferencia: motivo,
        fondo_siguiente_centimos: fondoSiguiente,
        foto_ruta: ruta,
        notas: String(form.get("notas") ?? "").trim().slice(0, 500) || null,
      },
      { onConflict: "sede_id,fecha" },
    );
    if (error) return NextResponse.json({ error: "No se pudo guardar el cierre." }, { status: 500 });

    // Aviso a David por WhatsApp (si está configurado el teléfono).
    const tel = process.env.CAJA_AVISO_TELEFONO;
    if (tel) {
      try {
        await sendWhatsAppMessage(tel, textoAvisoCierre({ sede: sede.nombre, fecha, encargado: nombre, desglose: cobros, contado, esperado, motivo, fondoSiguiente }));
      } catch {
        /* el cierre ya está guardado; el aviso es opcional */
      }
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
}
