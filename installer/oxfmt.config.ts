import { defineConfig } from "oxfmt";

import { fmtBase } from "../oxfmt.config.ts";

export default defineConfig({
  ...fmtBase,
  printWidth: 100,
  experimentalSortPackageJson: {
    sortScripts: true,
  },
  experimentalSortImports: {
    order: "asc",
    newlinesBetween: true,
    internalPattern: ["@/"],
    sortSideEffects: false,
    groups: [
      ["builtin"],
      ["external", "type-external"],
      ["internal", "type-internal"],
      ["parent", "type-parent"],
      ["sibling", "type-sibling"],
      ["index", "type-index"],
      ["unknown"],
    ],
  },
  ignorePatterns: [
    "cloudflare-env.d.ts",
    "worker-configuration.d.ts",
    ".wrangler/",
    "node_modules/",
  ],
});
