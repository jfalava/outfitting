import { defineConfig } from "oxlint";

import { antiSlopJsPlugins, antiSlopRules } from "../oxlint.config.ts";

// Docs: oxlint covers TypeScript only. Astro templates are linted by ESLint
// (eslint-plugin-astro) via lint:astro.
export default defineConfig({
  jsPlugins: antiSlopJsPlugins(".."),
  rules: antiSlopRules,
  ignorePatterns: [
    "**/*.astro",
    "**/*.md",
    "**/*.mdx",
    "**/*.css",
  ],
});
