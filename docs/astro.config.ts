import nimbus, {
  defineConfig as defineNimbusConfig,
} from "@cloudflare/nimbus-docs";
import { tableScroll } from "@cloudflare/nimbus-docs/markdown";
import tailwindcss from "@tailwindcss/vite";
import icon from "astro-icon";
import { defineConfig } from "astro/config";

const nimbusConfig = defineNimbusConfig({
  site: "https://outfitting.jfa.dev",
  title: "Outfitting by JFA",
  description:
    "Command reference, source lifecycle, and platform operations for Outfitting.",
  locale: "en",
  github: "https://github.com/jfalava/outfitting",
  socialImageAlt: "Outfitting by JFA",
  sidebar: {
    items: [
      {
        label: "CLI",
        items: [{ autogenerate: { directory: "docs/cli" } }],
      },
      {
        label: "Source",
        items: [{ autogenerate: { directory: "docs/source" } }],
      },
      {
        label: "Platforms",
        items: [
          {
            label: "Linux",
            items: [
              { autogenerate: { directory: "docs/platforms/linux" } },
            ],
          },
          {
            label: "Windows",
            items: [
              { autogenerate: { directory: "docs/platforms/windows" } },
            ],
          },
          {
            label: "macOS",
            items: [
              { autogenerate: { directory: "docs/platforms/macos" } },
            ],
          },
        ],
      },
    ],
  },
});

export default defineConfig({
  output: "static",
  // Listen on all interfaces so remote development clients can reach the
  // server over Tailscale; localhost access continues to work as usual.
  server: {
    host: "0.0.0.0",
  },
  // Tailwind v4 via its Vite plugin (the integration Astro recommends for
  // Tailwind v4 — replaces the PostCSS plugin, which doesn't build under
  // Astro 7's Vite 8 bundler).
  vite: {
    // Bun hoists workspace packages into the repository-level store
    // (node_modules/.bun). Allow Vite to serve those package assets, including
    // @fontsource font files, when running the docs app from this directory.
    server: {
      fs: {
        allow: [".."],
      },
    },
    plugins: [tailwindcss()],
  },
  // Hover-prefetch link targets so full-page navigations feel instant without
  // a client-side router.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  integrations: [
    icon(),
    nimbus(nimbusConfig, {
      // Authoring rules are opt-in by design — your repo, your taste. The
      // two below are the load-bearing pair: frontmatter has to validate
      // against the content schema for the page to render properly, and
      // broken internal links are 404s for your readers. Add the others
      // (heading hierarchy, code-block language, style, etc.) when you're
      // ready to enforce them — see `nimbus-docs lint --help`.
      rules: {
        "nimbus/frontmatter-shape": "error",
        "nimbus/internal-link": "error",
      },
      // Wrap wide tables so they scroll instead of overflowing the page
      // (styled by `.nb-table-scroll` in src/styles/prose.css).
      markdown: {
        hastPlugins: [tableScroll()],
      },
    }),
  ],
});
