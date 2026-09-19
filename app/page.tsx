import Link from "next/link";
import { createPublicClient } from "@/lib/supabase/public";
import { requireCliente } from "@/lib/clienteAuth";
import { GrassoLogo } from "@/components/brand/GrassoLogo";
import { HeroBackdrop } from "@/components/brand/HeroBackdrop";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Lo primero al entrar: si no hay sesión de cliente, esto manda a
  // /acceso. Una vez logueado, la sesión se queda puesta indefinidamente
  // (no caduca sola) hasta que el propio cliente cierre sesión.
  const { cliente } = await requireCliente();

  const supabase = createPublicClient();
  const { data: sedes } = await supabase
    .from("sedes")
    .select("id, nombre, direccion, maps_url")
    .order("nombre");

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
            </div>
          ))}
        </div>

        <Link
          href="/reservar"
          className="mt-10 rounded-full bg-brand-yellow px-8 py-3 font-body text-sm font-semibold uppercase tracking-wide text-brand-yellow-ink shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition-colors hover:bg-brand-yellow-dark"
        >
          Reservar cita
        </Link>
        <Link
          href="/perfil"
          className="mt-4 rounded-full border border-brand-yellow/50 px-6 py-2.5 font-body text-sm font-semibold text-brand-yellow transition-colors hover:border-brand-yellow hover:bg-brand-yellow/10"
        >
          Mi perfil y mis citas
        </Link>
      </div>
    </main>
  );
}
