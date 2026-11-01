import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // tsconfig keeps "jsx": "preserve" for Next, so component tests compile JSX here.
  oxc: { jsx: { runtime: "automatic" } },
  test: { include: ["tests/**/*.test.{ts,tsx}"], testTimeout: 60_000, hookTimeout: 180_000, fileParallelism: false },
});
