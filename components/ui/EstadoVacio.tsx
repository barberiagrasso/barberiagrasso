import { cn } from "@/lib/cn";

export function EstadoVacio({
  titulo,
  descripcion,
  className,
}: {
  titulo: string;
  descripcion?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[20px] border border-stone-200 bg-white p-8 text-center", className)}>
      <p className="text-sm font-semibold text-stone-900">{titulo}</p>
      {descripcion && <p className="mt-1 text-sm text-stone-500">{descripcion}</p>}
    </div>
  );
}
