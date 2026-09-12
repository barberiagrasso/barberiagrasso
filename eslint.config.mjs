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
