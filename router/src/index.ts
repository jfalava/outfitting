import { Hono, type Handler } from "hono";

/** Minimal fetcher shape so unit tests need no Cloudflare runtime types. */
export type ServiceFetcher = {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
};

export interface Env {
  API: ServiceFetcher;
  /** Absent when provision/deploy skips docs (`docs: false` / `--no-docs`). */
  DOCS_WORKER?: ServiceFetcher;
  INSTALLER: ServiceFetcher;
}

type App = { Bindings: Env };

const INSTALLER_HOSTS = new Set(["win.jfa.dev", "wsl.jfa.dev", "mac.jfa.dev", "nixos.jfa.dev"]);

const forwardStripped =
  (prefix: string, binding: "API"): Handler<App> =>
  async (c) => {
    const url = new URL(c.req.raw.url);
    url.pathname = url.pathname.slice(prefix.length) || "/";
    return c.env[binding].fetch(new Request(url, c.req.raw));
  };

/**
 * Explicit docs allowlist (manifold pattern).
 * Unknown apex paths return 418 before any service-binding hop.
 * Keep in sync with docs content top-level sections + static build outputs.
 */
const DOCS_EXACT_PATHS = new Set([
  "/",
  "/index.md",
  "/index.mdx",
  "/404",
  "/404.html",
  "/llms.txt",
  "/llms-full.txt",
  "/robots.txt",
  "/og.png",
  "/favicon.ico",
  "/favicon-16x16.png",
  "/favicon-32x32.png",
  "/apple-touch-icon.png",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
  "/site.webmanifest",
  "/sitemap-0.xml",
  "/sitemap-index.xml",
]);

const DOCS_PREFIXES = ["/docs", "/og", "/_astro", "/_nimbus", "/pagefind", "/fonts"] as const;

export function isDocsPath(pathname: string): boolean {
  if (DOCS_EXACT_PATHS.has(pathname)) {
    return true;
  }

  for (const prefix of DOCS_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return true;
    }
  }

  return false;
}

export function isInstallerHost(host: string): boolean {
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";
  return INSTALLER_HOSTS.has(hostname);
}

const forwardDocs: Handler<App> = async (c) => {
  const pathname = new URL(c.req.url).pathname;
  if (!isDocsPath(pathname)) {
    return c.text("I'm a teapot", 418);
  }
  const docs = c.env.DOCS_WORKER;
  if (docs === undefined) {
    return c.json({ error: "Not found" }, 404);
  }
  return docs.fetch(c.req.raw);
};

const app = new Hono<App>();

// Installer platform hosts first — path space collides with docs on apex
// (/fonts, /post-install) so host dispatch is the only safe boundary.
app.use("*", async (c, next) => {
  const host = c.req.header("Host") ?? "";
  if (isInstallerHost(host)) {
    return c.env.INSTALLER.fetch(c.req.raw);
  }
  return next();
});

app
  .all("/api", forwardStripped("/api", "API"))
  .all("/api/*", forwardStripped("/api", "API"))
  .all("*", forwardDocs);

export { app };
export default app;
