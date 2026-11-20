import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Quién puede ver y tocar el stock de cada sede: el dueño (rol "admin")
// todas; un barbero, solo las sedes de las que es encargado
// (sedes.encargado_stock_admin_id). Si el script de stock aún no se ha
// ejecutado en Supabase, `faltaSql` lo indica y nadie ve nada.
export async function sedesDeStock(admin: { id: string; rol: string }): Promise<{
  sedes: { id: string; nombre: string; encargado_stock_admin_id: string | null }[];
  faltaSql: boolean;
}> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("sedes").select("id, nombre, encargado_stock_admin_id").order("nombre");
  if (error) return { sedes: [], faltaSql: true };
  const todas = (data ?? []) as { id: string; nombre: string; encargado_stock_admin_id: string | null }[];
  return { sedes: admin.rol === "admin" ? todas : todas.filter((s) => s.encargado_stock_admin_id === admin.id), faltaSql: false };
}

/** ¿Es este usuario (barbero) encargado de stock de alguna sede? Para enseñarle "Stock" en el menú. */
export async function esEncargadoDeStock(adminId: string): Promise<boolean> {
  const { count, error } = await createAdminClient()
    .from("sedes")
    .select("id", { count: "exact", head: true })
    .eq("encargado_stock_admin_id", adminId);
  return !error && (count ?? 0) > 0;
}
