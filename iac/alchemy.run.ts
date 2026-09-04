import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import * as Effect from "effect/Effect";

import {
  apiName,
  databaseName,
  deployConfig,
  deployDocs,
  deployDomain,
  docsAssetsName,
  docsWorkerName,
  installerHosts,
  installerName,
  kvTitle,
  privateFontsBucket,
  routerName,
  stackName,
} from "./src/config";
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
  title: kvTitle,
});

/** Existing D1 database + migrations from the api package. */
export const OutfittingApiDb = Cloudflare.D1.Database("OutfittingApiDb", {
  name: databaseName,
  migrations: "../api/migrations",
});

/** Existing private fonts R2 bucket. */
export const OutfittingPrivateFonts = Cloudflare.R2.Bucket("OutfittingPrivateFonts", {
  name: privateFontsBucket,
});

export const OutfittingApi = Cloudflare.Worker("OutfittingApi", {
  name: apiName,
  main: "../api/src/index.ts",
  workersDev: false,
  observability: debugObservability,
  compatibility,
  env: {
    LOCKFILES: OutfittingApiKv,
    DB: OutfittingApiDb,
  },
});

export const OutfittingInstaller = Cloudflare.Worker("OutfittingInstaller", {
  name: installerName,
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

export default Alchemy.Stack(
  stackName,
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

    const installer = yield* OutfittingInstaller;

    // Docs only when deployDocs is true (skip with docs:false / --no-docs / OUTFITTING_DEPLOY_DOCS=0).
    const docsWorker = deployDocs
      ? yield* Effect.gen(function* () {
          const docsAssets = yield* Cloudflare.Website.StaticSite("OutfittingDocsAssets", {
            name: docsAssetsName,
            cwd: "../docs",
            command: "bash ./scripts/build-cf.sh",
            outdir: "dist",
            workersDev: false,
            compatibility,
            assets: { notFoundHandling: "404-page" },
          });
          return yield* Cloudflare.Worker("OutfittingDocs", {
            name: docsWorkerName,
            main: "../docs/src/worker.ts",
            workersDev: false,
            observability: debugObservability,
            compatibility,
            env: {
              DOCS_ASSETS: docsAssets,
            },
          });
        })
      : undefined;

    const routerEnvBase = {
      API: api,
      INSTALLER: installer,
    };
    const routerEnv =
      docsWorker === undefined ? routerEnvBase : { ...routerEnvBase, DOCS_WORKER: docsWorker };

    const routerBase = {
      name: routerName,
      main: "../router/src/index.ts",
      workersDev: deployDomain === undefined,
      observability: debugObservability,
      compatibility,
      env: routerEnv,
    };
    const routerProps =
      deployDomain === undefined
        ? routerBase
        : {
            ...routerBase,
            domain: {
              name: deployDomain,
              aliases: [...installerHosts],
            },
          };

    const router = yield* Cloudflare.Worker("OutfittingRouter", routerProps);

    return {
      url: router.url,
      routerUrl: router.url,
      apiUrl: Output.interpolate`${router.url}/api`,
      docsUrl: deployDocs ? router.url : null,
      docs: deployDocs,
      domain: deployDomain ?? null,
      installerHosts: [...installerHosts],
      workers: deployConfig.workers,
    };
  }),
);
