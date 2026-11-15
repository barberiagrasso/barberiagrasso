import type { Metadata } from "next";
import Link from "next/link";
import { GrassoLogo } from "@/components/brand/GrassoLogo";
import AsesorEstilo from "./AsesorEstilo";

export const metadata: Metadata = {
  title: "Descubre tu estilo · Barbería Grasso",
  description: "Hazte un selfie y nuestra IA te dice qué corte y barba te favorecen según la forma de tu cara.",
};

// Página pública: no hace falta cuenta para usar el asesor de estilo.
export default function EstiloPage() {
  return (
    <main className="min-h-screen bg-brand-black px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Link href="/" aria-label="Inicio">
            <GrassoLogo className="h-auto w-24 text-brand-white" />
          </Link>
          <Link href="/" className="font-body text-xs text-brand-white-dim underline underline-offset-4">
            ← Inicio
          </Link>
        </div>
        <h1 className="font-heading text-3xl italic text-brand-white">Descubre tu estilo</h1>
        <p className="mt-2 font-body text-sm text-brand-white-dim">
          Hazte un selfie y nuestra IA analiza la forma de tu cara, tu pelo y tu barba para decirte qué corte te queda
          mejor. Luego lo reservas en un toque.
        </p>
        <AsesorEstilo />
      </div>
    </main>
  );
}
