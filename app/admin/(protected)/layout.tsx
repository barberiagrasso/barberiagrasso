import { requireAdmin } from "@/lib/adminAuth";
import { GrassoMark } from "@/components/brand/GrassoMark";
import AdminNav from "./AdminNav";
import SignOutButton from "./SignOutButton";

export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const { admin } = await requireAdmin();

  return (
    <div className="min-h-screen bg-stone-50">
      <header className="border-b border-black/10 bg-brand-black">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <GrassoMark className="h-6 w-6 text-brand-yellow" />
              <span className="font-heading text-lg italic text-brand-white">Barbería Grasso</span>
            </div>
            <AdminNav />
          </div>
          <div className="flex items-center gap-3 font-body text-sm text-brand-white-dim">
            <span>{admin.nombre || "Administrador"}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
