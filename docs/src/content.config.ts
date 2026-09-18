import { docsCollection } from "@cloudflare/nimbus-docs/content";
// `z` re-exported from `astro:content` is deprecated; import it from
// `astro/zod` (the pattern nimbus-docs' own schema helpers document).
import { z } from "astro/zod";
import { defineCollection } from "astro:content";

export const collections = {
  docs: defineCollection(
    docsCollection({
      schemaFields: {
        // Nimbus docs are agent-friendly by default. Set `audience` to flag
        // pages written for a particular reader or platform.
        audience: z
          .enum(["human", "windows", "macos", "linux", "nix"])
          .optional(),
      },
    }),
  ),
};
