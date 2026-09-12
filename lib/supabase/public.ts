import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente de solo lectura para Server Components que muestran el
// catálogo público (sedes, servicios) y no necesitan la sesión del
// usuario. Usa la clave pública (anon key): las políticas RLS solo le
// dejan ver filas activas del catálogo (ver supabase/schema.sql).
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
}
