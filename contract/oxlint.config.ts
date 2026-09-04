import { defineConfig } from "oxlint";

import base, { agentIgnores, antiSlopJsPlugins } from "../oxlint.config.ts";

// Object spread instead of oxlint `extends`: extends-based inheritance drops
// env/globals/overrides from the parent config.
export default defineConfig({
  ...base,
  jsPlugins: antiSlopJsPlugins(".."),
  env: {
    es2024: true,
    node: true,
  },
  globals: {
    console: "readonly",
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
      // JSON boundary predicates are the only place `unknown`/`typeof` are allowed.
      files: ["src/json.ts"],
      rules: {
        "anti-slop/no-unknown-parameters": "off",
        "anti-slop/no-runtime-typeof": "off",
        complexity: "off",
      },
    },
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
