"use client";

import { IconPrinter } from "@/components/ui/Icons";

// Botón mínimo: todo el trabajo de verdad (ocultar cabecera, nav y
// botones flotantes) lo hace el CSS `print:hidden` ya puesto en
// app/admin/(protected)/layout.tsx y en esta misma página — este botón
// solo dispara el diálogo de impresión del propio navegador.
export default function BotonImprimir() {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-1.5 rounded-none bg-brand-black px-3 py-2 text-sm font-medium text-brand-white hover:opacity-85 transition-opacity print:hidden"
    >
      <IconPrinter className="h-4 w-4" />
      Imprimir esta hoja
    </button>
  );
}
