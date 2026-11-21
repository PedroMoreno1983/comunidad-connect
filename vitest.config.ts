import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    test: {
        environment: "node",
        include: ["tests/unit/**/*.test.ts"],
        // 21-11-2026: con todos los núcleos en paralelo, importar los módulos
        // grandes de CoCo y finanzas superaba los 5 s por defecto y fallaban
        // pruebas distintas en cada corrida (pasan solas). Menos trabajadores y
        // más margen: la suite completa da el mismo resultado siempre.
        testTimeout: 20_000,
        hookTimeout: 20_000,
        maxWorkers: "50%",
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            // Ver tests/stubs/server-only.ts
            "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
        },
    },
});
