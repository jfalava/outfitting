import { defineConfig, type OxfmtConfig } from "oxfmt";

// Shared formatting options for the whole repo. Package configs only exist
// when they need overrides on top of this base (e.g. installer import sort).
export const fmtBase: OxfmtConfig = {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  endOfLine: "lf",
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  insertFinalNewline: true,
  experimentalSortPackageJson: {
    sortScripts: true,
  },
};

export default defineConfig({
  ...fmtBase,
  ignorePatterns: [
    // Nested package oxfmt.config.ts files still apply via nested discovery;
    // these are paths oxfmt should never touch from any config.
    "**/node_modules/**",
    "**/dist/**",
    "**/.wrangler/**",
    "**/worker-configuration.d.ts",
    "**/cloudflare-env.d.ts",
    // Docs stay on Prettier (Astro).
    "docs/**",
    "result/**",
    "tools/**",
  ],
});
