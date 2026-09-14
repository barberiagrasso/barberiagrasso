import "server-only";
import jwt from "jsonwebtoken";
import { formatearCentimos } from "@/lib/fidelizacion";

// =====================================================================
// Google Wallet real — genera el enlace "Añadir a Google Wallet" para la
// tarjeta de fidelización de un cliente.
//
// Para activarlo, Diego necesita:
//  1. Una cuenta de Google Cloud (gratis) y activar la Google Wallet API
//     en https://console.cloud.google.com.
//  2. Solicitar acceso como "issuer" de Google Wallet en
//     https://pay.google.com/business/console (es gratis, pero Google
//     tiene que aprobar la solicitud — puede tardar unos días).
//  3. Crear una cuenta de servicio (Service Account) en Google Cloud con
//     el rol de Wallet Object Issuer, y descargar su clave en JSON.
//  4. Añadir como variables de entorno en Vercel (nunca subir el JSON
//     al repositorio):
//       GOOGLE_WALLET_ISSUER_ID           (el ID de emisor que da Business Console)
//       GOOGLE_WALLET_SERVICE_ACCOUNT_JSON (el contenido completo del JSON de la cuenta de servicio, tal cual)
//
// En cuanto esas variables existan, esta función funciona sin tocar más
// código: walletGoogleDisponible() (app/perfil/tarjeta/page.tsx) pasa a
// true automáticamente y el botón de la tarjeta se activa.
//
// A diferencia de Apple, aquí no hace falta generar un archivo firmado:
// se manda un JWT firmado con la clave de la cuenta de servicio que
// describe la "clase" (el diseño de la tarjeta, común a todos los
// clientes) y el "objeto" (los datos de ESTE cliente); Google Wallet
// crea o actualiza ambos la primera vez que alguien pulsa el enlace.
// =====================================================================

const ID_CLASE = "fidelizacion_grasso";

export function googleWalletConfigurado(): boolean {
  return Boolean(process.env.GOOGLE_WALLET_ISSUER_ID && process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON);
}

interface CuentaServicioGoogle {
  client_email: string;
  private_key: string;
}

function leerCuentaServicio(): CuentaServicioGoogle {
  return JSON.parse(process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON!);
}

interface DatosTarjetaCliente {
  clienteId: string;
  nombre: string;
  saldoFidelizacionCentimos: number;
}

/**
 * Devuelve la URL "https://pay.google.com/gp/v/save/<jwt>" que, al
 * abrirse en un Android con Google Wallet, añade la tarjeta. Lanza si
 * Google Wallet no está configurado — quien llama
 * (app/api/wallet/google/route.ts) debe comprobar
 * googleWalletConfigurado() antes para devolver un 501 en vez de un error.
 */
export function generarEnlaceGoogleWallet(datos: DatosTarjetaCliente): string {
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID!;
  const cuenta = leerCuentaServicio();
  const classId = `${issuerId}.${ID_CLASE}`;
  const objectId = `${issuerId}.cliente_${datos.clienteId}`;

  const loyaltyClass = {
    id: classId,
    issuerName: "Barbería Grasso",
    programName: "Fidelización Barbería Grasso",
    reviewStatus: "UNDER_REVIEW",
    hexBackgroundColor: "#0b0b0a",
  };

  const loyaltyObject = {
    id: objectId,
    classId,
    state: "ACTIVE",
    accountId: datos.clienteId,
    accountName: datos.nombre,
    loyaltyPoints: {
      label: "Saldo disponible",
      balance: { string: formatearCentimos(datos.saldoFidelizacionCentimos) },
    },
    barcode: { type: "QR_CODE", value: datos.clienteId },
  };

  const payload = {
    iss: cuenta.client_email,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    payload: {
      loyaltyClasses: [loyaltyClass],
      loyaltyObjects: [loyaltyObject],
    },
  };

  const token = jwt.sign(payload, cuenta.private_key, { algorithm: "RS256" });
  return `https://pay.google.com/gp/v/save/${token}`;
}
