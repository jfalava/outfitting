import { Console, Effect } from "effect";

import { DEFAULT_LINUX_PROFILE, loadConfig } from "@/config";
import { CliFailure } from "@/errors";
import type { ManifestFetcher } from "@/fetch";
import { tryPromise } from "@/lockfiles/effect";
import { ui } from "@/ui";
import { isLinuxProfile, updateLinux, type LinuxUpdateOptions } from "@/update/linux";
import { updateNix } from "@/update/nix";

export interface LinuxUpdateAllOptions extends LinuxUpdateOptions {
  noPush?: boolean;
  noRefresh?: boolean;
  sourceFetcher?: ManifestFetcher;
}

function validateLinuxUpdateAll(config: LinuxUpdateAllOptions["config"], offline: boolean) {
  const profile = config?.linux?.profile ?? DEFAULT_LINUX_PROFILE;
  if (!isLinuxProfile(profile)) {
    return new CliFailure({
      message: `Invalid Linux profile \`${profile}\`. Built-ins: generic-linux, oci-agents, ubuntu-wsl; BYOR names are allowed when outfitting.json is present.`,
    });
  }
  if (offline) {
    return new CliFailure({
      message:
        "`update all --offline` is refused because native package upgrades require network-backed resolution.",
    });
  }
  return profile;
}

function printLinuxUpdateSummary(
  results: ReadonlyArray<{ name: string; ok: boolean; error?: string }>,
) {
  return Effect.gen(function* () {
    yield* Console.log("");
    for (const step of results) {
      yield* Console.log(
        step.ok
          ? ui.success(step.name)
          : `${ui.heading("✗")} ${step.name}: ${step.error ?? "failed"}`,
      );
    }
    const failed = results.filter((step) => !step.ok);
    if (failed.length > 0) {
      return yield* new CliFailure({
        message: `update all finished with ${failed.length} failed step(s): ${failed
          .map((step) => step.name)
          .join(", ")}`,
      });
    }
    yield* Console.log(ui.success("update all completed successfully."));
  });
}

/**
 * Linux `update all`: Home Manager first for Nix-backed profiles, then native
 * package upgrades. Independent steps continue after failures and the command
 * fails if any requested step failed.
 */
export const updateLinuxAll = (options: LinuxUpdateAllOptions = {}) =>
  Effect.gen(function* () {
    const config = options.config ?? (yield* tryPromise(() => loadConfig()));
    const validation = validateLinuxUpdateAll(config, options.offline === true);
    if (validation instanceof CliFailure) {
      return yield* validation;
    }
    const profile = validation;

    const results: Array<{ name: string; ok: boolean; error?: string }> = [];
    const runStep = <A, E, R>(
      name: string,
      effect: Effect.Effect<A, E, R>,
    ): Effect.Effect<void, never, R> =>
      effect.pipe(
        Effect.asVoid,
        Effect.map(() => {
          results.push({ name, ok: true });
        }),
        Effect.catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          results.push({ name, ok: false, error: message });
          return Console.log(ui.muted(`Step failed (${name}): ${message}`));
        }),
      );

    const hasHomeManager = profile === "oci-agents" || profile === "ubuntu-wsl";
    yield* Console.log(
      ui.heading(
        hasHomeManager
          ? "update all: Home Manager → native packages"
          : "update all: native packages",
      ),
    );

    if (hasHomeManager) {
      yield* runStep(
        "nix switch",
        updateNix({
          action: "switch",
          config,
          noPush: options.noPush === true,
          noRefresh: options.noRefresh === true,
          sourceFetcher: options.sourceFetcher,
        }),
      );
    }

    yield* runStep(
      "native packages",
      updateLinux({
        config,
        packageManager: options.packageManager,
        offline: false,
        run: options.run,
        which: options.which,
        osReleasePath: options.osReleasePath,
        readOsRelease: options.readOsRelease,
      }),
    );

    yield* printLinuxUpdateSummary(results);
  });
