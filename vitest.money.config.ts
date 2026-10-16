import { defineConfig } from "vitest/config";
import path from "path";

// Flujos de dinero de punta a punta: Postgres real en memoria (PGlite) con
// todas las migraciones y los servicios TypeScript de la app. Sin red ni secretos.
export default defineConfig({
    test: {
        environment: "node",
        include: ["tests/e2e-money/**/*.test.ts"],
        testTimeout: 60_000,
        // La bitácora de operaciones escribe JSON por consola: solo se muestra si un test falla.
        silent: "passed-only",
        hookTimeout: 120_000,
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
        },
    },
});
