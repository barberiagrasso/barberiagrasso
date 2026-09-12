import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-bold text-stone-900">Barbería Grasso</h1>
      <p className="text-stone-600">Los Molinos · Avenida de las Ciudades</p>
      <Link
        href="/reservar"
        className="rounded-lg bg-amber-800 px-6 py-3 font-medium text-white hover:bg-amber-900"
      >
        Reservar cita
      </Link>
      <Link href="/admin/login" className="text-sm text-stone-400 underline">
        Acceso para el equipo
      </Link>
    </main>
  );
}
