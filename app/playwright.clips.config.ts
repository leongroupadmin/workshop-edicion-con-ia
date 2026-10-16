import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
// Match the existing panel's dev origin so Next allows hydration scripts.
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: "http://localhost:3000" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
