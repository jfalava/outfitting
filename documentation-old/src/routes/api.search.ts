import { createFileRoute } from "@tanstack/react-router";
import { createFromSource } from "fumadocs-core/search/server";
import { loader } from "fumadocs-core/source";
import { docs } from "fumadocs-mdx:collections/server";

const source = loader(docs.toFumadocsSource(), {
  baseUrl: "/docs",
});

const search = createFromSource(source);

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      GET: ({ request }) => search.GET(request),
    },
  },
});
