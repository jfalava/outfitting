import { defineConfig } from "oxfmt";

import { fmtBase } from "../oxfmt.config.ts";

export default defineConfig({
  ...fmtBase,
  experimentalSortPackageJson: {
    sortScripts: true,
  },
  ignorePatterns: ["node_modules/**"],
});
