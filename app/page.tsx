import Link from "next/link";
import { createPublicClient } from "@/lib/supabase/public";
import { requireCliente } from "@/lib/clienteAuth";
import { GrassoLogo } from "@/components/brand/GrassoLogo";
import { HeroBackdrop } from "@/components/brand/HeroBackdrop";
import { createAdminClient } from "@/lib/supabase/admin";
import { BotonCompartir } from "@/components/brand/BotonCompartir";
import { NotasResenas } from "@/components/portafolio/NotasResenas";
import { cargarResenasExternas } from "@/lib/portafolio";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Lo primero al entrar: si no hay sesión de cliente, esto manda a
  // /acceso. Una vez logueado, la sesión se queda puesta indefinidamente
  // (no caduca sola) hasta que el propio cliente cierre sesión.
  const { cliente } = await requireCliente();

  const supabase = createPublicClient();
  const [{ data: sedes }, resenas, { data: ultimas }] = await Promise.all([
    supabase.from("sedes").select("id, nombre, direccion, maps_url").order("nombre"),
    cargarResenasExternas(supabase),
    // Su última visita, para el botón "Repetir con <barbero>".
    createAdminClient()
      .from("citas")
      .select("sede_id, servicio_id, profesional_id, profesional:profesionales(nombre, activo), servicio:servicios(nombre, activo)")
      .eq("cliente_id", cliente.id)
      .eq("estado", "completada")
      .not("profesional_id", "is", null)
      .order("inicio", { ascending: false })
      .limit(1),
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
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-brand-black px-4 py-16 text-center">
      <HeroBackdrop />

      <div className="relative z-10 flex flex-col items-center">
        <GrassoLogo className="h-auto w-64 text-brand-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)] sm:w-80" />
        <p className="mt-5 font-heading text-xl italic text-brand-white-dim">
          Hola, {cliente.nombre.split(" ")[0]}
        </p>

        <div className="mt-8 flex flex-col gap-5 sm:flex-row sm:gap-10">
          {(sedes ?? []).map((sede) => (
            <div key={sede.id} className="max-w-[15rem]">
              <p className="font-mono text-xs uppercase tracking-widest text-brand-yellow">{sede.nombre}</p>
              {sede.direccion && (
                <p className="mt-1 font-body text-sm text-brand-white-dim">{sede.direccion}</p>
              )}
              {sede.maps_url && (
                <a
                  href={sede.maps_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block font-body text-xs text-brand-white-dim underline decoration-brand-line underline-offset-4 hover:text-brand-yellow"
                >
                  Cómo llegar
                </a>
              )}
              <NotasResenas resenas={resenas[sede.id]} className="mt-2 items-center" />
            </div>
          ))}
        </div>

        <Link
          href="/reservar"
          className="mt-10 rounded-none bg-brand-white px-8 py-3 font-body text-sm font-semibold uppercase tracking-wide text-brand-black shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition-opacity hover:opacity-85"
        >
          Reservar cita
        </Link>

        {repetir && (
          <Link
            href={repetir.href}
            className="mt-4 flex flex-col items-center rounded-none border border-brand-white/70 px-6 py-2.5 font-body text-brand-white transition-colors hover:bg-brand-white/10"
          >
            <span className="text-sm font-semibold uppercase tracking-wide">Repetir con {repetir.barbero}</span>
            <span className="text-xs text-brand-white-dim">{repetir.servicio}</span>
          </Link>
        )}

        <div className="mt-4 flex gap-6">
          <Link
            href="/portafolio"
            className="font-body text-sm font-semibold text-brand-white underline decoration-brand-yellow/60 underline-offset-4 hover:text-brand-yellow"
          >
            Nuestros trabajos
          </Link>
          <Link
            href="/tienda"
            className="font-body text-sm font-semibold text-brand-white underline decoration-brand-yellow/60 underline-offset-4 hover:text-brand-yellow"
          >
            Tienda
          </Link>
        </div>

        <Link
          href="/perfil"
          className="mt-4 rounded-full border border-brand-yellow/50 px-6 py-2.5 font-body text-sm font-semibold text-brand-yellow transition-colors hover:border-brand-yellow hover:bg-brand-yellow/10"
        >
          Mi perfil y mis citas
        </Link>

        <div className="mt-5">
          <BotonCompartir
            path="/"
            titulo="Barbería Grasso"
            texto="Reserva tu cita en Barbería Grasso desde el móvil."
          />
        </div>

        <Link
          href="/politica-privacidad"
          className="mt-8 font-body text-xs text-brand-white-dim/70 underline decoration-brand-line underline-offset-4 hover:text-brand-yellow"
        >
          Política de privacidad
        </Link>
      </div>
    </main>
  );
}
