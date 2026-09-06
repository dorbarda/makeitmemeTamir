import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    watch: false,
    testTimeout: 10_000,
  },
  resolve: {
    alias: {
      "@shared": new URL("../shared", import.meta.url).pathname,
    },
  },
});
