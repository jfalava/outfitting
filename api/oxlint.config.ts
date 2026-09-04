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
  },
  ignorePatterns: [...agentIgnores, "*.d.ts", "**/*.d.ts"],
  rules: {
    ...base.rules,
    complexity: ["error", 6],
    "max-depth": ["error", 2],
    "max-statements": ["error", 12],
  },
  overrides: [
    {
      files: ["test/**/*.ts"],
      rules: {
        complexity: "off",
        "max-depth": "off",
        "max-statements": "off",
      },
    },
  ],
});
