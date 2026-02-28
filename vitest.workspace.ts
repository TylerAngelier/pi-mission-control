import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "packages/control-api/vitest.config.ts",
  "packages/worker/vitest.config.ts",
  "packages/web/vitest.config.ts",
]);
