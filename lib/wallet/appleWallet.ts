import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { PKPass } from "passkit-generator";
import { formatearCentimos } from "@/lib/fidelizacion";

// =====================================================================
// Apple Wallet real — generación de un .pkpass firmado con las
// credenciales de una cuenta de Apple Developer.
//
// Para activarlo, Diego necesita:
//  1. Una cuenta de Apple Developer (de pago, ~99$/año) en
//     https://developer.apple.com.
//  2. Crear un "Pass Type Identifier" (Certificates, IDs & Profiles →
//     Identifiers → Pass Type IDs) y su certificado asociado.
//  3. Descargar ese certificado (.cer), pasarlo a .p12 desde el llavero
//     de un Mac, y con openssl separarlo en el certificado y la clave
//     privada en formato .pem (la guía completa está en el wiki de
//     passkit-generator: busca "Generating Certificates").
//  4. Descargar el certificado intermedio WWDR de Apple.
//  5. Codificar los tres archivos (.pem del certificado, .pem de la
//     clave, y el WWDR) en base64 y añadirlos como variables de entorno
//     en Vercel (nunca subirlos al repositorio):
//       APPLE_WALLET_TEAM_ID           (Team ID de la cuenta de Apple)
//       APPLE_WALLET_PASS_TYPE_ID      (p. ej. "pass.es.barberiagrasso.fidelizacion")
//       APPLE_WALLET_CERT_BASE64       (certificado del Pass Type, en PEM, en base64)
//       APPLE_WALLET_KEY_BASE64        (clave privada, en PEM, en base64)
//       APPLE_WALLET_KEY_PASSPHRASE    (frase de la clave, si se le puso una — opcional)
//       APPLE_WALLET_WWDR_BASE64       (certificado WWDR de Apple, en base64)
//
// En cuanto esas variables existan, esta función funciona sin tocar más
// código: walletAppleDisponible() (app/perfil/tarjeta/page.tsx) pasa a
// true automáticamente y el botón de la tarjeta se activa.
// =====================================================================

export function appleWalletConfigurado(): boolean {
  return Boolean(
    process.env.APPLE_WALLET_TEAM_ID &&
      process.env.APPLE_WALLET_PASS_TYPE_ID &&
      process.env.APPLE_WALLET_CERT_BASE64 &&
      process.env.APPLE_WALLET_KEY_BASE64 &&
      process.env.APPLE_WALLET_WWDR_BASE64
  );
}

interface DatosTarjetaCliente {
  clienteId: string;
  nombre: string;
  saldoFidelizacionCentimos: number;
}

async function leerAssetApple(nombre: string): Promise<Buffer> {
  // Los iconos y el logo en public/wallet/apple/ se generaron a partir de
  // la marca ya existente (app/icon.png para el icon.png cuadrado,
  // public/brand/grasso-logo.png para el logo con texto), reescalados a
  // los tamaños @1x/@2x/@3x que pide Apple. Si el logo cambia, basta con
  // regenerar esos 6 archivos con el mismo redimensionado y sustituirlos.
  return fs.readFile(path.join(process.cwd(), "public", "wallet", "apple", nombre));
}

/**
 * Genera el .pkpass (firmado) de la tarjeta de fidelización de un
 * cliente concreto. Lanza si Apple Wallet no está configurado — quien
 * llama (app/api/wallet/apple/route.ts) debe comprobar
 * appleWalletConfigurado() antes para devolver un 501 en vez de un error.
 */
export async function generarPaseApple(datos: DatosTarjetaCliente): Promise<Buffer> {
  const [icon, icon2x, icon3x, logo, logo2x, logo3x] = await Promise.all([
    leerAssetApple("icon.png"),
    leerAssetApple("icon@2x.png"),
    leerAssetApple("icon@3x.png"),
    leerAssetApple("logo.png"),
    leerAssetApple("logo@2x.png"),
    leerAssetApple("logo@3x.png"),
  ]);

  const passJson = {
    formatVersion: 1,
    passTypeIdentifier: process.env.APPLE_WALLET_PASS_TYPE_ID,
    teamIdentifier: process.env.APPLE_WALLET_TEAM_ID,
    organizationName: "Barbería Grasso",
    description: "Tarjeta de fidelización de Barbería Grasso",
    serialNumber: datos.clienteId,
    backgroundColor: "rgb(11, 11, 10)",
    foregroundColor: "rgb(245, 241, 230)",
    labelColor: "rgb(242, 211, 104)",
    storeCard: {
      primaryFields: [{ key: "saldo", label: "SALDO DISPONIBLE", value: formatearCentimos(datos.saldoFidelizacionCentimos) }],
      secondaryFields: [{ key: "nombre", label: "CLIENTE", value: datos.nombre }],
      backFields: [
        {
          key: "info",
          label: "Cómo funciona",
          value:
            "Acumulas un 10% de lo que gastas en cada cita en Barbería Grasso (Los Molinos y Avenida de las Ciudades). Puedes canjearlo por cualquier servicio cuando el saldo cubra el total.",
        },
      ],
    },
  };

  const pass = new PKPass(
    {
      "icon.png": icon,
      "icon@2x.png": icon2x,
      "icon@3x.png": icon3x,
      "logo.png": logo,
      "logo@2x.png": logo2x,
      "logo@3x.png": logo3x,
      "pass.json": Buffer.from(JSON.stringify(passJson)),
    },
    {
      wwdr: Buffer.from(process.env.APPLE_WALLET_WWDR_BASE64!, "base64"),
      signerCert: Buffer.from(process.env.APPLE_WALLET_CERT_BASE64!, "base64"),
      signerKey: Buffer.from(process.env.APPLE_WALLET_KEY_BASE64!, "base64"),
      signerKeyPassphrase: process.env.APPLE_WALLET_KEY_PASSPHRASE || undefined,
    }
  );

  return pass.getAsBuffer();
}
