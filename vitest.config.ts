import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "integrations/**/*.test.ts"],
    env: { GTM_DATA_DIR: ".test-data" },
  },
});
