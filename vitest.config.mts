import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Server-only guards are irrelevant for unit tests of pure modules.
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  // tests/integration run the repository SQL against a real PostgreSQL engine (PGlite, in-process, in-memory): slower to start, no server needed.
  test: { include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"], environment: "node", testTimeout: 60_000, hookTimeout: 120_000 },
});
