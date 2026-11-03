import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { clasesBoton, type VarianteBoton } from "@/lib/estilosUi";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-body font-semibold transition disabled:opacity-50 disabled:pointer-events-none";

const TAMANOS = {
  md: "px-6 py-3 text-sm",
  sm: "px-3 py-1 text-xs",
} as const;

export function Boton({
  variante = "primario",
  tamano = "md",
  href,
  type = "button",
  disabled,
  onClick,
  className,
  children,
}: {
  variante?: VarianteBoton;
  tamano?: keyof typeof TAMANOS;
  href?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const clases = cn(BASE, TAMANOS[tamano], clasesBoton(variante), className);
  if (href) {
    return (
      <Link href={href} className={clases}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} disabled={disabled} onClick={onClick} className={clases}>
      {children}
    </button>
  );
}
