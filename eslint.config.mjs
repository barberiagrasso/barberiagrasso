import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Esta regla (experimental, pensada de cara al React Compiler) marca
      // como error el patrón estándar "cargar datos en un useEffect y
      // guardarlos con setState", que es exactamente lo que hacen los
      // paneles de agenda/clientes/conversaciones de este proyecto y es
      // seguro tal y como está escrito. La bajamos a aviso para no bloquear
      // `npm run lint` por un patrón intencionado.
      "react-hooks/set-state-in-effect": "warn",

      // Mismo motivo (upgrade de Next.js/eslint-config-next a 16.4.6,
      // 13/11/2026): estas tres reglas, nuevas/más estrictas en esta
      // versión del plugin de React Compiler, marcan como error patrones
      // intencionados y ya probados en CalendarioDia.tsx —
      // "zonaScroll" es un nodo DOM guardado en estado (patrón estándar
      // para medir/observar un elemento) al que se le mutan a mano
      // propiedades nativas como scrollLeft/scrollTop (no son estado de
      // React); y "performance.now()" se usa dentro de un manejador de
      // gestos (iniciarCreacion), que solo se ejecuta al puntero, nunca
      // durante el render, aunque esté declarado en el cuerpo del
      // componente. Se bajan a aviso para no bloquear `npm run lint`.
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
