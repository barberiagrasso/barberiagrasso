// Nota y nº de reseñas de Booksy y Google de una sede, enlazadas a su
// página para leerlas allí (pedido de Diego, 27/10/2026). No se copian las
// reseñas: solo la nota, con su fuente bien clara. Componente sin estado,
// vale tanto en servidor como en cliente.

interface ResenaExterna {
  url: string | null;
  nota: number | null;
  total: number | null;
}

function Nota({ fuente, datos }: { fuente: string; datos?: ResenaExterna }) {
  if (!datos || datos.nota === null) return null;
  const contenido = (
    <>
      <span className="text-brand-yellow">★ {datos.nota.toLocaleString("es-ES", { minimumFractionDigits: 1 })}</span>
      <span className="text-brand-white-dim">
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
      className="font-body text-xs underline decoration-brand-line underline-offset-4 hover:decoration-brand-yellow"
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
}: {
  resenas?: { booksy?: ResenaExterna; google?: ResenaExterna };
  className?: string;
}) {
  if (!resenas || (resenas.booksy?.nota == null && resenas.google?.nota == null)) return null;
  return (
    <div className={"flex flex-col gap-0.5 " + className}>
      <Nota fuente="Google" datos={resenas.google} />
      <Nota fuente="Booksy" datos={resenas.booksy} />
    </div>
  );
}
