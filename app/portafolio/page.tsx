import Link from "next/link";
import { createPublicClient } from "@/lib/supabase/public";
import { cargarFotosPortafolio, cargarResenasExternas } from "@/lib/portafolio";
import { GrassoLogo } from "@/components/brand/GrassoLogo";
import { NotasResenas } from "@/components/portafolio/NotasResenas";
import PortafolioPublico from "./PortafolioPublico";
import { FOTOS_PORTAFOLIO_FIJAS } from "@/lib/portafolioFijo";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Nuestros trabajos · Barbería Grasso",
  description: "Cortes, degradados, barbas y más: mira los trabajos de Barbería Grasso en Getafe.",
  // Al compartir este enlace, la vista previa dice "Nuestros trabajos"
  // (la imagen sigue siendo la general de app/opengraph-image.jpg).
  openGraph: {
    title: "Nuestros trabajos · Barbería Grasso",
    description: "Cortes, degradados, barbas y más: mira los trabajos de Barbería Grasso en Getafe.",
    url: "/portafolio",
    siteName: "Barbería Grasso",
    locale: "es_ES",
    type: "website",
  },
};

// Página pública (sin necesidad de iniciar sesión) con todos los trabajos
// del portafolio — pedido de Diego, 27/10/2026. Así se puede compartir el
// enlace por redes o WhatsApp.
export default async function PortafolioPage() {
  const supabase = createPublicClient();
  const [fotos, resenas, { data: servicios }, { data: sedes }] = await Promise.all([
    cargarFotosPortafolio(supabase),
    cargarResenasExternas(supabase),
    supabase.from("servicios").select("id, nombre").eq("activo", true).order("orden"),
    supabase.from("sedes").select("id, nombre").order("nombre"),
  ]);

  return (
    <main className="min-h-screen bg-brand-black px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="font-body text-sm text-brand-white-dim underline decoration-brand-line underline-offset-4 hover:text-brand-yellow"
          >
            ← Inicio
          </Link>
          <Link
            href="/reservar"
            className="rounded-none bg-brand-white px-4 py-2 font-body text-xs font-semibold uppercase tracking-wide text-brand-black transition-opacity hover:opacity-85"
          >
            Reservar cita
          </Link>
        </div>

        <div className="mb-6 flex flex-col items-center text-center">
          <GrassoLogo className="h-auto w-28 text-brand-white" />
          <h1 className="mt-4 font-heading text-2xl italic text-brand-white">Nuestros trabajos</h1>
          <div className="mt-3 flex flex-wrap justify-center gap-x-8 gap-y-3">
            {(sedes ?? []).map((sede) =>
              resenas[sede.id] ? (
                <div key={sede.id} className="text-center">
                  <p className="font-mono text-[11px] uppercase tracking-widest text-brand-yellow">{sede.nombre}</p>
                  <NotasResenas resenas={resenas[sede.id]} className="mt-1 items-center" />
                </div>
              ) : null,
            )}
          </div>
        </div>

        {/* Guía de estilos de Grasso (cartel, 15/11/2026). Al tocarla se
            abre en grande para poder ampliarla con los dedos. */}
        <section className="mb-8">
          <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-brand-yellow">¿Qué estilo llevas hoy?</h2>
          <a href="/media/cartel-estilos.jpg" target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-brand-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/media/cartel-estilos.jpg"
              alt="Guía de estilos de Barbería Grasso: cortes, barbas, cortes infantiles y servicios"
              className="w-full"
            />
          </a>
          <p className="mt-1 text-center font-body text-xs text-brand-white-dim">Toca la imagen para verla en grande.</p>
          <Link
            href="/estilo"
            className="mt-3 block rounded-xl border border-brand-yellow/50 px-4 py-3 text-center font-body text-sm font-semibold text-brand-yellow"
          >
            ✨ ¿No sabes cuál elegir? Descubre tu estilo con IA
          </Link>
        </section>

        <PortafolioPublico fotos={[...fotos, ...FOTOS_PORTAFOLIO_FIJAS]} servicios={servicios ?? []} sedes={sedes ?? []} />
      </div>
    </main>
  );
}
