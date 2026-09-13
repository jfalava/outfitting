import { Console, Effect, Option, Schema } from "effect";

import { tryPromise } from "@/lockfiles/effect";
import { runCommand, which } from "@/process";
import { ui } from "@/ui";

const NpmLatestSchema = Schema.Struct({
  "dist-tags": Schema.Struct({
    latest: Schema.optionalKey(Schema.NonEmptyString),
  }),
});
const decodeNpmLatest = Schema.decodeUnknownOption(NpmLatestSchema);

export type NpmFetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface BunPackageEntry {
  name: string;
  installedVersion: string;
}

export interface BunUpdateResult {
  updated: number;
  failed: number;
  skipped: number;
}

/** Parse `bun pm ls -g` lines into name@version entries. */
export function parseBunGlobalList(output: string): BunPackageEntry[] {
  const lines = output.split(/\r?\n/).slice(1);
  const entries: BunPackageEntry[] = [];
  for (const raw of lines) {
    const line = raw.replace(/^[^a-zA-Z@]*/, "").trim();
    if (line.length === 0) {
      continue;
    }
    const at = line.lastIndexOf("@");
    if (at <= 0 || at === line.length - 1) {
      continue;
    }
    const name = line.slice(0, at);
    const installedVersion = line.slice(at + 1);
    if (name.length === 0 || installedVersion.length === 0) {
      continue;
    }
    if (`${name}@${installedVersion}` !== line) {
      continue;
    }
    entries.push({ name, installedVersion });
  }
  return entries;
}

export async function fetchNpmLatestVersion(
  name: string,
  fetcher: NpmFetcher = fetch,
): Promise<string | undefined> {
  // Match Python urllib.parse.quote(pkg, safe="@/"): encode segments, keep @ and /.
  const safeUrl = `https://registry.npmjs.org/${name
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
    .replace(/%40/g, "@")}`;

  const response = await fetcher(safeUrl, {
    headers: {
      Accept: "application/json",
      "User-Agent": "outfitting-manager",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    return undefined;
  }
  const body: unknown = await response.json();
  const decoded = decodeNpmLatest(body);
  if (Option.isNone(decoded)) {
    return undefined;
  }
  return decoded.value["dist-tags"].latest;
}

async function listGlobalPackages(run: typeof runCommand = runCommand): Promise<BunPackageEntry[]> {
  const result = await run("bun", ["pm", "ls", "-g"], { inherit: false });
  if (result.code !== 0) {
    throw new Error(
      `Bun global update failure: bun pm ls -g failed (exit ${result.code}): ${result.stderr || result.stdout}`.trim(),
    );
  }
  return parseBunGlobalList(result.stdout);
}

/**
 * Update global Bun packages to registry latest.
 * Explicit command: fails if bun is missing.
 */
export const updateBun = (options?: {
  fetcher?: NpmFetcher;
  /** When true (update all), skip instead of failing if bun is absent. */
  skipIfMissing?: boolean;
  run?: typeof runCommand;
  which?: typeof which;
}) =>
  Effect.gen(function* () {
    const run = options?.run ?? runCommand;
    const whichFn = options?.which ?? which;
    const bunPath = yield* tryPromise(() => whichFn("bun"));
    if (bunPath === undefined) {
      if (options?.skipIfMissing) {
        yield* Console.log(ui.muted("Bun not installed; skipping."));
        return { updated: 0, failed: 0, skipped: 0 } satisfies BunUpdateResult;
      }
      return yield* Effect.fail(new Error("Bun is not installed or not in PATH."));
    }

    yield* Console.log(ui.heading("Updating global Bun packages…"));
    const packages = yield* tryPromise(() => listGlobalPackages(run));
    if (packages.length === 0) {
      yield* Console.log(ui.muted("No global Bun packages found."));
      return { updated: 0, failed: 0, skipped: 0 } satisfies BunUpdateResult;
    }

    yield* Console.log(ui.muted(`Found ${packages.length} global package(s).`));
    const fetcher = options?.fetcher ?? fetch;
    let updated = 0;
    let failed = 0;
    let skipped = 0;

    for (const entry of packages) {
      yield* Console.log(ui.muted(`Checking ${entry.name} (installed ${entry.installedVersion})…`));
      const latest = yield* tryPromise(() => fetchNpmLatestVersion(entry.name, fetcher));
      if (latest === undefined) {
        yield* Console.log(ui.muted(`  failed to fetch latest for ${entry.name}`));
        failed += 1;
        continue;
      }
      if (latest === entry.installedVersion) {
        yield* Console.log(ui.muted(`  up to date`));
        skipped += 1;
        continue;
      }
      yield* Console.log(ui.muted(`  updating to ${latest}`));
      const install = yield* tryPromise(() =>
        run("bun", ["add", "-g", `${entry.name}@${latest}`], { inherit: true }),
      );
      if (install.code === 0) {
        yield* Console.log(ui.success(`${entry.name}@${latest}`));
        updated += 1;
      } else {
        yield* Console.log(ui.muted(`  failed to install ${entry.name}@${latest}`));
        failed += 1;
      }
    }

    if (failed > 0) {
      return yield* Effect.fail(
        new Error(`Bun global update finished with ${failed} failure(s); updated ${updated}.`),
      );
    }
    yield* Console.log(ui.success(`Bun globals: ${updated} updated, ${skipped} already current.`));
    return { updated, failed, skipped } satisfies BunUpdateResult;
  });
