import { createFileRoute, notFound } from "@tanstack/react-router";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { DocsBody, DocsPage } from "fumadocs-ui/page";
import { useEffect, useState } from "react";

import { docsTree } from "@/lib/docs-tree";
import { baseOptions } from "@/lib/layout.shared";

const docModules: Record<string, () => Promise<typeof import("*.mdx")>> = {
  "": () => import("../../../content/docs/index.mdx"),
  index: () => import("../../../content/docs/index.mdx"),
  "installer-guide": () => import("../../../content/docs/installer-guide.mdx"),
  windows: () => import("../../../content/docs/windows.mdx"),
  "wsl-linux": () => import("../../../content/docs/wsl-linux.mdx"),
  macos: () => import("../../../content/docs/macos.mdx"),
  "repository-configuration": () => import("../../../content/docs/repository-configuration.mdx"),
  updates: () => import("../../../content/docs/updates.mdx"),
};

function normalizeSlug(rawSlug?: string) {
  if (!rawSlug) {
    return "";
  }

  const normalized = rawSlug.replace(/^\/+|\/+$/g, "");
  return normalized.replace(/\/index$/, "");
}

export const Route = createFileRoute("/docs/$")({
  component: DocsPageComponent,
  notFoundComponent: () => (
    <DocsLayout tree={docsTree} {...baseOptions()}>
      <DocsPage toc={[]} full={false}>
        <DocsBody>
          <p className="p-4 text-sm text-neutral-500">
            Page not found. Choose a page from the docs navigation.
          </p>
        </DocsBody>
      </DocsPage>
    </DocsLayout>
  ),
  loader: async ({ params }) => {
    const slug = normalizeSlug(params._splat);
    const docModule = docModules[slug];

    if (!docModule) {
      throw notFound();
    }

    await docModule();

    return { slug };
  },
  staleTime: 0,
});

function DocsPageComponent() {
  const params = Route.useParams();
  const slug = normalizeSlug(params._splat);

  const [MDXContent, setMDXContent] = useState<React.ComponentType<{
    components?: Record<string, React.ComponentType<Record<string, unknown>>>;
  }> | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    setMDXContent(null);

    const loadModule = async () => {
      const docModule = docModules[slug];
      if (!docModule) {
        throw notFound();
      }
      const module = await docModule();
      setMDXContent(() => module.default);
      setIsLoading(false);
    };

    loadModule().catch(() => {
      setIsLoading(false);
      setMDXContent(null);
    });
  }, [slug]);

  if (isLoading) {
    return (
      <DocsLayout tree={docsTree} {...baseOptions()}>
        <DocsPage toc={[]} full={false}>
          <DocsBody>
            <div className="p-4">Loading...</div>
          </DocsBody>
        </DocsPage>
      </DocsLayout>
    );
  }

  if (!MDXContent) {
    throw notFound();
  }

  return (
    <DocsLayout tree={docsTree} {...baseOptions()}>
      <DocsPage toc={[]} full={false}>
        <DocsBody>
          <MDXContent
            components={
              defaultMdxComponents as unknown as Record<
                string,
                React.ComponentType<Record<string, unknown>>
              >
            }
          />
        </DocsBody>
      </DocsPage>
    </DocsLayout>
  );
}
