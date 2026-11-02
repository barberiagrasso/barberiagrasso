import Link from "next/link";
import { createPublicClient } from "@/lib/supabase/public";
import { obtenerClienteActual } from "@/lib/sesionCliente";
import { GrassoLogo } from "@/components/brand/GrassoLogo";
import { HeroBackdrop } from "@/components/brand/HeroBackdrop";
import { createAdminClient } from "@/lib/supabase/admin";
import { BotonCompartir } from "@/components/brand/BotonCompartir";
import { BotonInstalarApp } from "@/components/pwa/BotonInstalarApp";
import { NotasResenas } from "@/components/portafolio/NotasResenas";
import { cargarResenasExternas } from "@/lib/portafolio";
import { Tarjeta } from "@/components/ui/Tarjeta";
import { Boton } from "@/components/ui/Boton";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Portada abierta a todos (01/11/2026): sin cuenta se puede reservar.
  // Si este móvil ya reconoce al cliente, se le saluda y se le ofrece
  // repetir con su barbero y entrar a su perfil.
  const cliente = (await obtenerClienteActual())?.cliente ?? null;

  const supabase = createPublicClient();
  const [{ data: sedes }, resenas, { data: ultimas }] = await Promise.all([
    supabase.from("sedes").select("id, nombre, direccion, maps_url").order("nombre"),
    cargarResenasExternas(supabase),
    // Su última visita, para el botón "Repetir con <barbero>".
    cliente
      ? createAdminClient()
          .from("citas")
          .select("sede_id, servicio_id, profesional_id, profesional:profesionales(nombre, activo), servicio:servicios(nombre, activo)")
          .eq("cliente_id", cliente.id)
          .eq("estado", "completada")
          .not("profesional_id", "is", null)
          .order("inicio", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: null }),
  ]);

  // Supabase puede devolver la relación como objeto o como lista.
  const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  const ultima = ultimas?.[0];
  const barberoUltima = uno(ultima?.profesional as { nombre: string; activo: boolean } | { nombre: string; activo: boolean }[] | null);
  const servicioUltima = uno(ultima?.servicio as { nombre: string; activo: boolean } | { nombre: string; activo: boolean }[] | null);
  const repetir =
    ultima && barberoUltima?.activo && servicioUltima?.activo
      ? {
          href: `/reservar?${new URLSearchParams({ sede: ultima.sede_id, servicio: ultima.servicio_id, barbero: ultima.profesional_id! })}`,
          barbero: barberoUltima.nombre.split(" ")[0],
          servicio: servicioUltima.nombre,
        }
      : null;

  return (
    <main className="min-h-screen bg-stone-50">
      {/* Franja oscura: aquí vive el logo (PNG blanco sobre transparente,
          pensado para fondo oscuro) y el vídeo de fondo — sin tocar. */}
      <div className="relative flex flex-col items-center overflow-hidden bg-brand-black px-4 py-16 text-center">
        <HeroBackdrop />
        <div className="relative z-10 flex flex-col items-center">
          <GrassoLogo className="h-auto w-64 text-brand-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)] sm:w-80" />
          <p className="mt-5 font-heading text-xl italic text-brand-white-dim">
            {cliente ? `Hola, ${cliente.nombre.split(" ")[0]}` : "Reserva tu cita en 1 minuto"}
          </p>
        </div>
      </div>

      {/* Cuerpo claro: mismo tono que el panel de admin (bg-stone-50),
          para que cliente y admin compartan la misma base. */}
      <div className="flex flex-col items-center px-4 py-10 text-center">
        <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
          {(sedes ?? []).map((sede) => (
            <Tarjeta key={sede.id} className="max-w-[15rem]">
              <p className="font-heading text-sm text-stone-900">{sede.nombre}</p>
              {sede.direccion && <p className="mt-1 font-body text-sm text-stone-600">{sede.direccion}</p>}
              {sede.maps_url && (
                <a
                  href={sede.maps_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block font-body text-xs text-stone-500 underline decoration-stone-300 underline-offset-4 hover:text-stone-900"
                >
                  Cómo llegar
                </a>
              )}
              <NotasResenas resenas={resenas[sede.id]} className="mt-2 items-center" />
            </Tarjeta>
          ))}
        </div>

        <Boton href="/reservar" variante="primario" className="mt-10">
          Reservar cita
        </Boton>

        {repetir && (
          <Boton href={repetir.href} variante="secundario" className="mt-4 flex-col gap-0.5 py-2.5">
            <span className="text-sm font-semibold">Reservar de nuevo</span>
            <span className="text-xs text-stone-500">
              {repetir.servicio} con {repetir.barbero}
            </span>
          </Boton>
        )}

        <div className="mt-4 flex gap-6">
          <Link
            href="/portafolio"
            className="font-body text-sm font-semibold text-stone-700 underline decoration-brand-yellow-dark/60 underline-offset-4 hover:text-stone-900"
          >
            Nuestros trabajos
          </Link>
          <Link
            href="/tienda"
            className="font-body text-sm font-semibold text-stone-700 underline decoration-brand-yellow-dark/60 underline-offset-4 hover:text-stone-900"
          >
            Tienda
          </Link>
        </div>

        {/* Botón bien visible para todos. Si este móvil no le reconoce,
            /perfil le lleva a entrar con su teléfono y un código. */}
        <Boton href="/perfil" variante="acento" className="mt-5">
          {cliente ? "Mi perfil y mis citas" : "Mi perfil"}
        </Boton>

        <BotonInstalarApp />

        <div className="mt-5">
          <BotonCompartir
            path="/"
            titulo="Barbería Grasso"
            texto="Reserva tu cita en Barbería Grasso desde el móvil."
          />
        </div>

        <Link
          href="/politica-privacidad"
          className="mt-8 font-body text-xs text-stone-400 underline decoration-stone-300 underline-offset-4 hover:text-stone-700"
        >
          Política de privacidad
        </Link>
      </div>
    </main>
  );
}
