import { cn } from "@/lib/cn";

// Nota y nº de reseñas de Booksy y Google de una sede, enlazadas a su
// página para leerlas allí (pedido de Diego, 27/10/2026). No se copian las
// reseñas: solo la nota, con su fuente bien clara. Componente sin estado,
// vale tanto en servidor como en cliente.
//
// `claro`: en /portafolio se sigue usando sobre fondo oscuro (colores por
// defecto, sin cambios). En la home (Task 7 de la etapa de identidad
// visual) pasa dentro de una Tarjeta blanca — con `claro` usa colores
// oscuros en vez de los claros/amarillo pensados para fondo negro.

interface ResenaExterna {
  url: string | null;
  nota: number | null;
  total: number | null;
}

function Nota({ fuente, datos, claro }: { fuente: string; datos?: ResenaExterna; claro?: boolean }) {
  if (!datos || datos.nota === null) return null;
  const contenido = (
    <>
      <span className={claro ? "text-stone-900" : "text-brand-yellow"}>
        ★ {datos.nota.toLocaleString("es-ES", { minimumFractionDigits: 1 })}
      </span>
      <span className={claro ? "text-stone-500" : "text-brand-white-dim"}>
        {" "}
        en {fuente}
        {datos.total ? ` · ${datos.total.toLocaleString("es-ES")} reseñas` : ""}
      </span>
    </>
  );
  return datos.url ? (
    <a
      href={datos.url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "font-body text-xs underline underline-offset-4",
        claro ? "decoration-stone-300 hover:decoration-stone-900" : "decoration-brand-line hover:decoration-brand-yellow",
      )}
    >
      {contenido}
    </a>
  ) : (
    <span className="font-body text-xs">{contenido}</span>
  );
}

export function NotasResenas({
  resenas,
  className = "",
  claro,
}: {
  resenas?: { booksy?: ResenaExterna; google?: ResenaExterna };
  className?: string;
  claro?: boolean;
}) {
  if (!resenas || (resenas.booksy?.nota == null && resenas.google?.nota == null)) return null;
  return (
    <div className={"flex flex-col gap-0.5 " + className}>
      <Nota fuente="Google" datos={resenas.google} claro={claro} />
      <Nota fuente="Booksy" datos={resenas.booksy} claro={claro} />
    </div>
  );
}
