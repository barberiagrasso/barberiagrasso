import Link from "next/link";
import { requireCliente } from "@/lib/clienteAuth";
import { appleWalletConfigurado } from "@/lib/wallet/appleWallet";
import { googleWalletConfigurado } from "@/lib/wallet/googleWallet";
import TarjetaClient from "./TarjetaClient";

export const dynamic = "force-dynamic";

export default async function TarjetaPage() {
  const { cliente } = await requireCliente();

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
          saldoFidelizacionCentimos={cliente.saldo_fidelizacion_centimos ?? 0}
          walletAppleDisponible={appleWalletConfigurado()}
          walletGoogleDisponible={googleWalletConfigurado()}
        />
      </div>
    </main>
  );
}
