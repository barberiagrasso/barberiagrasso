// Portada "de app" (la de siempre): logo, sedes, Reservar cita,
// Reservar de nuevo, Mi perfil… Se enseña al cliente ya reconocido y a
// quien abre la app instalada; a un visitante nuevo de la web le sale la
// portada nueva (NuevaHomeClient). Pedido de David, 22/11/2026.
import Link from "next/link";
import { GrassoLogo } from "@/components/brand/GrassoLogo";
import { HeroBackdrop } from "@/components/brand/HeroBackdrop";
import { BotonCompartir } from "@/components/brand/BotonCompartir";
import { BotonInstalarApp } from "@/components/pwa/BotonInstalarApp";
import { NotasResenas } from "@/components/portafolio/NotasResenas";
import type { ResenasExternasSede } from "@/lib/portafolio";

export interface DatosHomeApp {
  cliente: { nombre: string } | null;
  sedes: { id: string; nombre: string; direccion: string | null; maps_url: string | null }[];
  resenas: Record<string, ResenasExternasSede>;
  repetir: { href: string; barbero: string; servicio: string } | null;
}

export function HomeApp({ cliente, sedes, resenas, repetir }: DatosHomeApp) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-brand-black px-4 py-16 text-center">
      <HeroBackdrop />

      <div className="relative z-10 flex flex-col items-center">
        <GrassoLogo className="h-auto w-64 text-brand-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)] sm:w-80" />
        <p className="mt-5 font-heading text-xl italic text-brand-white-dim">
          {cliente ? `Hola, ${cliente.nombre.split(" ")[0]}` : "Reserva tu cita en 1 minuto"}
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
            <span className="text-sm font-semibold uppercase tracking-wide">Reservar de nuevo</span>
            <span className="text-xs text-brand-white-dim">
              {repetir.servicio} con {repetir.barbero}
            </span>
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

        {/* Botón bien visible para todos. Si este móvil no le reconoce,
            /perfil le lleva a entrar con su teléfono y un código. */}
        <Link
          href="/perfil"
          className="mt-5 rounded-full border-2 border-brand-yellow px-8 py-3 font-body text-sm font-semibold uppercase tracking-wide text-brand-yellow transition-colors hover:bg-brand-yellow/10"
        >
          {cliente ? "Mi perfil y mis citas" : "Mi perfil"}
        </Link>

        <Link
          href="/estilo"
          className="mt-5 flex flex-col items-center rounded-none border border-brand-yellow/60 bg-black/20 px-6 py-3 font-body text-brand-white backdrop-blur-sm transition-colors hover:border-brand-yellow hover:bg-brand-yellow/10"
        >
          <span className="text-sm font-semibold uppercase tracking-wide">✨ Descubre tu estilo con IA</span>
          <span className="text-xs text-brand-white-dim">Qué corte y barba te favorecen según tu cara</span>
        </Link>

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
          className="mt-8 font-body text-xs text-brand-white-dim/70 underline decoration-brand-line underline-offset-4 hover:text-brand-yellow"
        >
          Política de privacidad
        </Link>
      </div>
    </main>
  );
}
