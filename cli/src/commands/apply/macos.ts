import { join } from "node:path";

import { Console, Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { configuredProfile, loadConfig } from "@/config";
import { tryPromise } from "@/lockfiles/effect";
import { runSetup } from "@/setup/run";
import { selectMacosByorProfile } from "@/source/contract";
import { ui } from "@/ui";
import { applyBrew } from "@/update/brew";

/** Reconcile packages declared by the selected macOS Brewfile. */
export const macosApplyCommand = Command.make(
  "apply",
  {
    machineId: Flag.String("machine-id").pipe(
      Flag.optional,
      Flag.withDescription("Override machine id (default: auto user:arch-os)."),
    ),
    repo: Flag.String("repo").pipe(
      Flag.optional,
      Flag.withDescription("Local source path override for this invocation."),
    ),
    profile: Flag.String("profile").pipe(
      Flag.optional,
      Flag.withDescription("macOS profile declared in config.toml (defaults to its selection)."),
    ),
    noRefresh: Flag.Boolean("no-refresh").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Use the previously validated source without refreshing it."),
    ),
  },
  ({ machineId, repo, profile, noRefresh }) =>
    Effect.gen(function* () {
      const config = yield* tryPromise(() =>
        loadConfig({
          machineId: Option.getOrUndefined(machineId),
        }),
      );
      const selectedProfile = configuredProfile(config, "macos", Option.getOrUndefined(profile));
      const source = yield* runSetup({
        platform: "macos",
        machineId: Option.getOrUndefined(machineId),
        repo: Option.getOrUndefined(repo),
        repoProfile: selectedProfile,
        refreshSource: !noRefresh,
        config,
        skipSymlinks: true,
        nextCommand: "Applying the selected macOS Brewfile…",
      });
      const selected = selectMacosByorProfile(config.declarations!, selectedProfile);
      const brewfile = selected.macos.brewfile;
      if (brewfile === undefined) {
        yield* Console.log(ui.muted("No Brewfile declared; skipping Homebrew apply."));
        return;
      }
      yield* applyBrew({ config, brewfilePath: join(source.root, brewfile) });
    }),
).pipe(
  Command.withDescription(
    "Reconcile packages declared in the selected macOS Brewfile; use `nix switch` for Nix.",
  ),
);
