export type VarianteBoton = "primario" | "acento" | "secundario";

export function clasesBoton(variante: VarianteBoton): string {
  switch (variante) {
    case "primario":
      return "bg-brand-black text-brand-white hover:opacity-90";
    case "acento":
      return "bg-brand-yellow text-brand-yellow-ink hover:bg-brand-yellow-dark";
    case "secundario":
      return "border border-stone-300 bg-transparent text-stone-900 hover:bg-stone-100";
  }
}

export type VarianteInsignia = "neutral" | "exito" | "alerta" | "error";

export function clasesInsignia(variante: VarianteInsignia): string {
  switch (variante) {
    case "neutral":
      return "bg-stone-100 text-stone-700";
    case "exito":
      return "bg-emerald-100 text-emerald-800";
    case "alerta":
      return "bg-amber-100 text-amber-800";
    case "error":
      return "bg-red-100 text-red-800";
  }
}
