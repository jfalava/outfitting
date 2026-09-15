import { Effect } from "effect";

import { CliFailure } from "@/errors";

export interface BunPackageEntry {
  name: string;
  installedVersion: string;
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

/**
 * Bun global updates belong to Bun's own CLI rather than outfitting-manager.
 * Keep the command as a migration guard so old invocations fail with the
 * replacement instead of silently doing nothing.
 */
export const updateBun = Effect.fail(
  new CliFailure({
    message: "`update bun` is deprecated; run `bun update -g` instead.",
  }),
);
