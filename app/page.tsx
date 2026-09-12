import Link from "next/link";
import { createPublicClient } from "@/lib/supabase/public";
import { GrassoLogo } from "@/components/brand/GrassoLogo";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = createPublicClient();
  const { data: sedes } = await supabase
    .from("sedes")
    .select("id, nombre, direccion, maps_url")
    .order("nombre");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-brand-black px-4 py-16 text-center">
      <GrassoLogo className="h-auto w-64 text-brand-white sm:w-80" />
      <p className="mt-5 font-heading text-xl italic text-brand-white-dim">
        Barbería · desde siempre
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
          </div>
        ))}
      </div>

      <Link
        href="/reservar"
        className="mt-10 rounded-full bg-brand-yellow px-8 py-3 font-body text-sm font-semibold uppercase tracking-wide text-brand-yellow-ink transition-colors hover:bg-brand-yellow-dark"
      >
        Reservar cita
      </Link>
      <Link
        href="/admin/login"
        className="mt-6 font-body text-sm text-brand-white-dim underline decoration-brand-line underline-offset-4 hover:text-brand-yellow"
      >
        Acceso para el equipo
      </Link>
    </main>
  );
}
