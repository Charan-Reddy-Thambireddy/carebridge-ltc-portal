// @ts-check
const { defineConfig, devices } = require("@playwright/test");

const baseURL = process.env.BASE_URL || "http://localhost:5080";

module.exports = defineConfig({
  testDir: ".",
  timeout: 30_000,
  retries: 0, // tests that record decisions change server state, so they are not retried
  reporter: [["list"], ["html", { outputFolder: "../../playwright-report", open: "never" }]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    // Reflow at 320 CSS px (1280px at 400% zoom) is covered by a dedicated test in a11y.spec.js.
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } }
  ],
  // Starts the real ASP.NET Core app (in-memory database, fictional seed data) unless BASE_URL is set.
  webServer: process.env.BASE_URL ? undefined : {
    command: "dotnet run --project ../../src/CareBridge.Api --urls http://localhost:5080",
    url: `${baseURL}/health`,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI
  }
});
