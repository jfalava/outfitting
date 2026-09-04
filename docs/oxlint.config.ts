import { defineConfig } from "oxlint";

import { antiSlopJsPlugins, antiSlopRules } from "../oxlint.config.ts";

// Docs are Astro + MDX, so they deliberately skip the strict application
// base (type-aware built-ins) and lint only the vendored anti-slop rules.
export default defineConfig({
  jsPlugins: antiSlopJsPlugins(".."),
  rules: antiSlopRules,
});
