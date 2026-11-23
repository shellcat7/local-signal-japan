import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
// ブラウザを別途用意している環境では、その実行ファイルを指定できる。
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    locale: "ja-JP",
    trace: "off",
    launchOptions: executablePath ? { executablePath } : {}
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } }
  ],
  webServer: {
    // 本番と同じビルド成果物に対して検証する。
    command: "pnpm build && pnpm preview",
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
