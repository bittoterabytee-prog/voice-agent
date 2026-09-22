import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // PGlite test DB binds a fixed port; DB suites must not run in parallel.
    fileParallelism: false,
  },
});
