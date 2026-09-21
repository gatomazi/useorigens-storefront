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
  },
});
