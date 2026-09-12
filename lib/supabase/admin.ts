import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente de Supabase con la SERVICE ROLE KEY: se salta por completo las
// políticas RLS. SOLO se debe importar desde código que se ejecuta en el
// servidor (rutas de app/api/..., nunca desde un componente "use client").
// Se usa para las operaciones que hace el propio sistema en nombre del
// cliente final: calcular disponibilidad, crear una cita desde la app o
// desde WhatsApp, registrar un lead nuevo, etc.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  );
}
