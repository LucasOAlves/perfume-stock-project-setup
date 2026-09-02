import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 30000,
    // Integration test files share one PostgreSQL instance and TRUNCATE the whole
    // schema between tests (see test/integration/setup.ts). Running files in parallel
    // causes cross-file deadlocks and state wipes mid-test. Keep this serial rather
    // than trying to make TRUNCATE-based resets safe under concurrency.
    fileParallelism: false
  }
});
