import Link from "next/link";
import { requireCliente } from "@/lib/clienteAuth";
import { appleWalletConfigurado } from "@/lib/wallet/appleWallet";
import { googleWalletConfigurado } from "@/lib/wallet/googleWallet";
import TarjetaClient from "./TarjetaClient";
import { createAdminClient } from "@/lib/supabase/admin";
import { fechaCaducidadGrassoCoins } from "@/lib/fidelizacion";
import { JourneyHeader } from "@/components/journey/JourneyHeader";
import { JourneyFooter } from "@/components/journey/JourneyFooter";
import { journeyFontVars } from "@/components/journey/fonts";
import journeyStyles from "@/components/journey/journey.module.css";

export const dynamic = "force-dynamic";

export default async function TarjetaPage() {
  const { cliente } = await requireCliente();
  const caducan =
    (cliente.grassocoins ?? 0) > 0 ? await fechaCaducidadGrassoCoins(createAdminClient(), cliente.id) : null;

  return (
    <div className={`${journeyStyles.journeyPage} ${journeyFontVars}`}>
      <JourneyHeader cliente={{ nombre: cliente.nombre }} />

      <main style={{ padding: "clamp(120px, 18vw, 180px) var(--pad) clamp(90px, 10vw, 140px)" }}>
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

      <JourneyFooter />
    </div>
  );
}
