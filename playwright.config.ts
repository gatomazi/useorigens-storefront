import { defineConfig } from "@playwright/test";

const port = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: 0,
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: `npm run dev -- -p ${port}`,
    url: `http://localhost:${port}/sul`,
    reuseExistingServer: true,
    timeout: 120_000,
    // Real (non-secret) production IDs, so tests exercise the actual consent-gated load path for both
    // providers instead of the trivially-null "no env var" case. Every test that grants consent still mocks
    // `window.fbq`/`window.gtag` (or blocks the connect.facebook.net/googletagmanager.com requests as a
    // second safety net) before it does, so this never causes a real event to reach either provider —
    // CLAUDE_ADENDO_4_EVENTOS_META_STOREFRONT.md/CLAUDE_GA4_STOREFRONT_TRACKING.md §15: "nunca disparar
    // eventos reais de produção em testes automatizados".
    env: { NEXT_PUBLIC_META_PIXEL_ID: "1558923262073052", NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-8GYTEJ1F77" },
  },
});
