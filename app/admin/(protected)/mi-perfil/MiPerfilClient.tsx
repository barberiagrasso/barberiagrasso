"use client";

import { useRef, useState } from "react";
import { AvatarProfesional } from "@/components/brand/AvatarProfesional";

const LADO_MAXIMO_PX = 800;
const CALIDAD_JPEG = 0.85;

// Redimensiona en el propio navegador antes de subir (a través de un
// <canvas>) para que una foto hecha con el móvil no suba varios MB de
// golpe — se reduce al lado más largo indicado, conservando la
// proporción, y siempre se comprime como JPEG.
function redimensionarComoJpeg(file: File): Promise<{ base64: string; tipoMime: string }> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("El archivo no es una imagen válida."));
      img.onload = () => {
        const escala = Math.min(1, LADO_MAXIMO_PX / Math.max(img.width, img.height));
        const ancho = Math.round(img.width * escala);
        const alto = Math.round(img.height * escala);
        const canvas = document.createElement("canvas");
        canvas.width = ancho;
        canvas.height = alto;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No se pudo procesar la imagen."));
          return;
        }
        ctx.drawImage(img, 0, 0, ancho, alto);
        const dataUrl = canvas.toDataURL("image/jpeg", CALIDAD_JPEG);
        resolve({ base64: dataUrl.split(",")[1] ?? "", tipoMime: "image/jpeg" });
      };
      img.src = lector.result as string;
    };
    lector.readAsDataURL(file);
  });
}

export function MiPerfilClient({
  nombre,
  fotoInicial,
}: {
  nombre: string;
  fotoInicial: string | null;
}) {
  const [foto, setFoto] = useState(fotoInicial);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setSubiendo(true);
    try {
      const { base64, tipoMime } = await redimensionarComoJpeg(file);
      const res = await fetch("/api/admin/mi-perfil/foto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagenBase64: base64, tipoMime }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || "No se pudo subir la foto.");
        return;
      }
      setFoto(json.fotoUrl);
    } catch {
      setError("No se pudo procesar la imagen. Prueba con otra.");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div className="rounded-xl border border-brand-line bg-brand-black-soft/60 p-4">
      <h2 className="font-heading text-lg text-brand-white">Tu foto de perfil</h2>
      <p className="mt-1 font-body text-xs text-brand-white-dim">
        Aparece junto a tu nombre en la Agenda, al reservar y en el resto del panel. Se ve mejor una foto de cara,
        recortada al cuadrado.
      </p>
      <div className="mt-4 flex items-center gap-4">
        <AvatarProfesional fotoUrl={foto} nombre={nombre} className="h-20 w-20 text-2xl" />
        <div>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={subiendo}
            className="rounded-full bg-brand-yellow px-4 py-2 text-xs font-semibold uppercase tracking-wide text-brand-yellow-ink transition-colors hover:bg-brand-yellow-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            {subiendo ? "Subiendo…" : foto ? "Cambiar foto" : "Subir foto"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={elegirArchivo}
            className="hidden"
          />
          {error && <p className="mt-2 font-body text-xs text-red-400">{error}</p>}
        </div>
      </div>
    </div>
  );
}
