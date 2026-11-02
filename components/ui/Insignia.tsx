import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { clasesInsignia, type VarianteInsignia } from "@/lib/estilosUi";

export function Insignia({
  variante = "neutral",
  children,
  className,
}: {
  variante?: VarianteInsignia;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        clasesInsignia(variante),
        className,
      )}
    >
      {children}
    </span>
  );
}
