import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    restoreMocks: true,
    env: {
      NODE_ENV: "test",
      PORT: "3000",
      LOG_LEVEL: "silent",
    },
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
