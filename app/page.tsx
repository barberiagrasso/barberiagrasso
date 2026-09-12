import Link from "next/link";
import { GrassoLogo } from "@/components/brand/GrassoLogo";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-brand-black px-4 text-center">
      <GrassoLogo className="h-auto w-64 text-brand-white sm:w-80" />
      <p className="mt-5 font-heading text-xl italic text-brand-white-dim">
        Barbería · desde siempre
      </p>
      <p className="mt-2 font-mono text-xs uppercase tracking-widest text-brand-white-dim">
        Los Molinos · Avenida de las Ciudades
      </p>
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
