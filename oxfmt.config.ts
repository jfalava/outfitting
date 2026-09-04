import { defineConfig, type OxfmtConfig } from "oxfmt";

// Shared formatting options; workspace configs re-export these with their own
// ignorePatterns and package.json sorting.
export const fmtBase: OxfmtConfig = {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  endOfLine: "lf",
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  insertFinalNewline: true,
};

// Repo root only formats top-level files; each workspace formats itself.
export default defineConfig({
  ...fmtBase,
  experimentalSortPackageJson: {
    sortScripts: true,
  },
  ignorePatterns: [
    "api/**",
    "cli/**",
    "docs/**",
    "iac/**",
    "installer/**",
    "node_modules/**",
    "router/**",
  ],
});
