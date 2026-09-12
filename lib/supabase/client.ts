"use client";

import { createBrowserClient } from "@supabase/ssr";

// Cliente de Supabase para usar en componentes de cliente (navegador).
// Usa la clave pública (anon key): solo puede leer lo que las políticas
// RLS permiten a un usuario anónimo (catálogo público) o a un admin
// autenticado (ver supabase/schema.sql).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
