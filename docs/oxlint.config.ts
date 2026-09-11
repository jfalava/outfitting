import { defineConfig } from "oxlint";

import base, { agentIgnores, antiSlopJsPlugins } from "../oxlint.config.ts";

// Object spread instead of oxlint `extends`: extends-based inheritance drops
// env/globals/overrides from the parent config.
// No direct `effect` dependency — generic anti-slop only.
export default defineConfig({
  ...base,
  jsPlugins: antiSlopJsPlugins(".."),
  ignorePatterns: [
    ...agentIgnores,
    "*.d.ts",
    "**/*.d.ts",
    "dist/**",
    ".astro/**",
    "**/*.astro",
    "*.mdx",
    "*.md",
    // Astro's compiler owns these .astro-importing barrels; tsgolint cannot
    // resolve their generated module declarations from a standalone TS run.
    "src/components.ts",
    "src/components/**/index.ts",
  ],
  env: { node: true, browser: true, es2022: true },
  globals: {
    Astro: "readonly",
    Fragment: "readonly",
  },
  rules: {
    ...base.rules,
  },
  overrides: [
    {
      // These lifecycle functions coordinate several DOM event sources; keep
      // a guardrail, but allow the orchestration they necessarily require.
      files: ["src/components/ui/search/search.client.ts", "src/components/ui/toc/toc.client.ts"],
      rules: { "max-statements": ["error", 50] },
    },
  ],
});
