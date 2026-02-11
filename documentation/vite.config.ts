import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import fumadocsMdx from "fumadocs-mdx/vite";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

import * as sourceConfig from "./source.config";

const config = defineConfig({
  plugins: [
    devtools(),
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    fumadocsMdx(sourceConfig),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  resolve: {
    alias: {
      "fumadocs-mdx:collections/server": "./.source/server.ts",
      "fumadocs-mdx:collections/browser": "./.source/browser.ts",
      "fumadocs-mdx:collections/dynamic": "./.source/dynamic.ts",
    },
  },
});

export default config;
