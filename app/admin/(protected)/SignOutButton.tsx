"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { IconLogOut } from "@/components/ui/Icons";

export default function SignOutButton() {
  const router = useRouter();

  async function cerrarSesion() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      onClick={cerrarSesion}
      title="Cerrar sesión"
      aria-label="Cerrar sesión"
      className="flex h-7 w-7 items-center justify-center rounded-full text-brand-white-dim hover:text-brand-yellow"
    >
      <IconLogOut className="h-4 w-4" />
    </button>
  );
}
