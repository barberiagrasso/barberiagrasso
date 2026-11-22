import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/adminAuth";
import { pendientesAbiertos } from "@/lib/pendientes";

export const dynamic = "force-dynamic";

// Tareas técnicas importantes que quedan por hacer (para Diego).
export default async function PendientesPage() {
  const { admin } = await requireAdmin();
  if (admin.rol !== "admin") redirect("/admin/dashboard");
  const lista = await pendientesAbiertos();
  return (
    <div>
      <h1 className="mb-1 text-xl font-bold text-stone-900">Pendientes importantes</h1>
      <p className="mb-4 text-sm text-stone-500">
        Tareas que necesitan acceso a Supabase, Vercel, Meta o GitHub. Las urgentes primero. Lista completa en{" "}
        <code>docs/PENDIENTES.md</code>.
      </p>
      {lista.length === 0 ? (
        <p className="rounded-xl bg-emerald-50 p-4 text-emerald-800">✅ No queda nada pendiente.</p>
      ) : (
        <ol className="space-y-3">
          {lista.map((p, i) => (
            <li
              key={p.id}
              className={
                "rounded-2xl border bg-white p-4 " + (p.prioridad === "urgente" ? "border-red-300" : "border-stone-200")
              }
            >
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-stone-500">
                {i + 1}.{" "}
                <span className={p.prioridad === "urgente" ? "text-red-700" : "text-amber-700"}>
                  {p.prioridad === "urgente" ? "Urgente" : "Importante"}
                </span>
              </p>
              <p className="font-semibold text-stone-900">{p.titulo}</p>
              <p className="mt-1 text-sm text-stone-700">
                <b>Por qué:</b> {p.porQue}
              </p>
              <p className="mt-1 text-sm text-stone-700">
                <b>Cómo:</b> {p.como}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
