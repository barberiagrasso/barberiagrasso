import Link from "next/link";
import { requireCliente } from "@/lib/clienteAuth";
import { appleWalletConfigurado } from "@/lib/wallet/appleWallet";
import { googleWalletConfigurado } from "@/lib/wallet/googleWallet";
import TarjetaClient from "./TarjetaClient";
import { createAdminClient } from "@/lib/supabase/admin";
import { fechaCaducidadGrassoCoins } from "@/lib/fidelizacion";

export const dynamic = "force-dynamic";

export default async function TarjetaPage() {
  const { cliente } = await requireCliente();
  const caducan =
    (cliente.grassocoins ?? 0) > 0 ? await fechaCaducidadGrassoCoins(createAdminClient(), cliente.id) : null;

  return (
    <main className="min-h-screen bg-brand-black px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-xl">
        <div className="mb-6">
          <Link
            href="/perfil"
            className="font-body text-sm text-brand-white-dim underline decoration-brand-line underline-offset-4 hover:text-brand-yellow"
          >
            ← Mi perfil
          </Link>
        </div>
        <TarjetaClient
          nombre={cliente.nombre}
          grassocoins={cliente.grassocoins ?? 0}
          caducanTexto={
            caducan
              ? caducan.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Madrid" })
              : null
          }
          walletAppleDisponible={appleWalletConfigurado()}
          walletGoogleDisponible={googleWalletConfigurado()}
        />
      </div>
    </main>
  );
}
