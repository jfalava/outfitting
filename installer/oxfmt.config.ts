import { defineConfig } from "oxfmt";

import { fmtBase } from "../oxfmt.config.ts";

// Installer-only: wider lines + sorted imports for the Worker source tree.
export default defineConfig({
  ...fmtBase,
  printWidth: 100,
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
});
