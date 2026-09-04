import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { Console, Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";
import pc from "picocolors";

import {
  deployConfigToEnv,
  loadDeployConfig,
  type DeployConfig,
  type DeployOverrides,
} from "../../../iac/src/deploy-config";
import { storeWorkerUrl } from "@/lockfiles/keychain";
import { ui } from "@/ui";

function optionalFlag(value: Option.Option<string>): string | undefined {
  return Option.getOrUndefined(value);
}

function docsOverride(docs: boolean, noDocs: boolean): boolean | undefined {
  if (docs && noDocs) {
    throw new Error("Pass only one of --docs or --no-docs.");
  }
  if (noDocs) {
    return false;
  }
  if (docs) {
    return true;
  }
  return undefined;
}

function parseInstallerHosts(value: string | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value
    .split(",")
    .map((host) => host.trim())
    .filter((host) => host.length > 0);
}

function stackDirectory(): string {
  const candidates = [
    process.env["OUTFITTING_IAC_DIR"],
    resolve(process.cwd(), "iac"),
    resolve(import.meta.dir, "../../../iac"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  const directory = candidates.find((candidate) =>
    existsSync(resolve(candidate, "alchemy.run.ts")),
  );
  if (!directory) {
    throw new Error(
      "The Alchemy stack is unavailable. Run from the monorepo root or set OUTFITTING_IAC_DIR to iac/.",
    );
  }
  return directory;
}

function stripTerminalColors(value: string): string {
  const escape = String.fromCharCode(27);
  return ["0", "1", "2", "22", "31", "32", "33", "36", "39", "90"].reduce(
    (current, code) => current.replaceAll(`${escape}[${code}m`, ""),
    value,
  );
}

async function runAlchemyDeploy(options: {
  deployConfig: DeployConfig;
  workerToken: string;
}): Promise<{ url: string }> {
  const directory = stackDirectory();
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );

  const child = Bun.spawn(["bun", "run", "alchemy", "deploy", "--yes", "--adopt"], {
    cwd: directory,
    env: {
      ...environment,
      ...deployConfigToEnv(options.deployConfig),
      OUTFITTING_LOCKFILES_TOKEN: options.workerToken,
    },
    stdin: "inherit",
    stdout: "pipe",
    stderr: "pipe",
  });

  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  const output = stripTerminalColors(`${stdout}\n${stderr}`);
  if (output.trim()) {
    console.info(output.trim());
  }
  if (exitCode !== 0) {
    throw new Error(`Alchemy deploy failed with exit code ${exitCode}.`);
  }

  const url =
    output.match(/\burl\s*[:=]\s*["']?(https?:\/\/[^\s"']+)/i)?.[1] ??
    output.match(/https?:\/\/[^\s"']+workers\.dev[^\s"']*/i)?.[0] ??
    (options.deployConfig.domain ? `https://${options.deployConfig.domain}` : undefined);

  if (!url) {
    throw new Error(
      "Alchemy deploy completed but did not report the Worker URL. Configure it with outfitting-manager lockfiles configure-worker.",
    );
  }
  return { url };
}

function printProvisioned(apiBaseUrl: string, resolved: DeployConfig): void {
  console.info();
  console.info(pc.green(pc.bold("✓ Outfitting stack provisioned")));
  console.info(`${pc.dim("API")}       ${pc.cyan(apiBaseUrl)}`);
  console.info(`${pc.dim("Stack")}     ${resolved.stackName}`);
  console.info(`${pc.dim("Router")}    ${resolved.workers.router}`);
  console.info(`${pc.dim("API name")}  ${resolved.workers.api}`);
  console.info(`${pc.dim("Installer")} ${resolved.workers.installer}`);
  console.info(
    resolved.docs
      ? `${pc.dim("Docs")}      ${resolved.workers.docs}`
      : `${pc.dim("Docs")}      ${pc.dim("skipped")}`,
  );
  if (resolved.domain) {
    console.info(`${pc.dim("Domain")}    ${resolved.domain}`);
  }
  if (resolved.configPath) {
    console.info(`${pc.dim("Config")}    ${resolved.configPath}`);
  }
  console.info(`${pc.dim("Token")}     ${pc.dim("stored in the OS keychain")}`);
  console.info();
}

export const provisionCommand = Command.make(
  "provision",
  {
    config: Flag.string("config").pipe(
      Flag.optional,
      Flag.withDescription(
        "Path to outfitting.deploy.json (see iac/outfitting.deploy.example.json).",
      ),
    ),
    domain: Flag.string("domain").pipe(
      Flag.optional,
      Flag.withDescription("Apex hostname for the router (empty string clears the default)."),
    ),
    docs: Flag.boolean("docs").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Force-deploy the docs StaticSite + docs worker."),
    ),
    noDocs: Flag.boolean("no-docs").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip docs StaticSite + docs worker entirely."),
    ),
    stackName: Flag.string("stack-name").pipe(
      Flag.optional,
      Flag.withDescription("Alchemy stack name (default Outfitting)."),
    ),
    apiName: Flag.string("api-name").pipe(
      Flag.optional,
      Flag.withDescription("Cloudflare worker name for the API (default outfitting-api)."),
    ),
    routerName: Flag.string("router-name").pipe(
      Flag.optional,
      Flag.withDescription("Cloudflare worker name for the router (default outfitting-router)."),
    ),
    docsName: Flag.string("docs-name").pipe(
      Flag.optional,
      Flag.withDescription("Cloudflare worker name for docs (default outfitting-docs)."),
    ),
    docsAssetsName: Flag.string("docs-assets-name").pipe(
      Flag.optional,
      Flag.withDescription("Docs StaticSite name (default outfitting-docs-assets)."),
    ),
    installerName: Flag.string("installer-name").pipe(
      Flag.optional,
      Flag.withDescription("Cloudflare worker name for installer (default outfitting-installer)."),
    ),
    databaseName: Flag.string("database-name").pipe(
      Flag.optional,
      Flag.withDescription("D1 database name (default outfitting-lockfiles)."),
    ),
    kvTitle: Flag.string("kv-title").pipe(
      Flag.optional,
      Flag.withDescription("KV namespace title (default outfitting-lockfiles)."),
    ),
    privateFonts: Flag.string("private-fonts").pipe(
      Flag.optional,
      Flag.withDescription("R2 bucket name for private fonts."),
    ),
    installerHosts: Flag.string("installer-hosts").pipe(
      Flag.optional,
      Flag.withDescription("Comma-separated installer host aliases on the router domain."),
    ),
    token: Flag.string("token").pipe(
      Flag.optional,
      Flag.withDescription(
        "OUTFITTING_LOCKFILES_TOKEN value. Defaults to env, else generates and stores one.",
      ),
    ),
    skipConfigure: Flag.boolean("skip-configure").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Do not write lockfiles worker URL / token to the OS keychain."),
    ),
  },
  (flags) =>
    Effect.gen(function* () {
      const overrides: DeployOverrides = {
        docs: docsOverride(flags.docs, flags.noDocs),
        stackName: optionalFlag(flags.stackName),
        databaseName: optionalFlag(flags.databaseName),
        kvTitle: optionalFlag(flags.kvTitle),
        privateFontsBucket: optionalFlag(flags.privateFonts),
        installerHosts: parseInstallerHosts(optionalFlag(flags.installerHosts)),
        workers: {
          router: optionalFlag(flags.routerName),
          api: optionalFlag(flags.apiName),
          docs: optionalFlag(flags.docsName),
          docsAssets: optionalFlag(flags.docsAssetsName),
          installer: optionalFlag(flags.installerName),
        },
      };
      // Only set domain when the flag is present so omitted flags keep defaults.
      if (Option.isSome(flags.domain)) {
        overrides.domain = flags.domain.value.trim() || undefined;
      }

      const resolved = yield* Effect.try({
        try: () =>
          loadDeployConfig({
            configPath: optionalFlag(flags.config),
            overrides,
          }),
        catch: (cause) =>
          cause instanceof Error ? cause : new Error("Invalid provision configuration."),
      });

      const workerToken =
        optionalFlag(flags.token)?.trim() ||
        process.env["OUTFITTING_LOCKFILES_TOKEN"]?.trim() ||
        randomBytes(32).toString("hex");

      const deployment = yield* Effect.tryPromise({
        try: () =>
          runAlchemyDeploy({
            deployConfig: resolved,
            workerToken,
          }),
        catch: (cause) =>
          cause instanceof Error ? cause : new Error("Could not deploy the Outfitting stack."),
      });

      const routerUrl = deployment.url.replace(/\/$/, "");
      const apiBaseUrl = `${routerUrl}/api`;

      if (!flags.skipConfigure) {
        yield* Effect.tryPromise({
          try: async () => {
            await storeWorkerUrl(apiBaseUrl);
            await Bun.secrets.set({
              service: "outfitting-lockfiles",
              name: "api-token",
              value: workerToken,
            });
          },
          catch: (cause) =>
            new Error(
              `Stack deployed, but credentials could not be stored in the OS keychain: ${
                cause instanceof Error ? cause.message : String(cause)
              }. Set them with lockfiles configure-worker / configure-token.`,
            ),
        });
      }

      yield* Effect.sync(() => printProvisioned(apiBaseUrl, resolved));
      yield* Console.log(ui.muted("Next: outfitting-manager lockfiles list <machine>"));
    }),
).pipe(
  Command.withDescription(
    "Deploy the Outfitting Alchemy stack with dynamic outfitting-… names; optionally skip docs.",
  ),
);
