import { defineConfig } from "oxlint";

import base, { agentIgnores, antiSlopJsPlugins } from "../oxlint.config.ts";

// Object spread instead of oxlint `extends`: extends-based inheritance drops
// env/globals/overrides from the parent config.
export default defineConfig({
  ...base,
  jsPlugins: antiSlopJsPlugins(".."),
  env: {
    browser: true,
    es2024: true,
    node: true,
  },
  globals: {
    Bun: "readonly",
  },
  ignorePatterns: [...agentIgnores, "*.d.ts", "**/*.d.ts", "test/**"],
  rules: {
    ...base.rules,
    "no-console": "off",
    complexity: ["error", 12],
    "max-depth": ["error", 4],
    "max-statements": ["error", 40],
  },
});
