import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Tarjeta({
  children,
  className,
  sinRelleno,
}: {
  children: ReactNode;
  className?: string;
  sinRelleno?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[20px] bg-white shadow-[0_1px_2px_rgba(20,18,16,0.04),0_16px_40px_rgba(20,18,16,0.08)]",
        sinRelleno ? "" : "p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
