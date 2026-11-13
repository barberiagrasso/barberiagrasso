import Script from "next/script";

// Google Analytics (GA4). No hace nada hasta que exista la cuenta de
// Diego en analytics.google.com y se añada NEXT_PUBLIC_GA_MEASUREMENT_ID
// (el ID de medición, empieza por "G-") en las variables de entorno de
// Vercel — sin esa variable, este componente no renderiza nada (13/11/2026).
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function GoogleAnalytics() {
  if (!GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}');
        `}
      </Script>
    </>
  );
}
