import { defineConfig } from "oxlint";

import base, { agentIgnores, antiSlopJsPlugins } from "../oxlint.config.ts";

// Object spread instead of oxlint `extends`: extends-based inheritance drops
// env/globals/overrides from the parent config.
export default defineConfig({
  ...base,
  jsPlugins: antiSlopJsPlugins(".."),
  env: {
    browser: true,
    es2022: true,
  },
  ignorePatterns: [...agentIgnores, "worker-configuration.d.ts", "**/*.d.ts"],
  rules: {
    ...base.rules,
    "max-params": ["error", 5],
    "max-statements": ["error", 40],
  },
});
