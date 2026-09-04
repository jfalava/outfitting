import { defineConfig } from "oxlint";

import base, { agentIgnores, antiSlopJsPlugins } from "../oxlint.config.ts";

// Object spread instead of oxlint `extends`: extends-based inheritance drops
// env/globals/overrides from the parent config.
export default defineConfig({
  ...base,
  jsPlugins: antiSlopJsPlugins(".."),
  globals: {
    Bun: "readonly",
  },
  ignorePatterns: [...agentIgnores, "*.d.ts", "**/*.d.ts"],
});
