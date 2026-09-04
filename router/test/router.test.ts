import { describe, expect, test } from "bun:test";

import { app, isDocsPath, isInstallerHost, type Env, type ServiceFetcher } from "../src/index";

function stubFetcher(label: string): ServiceFetcher & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    fetch(input: Request | string) {
      const url = typeof input === "string" ? input : input.url;
      calls.push(url);
      return Promise.resolve(new Response(label, { status: 200 }));
    },
  };
}

function env(): Env & {
  API: ReturnType<typeof stubFetcher>;
  DOCS_WORKER: ReturnType<typeof stubFetcher>;
  INSTALLER: ReturnType<typeof stubFetcher>;
} {
  return {
    API: stubFetcher("api"),
    DOCS_WORKER: stubFetcher("docs"),
    INSTALLER: stubFetcher("installer"),
  };
}

async function hit(
  path: string,
  host: string,
  bindings: Env,
): Promise<{ body: string; status: number; env: ReturnType<typeof env> }> {
  const e = bindings as ReturnType<typeof env>;
  const response = await app.fetch(
    new Request(`https://${host}${path}`, { headers: { Host: host } }),
    e,
  );
  return { body: await response.text(), status: response.status, env: e };
}

describe("isInstallerHost", () => {
  test("recognizes platform hosts", () => {
    expect(isInstallerHost("mac.jfa.dev")).toBe(true);
    expect(isInstallerHost("WIN.jfa.dev:443")).toBe(true);
    expect(isInstallerHost("outfitting.jfa.dev")).toBe(false);
  });
});

describe("isDocsPath", () => {
  test("allows docs and static assets", () => {
    expect(isDocsPath("/")).toBe(true);
    expect(isDocsPath("/docs/manager/api")).toBe(true);
    expect(isDocsPath("/fonts/ibm-plex.woff2")).toBe(true);
    expect(isDocsPath("/_astro/x.js")).toBe(true);
  });

  test("rejects api and installer-shaped paths on apex", () => {
    expect(isDocsPath("/api")).toBe(false);
    expect(isDocsPath("/api/lockfiles/x")).toBe(false);
    expect(isDocsPath("/post-install")).toBe(false);
    expect(isDocsPath("/packages/base")).toBe(false);
    expect(isDocsPath("/wp-admin")).toBe(false);
  });
});

describe("router", () => {
  test("forwards installer hosts intact", async () => {
    const bindings = env();
    const { body, status, env: e } = await hit("/post-install", "mac.jfa.dev", bindings);
    expect(status).toBe(200);
    expect(body).toBe("installer");
    expect(e.INSTALLER.calls[0]).toContain("https://mac.jfa.dev/post-install");
    expect(e.API.calls).toHaveLength(0);
    expect(e.DOCS_WORKER.calls).toHaveLength(0);
  });

  test("forwards /fonts on installer host to installer, not docs", async () => {
    const bindings = env();
    const { body, env: e } = await hit("/fonts", "mac.jfa.dev", bindings);
    expect(body).toBe("installer");
    expect(e.INSTALLER.calls).toHaveLength(1);
    expect(e.DOCS_WORKER.calls).toHaveLength(0);
  });

  test("strips /api prefix for the API worker", async () => {
    const bindings = env();
    const { body, env: e } = await hit(
      "/api/lockfiles/machine/kind",
      "outfitting.jfa.dev",
      bindings,
    );
    expect(body).toBe("api");
    expect(e.API.calls[0]).toContain("https://outfitting.jfa.dev/lockfiles/machine/kind");
    expect(e.DOCS_WORKER.calls).toHaveLength(0);
  });

  test("forwards docs paths on apex", async () => {
    const bindings = env();
    const { body, env: e } = await hit("/docs/manager/api", "outfitting.jfa.dev", bindings);
    expect(body).toBe("docs");
    expect(e.DOCS_WORKER.calls).toHaveLength(1);
  });

  test("forwards /fonts on apex to docs (webfonts)", async () => {
    const bindings = env();
    const { body, env: e } = await hit("/fonts/x.woff2", "outfitting.jfa.dev", bindings);
    expect(body).toBe("docs");
    expect(e.INSTALLER.calls).toHaveLength(0);
  });

  test("returns 418 for unknown apex paths", async () => {
    const bindings = env();
    const { status, body, env: e } = await hit("/post-install", "outfitting.jfa.dev", bindings);
    expect(status).toBe(418);
    expect(body).toBe("I'm a teapot");
    expect(e.DOCS_WORKER.calls).toHaveLength(0);
    expect(e.INSTALLER.calls).toHaveLength(0);
  });
});
