import { Effect, Option } from "effect";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import { syncWindows } from "@/commands/windows-sync";
import { runSetup } from "@/setup/run";

/** Apply the configured Windows repository state after initializing its cache. */
export const windowsSetupCommand = Command.make(
  "setup",
  {
    machineId: Flag.string("machine-id").pipe(
      Flag.optional,
      Flag.withDescription("Override machine id (default: configured or auto user:arch-os)."),
    ),
    manifestBaseUrl: Flag.string("manifest-base-url").pipe(
      Flag.optional,
      Flag.withDescription("Raw-compatible repository base URL without ref."),
    ),
    manifestRef: Flag.string("manifest-ref").pipe(
      Flag.optional,
      Flag.withDescription("Repository ref (branch, tag, or SHA)."),
    ),
    profile: Flag.string("profile").pipe(
      Flag.optional,
      Flag.withDescription("Comma-separated profile names from the configured repository."),
    ),
    wingetOnly: Flag.boolean("winget-only").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip Scoop while bootstrapping WinGet."),
    ),
    noPush: Flag.boolean("no-push").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Write the local lockfile without pushing it to the Worker."),
    ),
  },
  ({ machineId, manifestBaseUrl, manifestRef, profile, wingetOnly, noPush }) =>
    runSetup({
      machineId: Option.getOrUndefined(machineId),
      manifestBaseUrl: Option.getOrUndefined(manifestBaseUrl),
      manifestRef: Option.getOrUndefined(manifestRef),
      useWindowsRoutes: true,
      nextCommand: "Applying Windows desired state…",
    }).pipe(
      Effect.flatMap(() =>
        syncWindows({
          profiles: Option.isSome(profile) ? [profile.value] : undefined,
          wingetOnly,
          noPush,
          confirmClean: Prompt.confirm({
            message: "Remove the listed packages?",
            initial: false,
          }).pipe(Effect.orDie),
        }),
      ),
    ),
).pipe(
  Command.withDescription(
    "Initialize and apply the configured Windows profiles, packages, and PowerShell profile.",
  ),
);
