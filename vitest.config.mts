import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    restoreMocks: true,
    env: {
      NODE_ENV: "test",
      APP_ENV: "test",
      APP_NAME: "voice-agent",
      APP_PORT: "3000",
      PORT: "3000",
      LOG_LEVEL: "silent",
      // Force isolated PGlite for DB suites; do not reuse a shared Docker DATABASE_URL.
      DATABASE_URL: "",
    },
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
