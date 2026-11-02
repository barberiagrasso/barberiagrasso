import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { clasesBoton, type VarianteBoton } from "@/lib/estilosUi";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 font-body text-sm font-semibold transition disabled:opacity-50 disabled:pointer-events-none";

export function Boton({
  variante = "primario",
  href,
  type = "button",
  disabled,
  onClick,
  className,
  children,
}: {
  variante?: VarianteBoton;
  href?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const clases = cn(BASE, clasesBoton(variante), className);
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
