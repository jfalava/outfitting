import { fileURLToPath } from "node:url";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import fumadocsMdx from "fumadocs-mdx/vite";
import { defineConfig } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";

import * as sourceConfig from "./source.config";

const config = defineConfig({
  plugins: [
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
      "fumadocs-mdx:collections/server": fileURLToPath(
        new URL("./.source/server.ts", import.meta.url),
      ),
      "fumadocs-mdx:collections/browser": fileURLToPath(
        new URL("./.source/browser.ts", import.meta.url),
      ),
      "fumadocs-mdx:collections/dynamic": fileURLToPath(
        new URL("./.source/dynamic.ts", import.meta.url),
      ),
    },
  },
});

export default config;
