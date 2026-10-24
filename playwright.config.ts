import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Keep the timing-sensitive startup analysis deterministic. With multiple
  // workers Chromium occasionally lets a test command race the sample snapshot.
  workers: 1,
  use: { baseURL: "http://127.0.0.1:1420", trace: "retain-on-failure" },
  webServer: { command: "npm run dev -- --host 127.0.0.1 --port 1420", url: "http://127.0.0.1:1420", reuseExistingServer: true },
});
