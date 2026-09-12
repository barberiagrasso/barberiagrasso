import Link from "next/link";
import { requireAdmin } from "@/lib/adminAuth";
import SignOutButton from "./SignOutButton";

const NAV = [
  { href: "/admin/dashboard", label: "Agenda" },
  { href: "/admin/bloqueos", label: "Vacaciones" },
  { href: "/admin/clientes", label: "Clientes (CRM)" },
  { href: "/admin/conversaciones", label: "WhatsApp" },
];

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const { admin } = await requireAdmin();

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="font-bold text-stone-900">Barbería Grasso</span>
            <nav className="flex gap-4 text-sm text-stone-600">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-amber-800">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm text-stone-500">
            <span>{admin.nombre || "Administrador"}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
