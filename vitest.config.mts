import { defineConfig } from "vitest/config";
import path from "node:path";

const aqui = import.meta.dirname;

// Pruebas unitarias sobre la lógica pura de lib/ (identidad de cliente,
// reglas de cancelación, cálculo de segmento para HubSpot...). No
// levantan Next.js ni tocan Supabase de verdad — ver test/stubs/ y los
// mocks en cada archivo de test para lo que sí hace falta simular.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    alias: [
      // "server-only" lanza un error fuera de Next.js; en pruebas no hace falta.
      { find: "server-only", replacement: path.resolve(aqui, "test/stubs/server-only.ts") },
      // Mismo alias "@/..." que usa el resto del proyecto (ver tsconfig.json).
      { find: "@", replacement: path.resolve(aqui) },
    ],
  },
});
