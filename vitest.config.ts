import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    test: {
        environment: "node",
        include: ["tests/unit/**/*.test.ts"],
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
            // Ver tests/stubs/server-only.ts
            "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
        },
    },
});
