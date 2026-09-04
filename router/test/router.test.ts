import { describe, expect, test } from "vitest";

import { app, type Env, type ServiceFetcher } from "../src/index";

type Stub = ServiceFetcher & { calls: string[] };

function stubFetcher(label: string): Stub {
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

function bindings(options?: { docs?: boolean }): Env & {
  API: Stub;
  DOCS_WORKER?: Stub;
  INSTALLER: Stub;
} {
  const env: Env & { API: Stub; DOCS_WORKER?: Stub; INSTALLER: Stub } = {
    API: stubFetcher("api"),
    INSTALLER: stubFetcher("installer"),
  };
  if (options?.docs !== false) {
    env.DOCS_WORKER = stubFetcher("docs");
  }
  return env;
}

async function hit(path: string, host: string, env: Env) {
  const response = await app.fetch(
    new Request(`https://${host}${path}`, { headers: { Host: host } }),
    env,
  );
  return {
    body: await response.text(),
    status: response.status,
  };
}

describe("router dispatch", () => {
  test("installer host keeps path and never touches API or docs", async () => {
    const env = bindings();
    const { body, status } = await hit("/post-install", "mac.jfa.dev", env);

    expect(status).toBe(200);
    expect(body).toBe("installer");
    expect(env.INSTALLER.calls).toEqual(["https://mac.jfa.dev/post-install"]);
    expect(env.API.calls).toEqual([]);
    expect(env.DOCS_WORKER?.calls ?? []).toEqual([]);
  });

  test("same path /fonts goes to installer on platform host and docs on apex", async () => {
    const installerEnv = bindings();
    const apexEnv = bindings();

    const installer = await hit("/fonts", "mac.jfa.dev", installerEnv);
    const apex = await hit("/fonts/x.woff2", "outfitting.jfa.dev", apexEnv);

    expect(installer.body).toBe("installer");
    expect(installerEnv.INSTALLER.calls).toHaveLength(1);
    expect(installerEnv.DOCS_WORKER?.calls ?? []).toEqual([]);

    expect(apex.body).toBe("docs");
    expect(apexEnv.DOCS_WORKER?.calls).toHaveLength(1);
    expect(apexEnv.INSTALLER.calls).toEqual([]);
  });

  test("strips /api before forwarding to the API worker", async () => {
    const env = bindings();
    const { body } = await hit("/api/lockfiles/machine/kind", "outfitting.jfa.dev", env);

    expect(body).toBe("api");
    expect(env.API.calls).toEqual(["https://outfitting.jfa.dev/lockfiles/machine/kind"]);
    expect(env.DOCS_WORKER?.calls ?? []).toEqual([]);
    expect(env.INSTALLER.calls).toEqual([]);
  });

  test("apex docs path reaches docs worker only", async () => {
    const env = bindings();
    const { body, status } = await hit("/docs/manager/api", "outfitting.jfa.dev", env);

    expect(status).toBe(200);
    expect(body).toBe("docs");
    expect(env.DOCS_WORKER?.calls).toEqual(["https://outfitting.jfa.dev/docs/manager/api"]);
    expect(env.API.calls).toEqual([]);
  });

  test("docs path returns 404 when docs worker is unbound", async () => {
    const env = bindings({ docs: false });
    const { body, status } = await hit("/docs/manager/api", "outfitting.jfa.dev", env);

    expect(status).toBe(404);
    expect(body).toContain("Not found");
    expect(env.API.calls).toEqual([]);
    expect(env.INSTALLER.calls).toEqual([]);
  });

  test("unknown apex path is 418 without any service hop", async () => {
    const env = bindings();
    const { body, status } = await hit("/post-install", "outfitting.jfa.dev", env);

    expect(status).toBe(418);
    expect(body).toBe("I'm a teapot");
    expect(env.DOCS_WORKER?.calls ?? []).toEqual([]);
    expect(env.API.calls).toEqual([]);
    expect(env.INSTALLER.calls).toEqual([]);
  });

  test("Host port and case still select the installer", async () => {
    const env = bindings();
    const { body } = await hit("/", "WIN.jfa.dev:443", env);

    expect(body).toBe("installer");
    expect(env.INSTALLER.calls).toHaveLength(1);
  });
});
