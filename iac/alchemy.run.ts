import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";

import { defineManagedSecrets } from "./src/secrets";

/** Existing account Secrets Store (provider always adopts; never deleted). */
export const SharedSecretsStore = Cloudflare.SecretsStore.Store("SharedSecretsStore");

const API_SECRET_NAMES = ["OUTFITTING_LOCKFILES_TOKEN"] as const;

const debugObservability = {
  enabled: true,
  headSamplingRate: 1,
  logs: {
    enabled: true,
    invocationLogs: true,
    headSamplingRate: 1,
    persist: true,
  },
  traces: {
    enabled: true,
    headSamplingRate: 1,
    persist: true,
  },
} as const;

const compatibility = {
  date: "2026-08-20",
  flags: ["nodejs_compat" as const],
};

/** Existing lockfiles KV namespace (title match; deploy with --adopt). */
export const OutfittingApiKv = Cloudflare.KV.Namespace("OutfittingApiKv", {
  title: "outfitting-lockfiles",
});

/** Existing D1 database + migrations from the api package. */
export const OutfittingApiDb = Cloudflare.D1.Database("OutfittingApiDb", {
  name: "outfitting-lockfiles",
  migrations: "../api/migrations",
});

/** Existing private fonts R2 bucket. */
export const OutfittingPrivateFonts = Cloudflare.R2.Bucket("OutfittingPrivateFonts", {
  name: "outfitting-private-fonts",
});

export const OutfittingApi = Cloudflare.Worker("OutfittingApi", {
  name: "outfitting-api",
  main: "../api/src/index.ts",
  workersDev: false,
  observability: debugObservability,
  compatibility,
  env: {
    LOCKFILES: OutfittingApiKv,
    DB: OutfittingApiDb,
  },
});

export const OutfittingDocsAssets = Cloudflare.Website.StaticSite("OutfittingDocsAssets", {
  name: "outfitting-docs-assets",
  cwd: "../docs",
  command: "bash ./scripts/build-cf.sh",
  outdir: "dist",
  workersDev: false,
  compatibility,
  assets: { notFoundHandling: "404-page" },
});

export const OutfittingDocs = Cloudflare.Worker("OutfittingDocs", {
  name: "outfitting-docs",
  main: "../docs/src/worker.ts",
  workersDev: false,
  observability: debugObservability,
  compatibility,
  env: {
    DOCS_ASSETS: OutfittingDocsAssets,
  },
});

export const OutfittingInstaller = Cloudflare.Worker("OutfittingInstaller", {
  name: "outfitting-installer",
  main: "../installer/src/index.ts",
  workersDev: false,
  observability: debugObservability,
  compatibility: {
    date: "2026-01-01",
    flags: ["nodejs_compat" as const],
  },
  placement: { mode: "smart" },
  env: {
    PRIVATE_FONTS: OutfittingPrivateFonts,
  },
});

export const OutfittingRouter = Cloudflare.Worker("OutfittingRouter", {
  name: "outfitting-router",
  main: "../router/src/index.ts",
  domain: {
    name: "outfitting.jfa.dev",
    aliases: ["win.jfa.dev", "wsl.jfa.dev", "mac.jfa.dev", "nixos.jfa.dev"],
  },
  workersDev: false,
  observability: debugObservability,
  compatibility,
  env: {
    API: OutfittingApi,
    DOCS_WORKER: OutfittingDocs,
    INSTALLER: OutfittingInstaller,
  },
});

export default Alchemy.Stack(
  "Outfitting",
  {
    providers: Cloudflare.providers(),
    state: Cloudflare.state(),
  },
  Effect.gen(function* () {
    const sharedSecretsStore = yield* SharedSecretsStore;
    const api = yield* OutfittingApi;

    yield* defineManagedSecrets(sharedSecretsStore, API_SECRET_NAMES);
    yield* api.bind("ApiSecretsStoreBindings", {
      bindings: API_SECRET_NAMES.map((secretName) => ({
        type: "secrets_store_secret" as const,
        name: secretName,
        secretName,
        storeId: sharedSecretsStore.storeId,
      })),
    });

    yield* OutfittingInstaller;
    yield* OutfittingDocs;
    const router = yield* OutfittingRouter;

    return {
      url: router.url,
      routerUrl: router.url,
      apiUrl: Output.interpolate`${router.url}/api`,
      docsUrl: router.url,
      installerHosts: ["win.jfa.dev", "wsl.jfa.dev", "mac.jfa.dev", "nixos.jfa.dev"],
    };
  }),
);
