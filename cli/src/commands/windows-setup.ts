import { Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { initializeWindows } from "@/commands/setup/windows";
import { applyWindows } from "@/commands/windows-apply";

/** Apply the configured Windows repository state after initializing its cache. */
export const windowsSetupCommand = Command.make(
  "setup",
  {
    machineId: Flag.String("machine-id").pipe(
      Flag.optional,
      Flag.withDescription("Override machine id (default: configured or auto user:arch-os)."),
    ),
    manifestBaseUrl: Flag.String("manifest-base-url").pipe(
      Flag.optional,
      Flag.withDescription("Raw-compatible repository base URL without ref."),
    ),
    manifestRef: Flag.String("manifest-ref").pipe(
      Flag.optional,
      Flag.withDescription("Repository ref (branch, tag, or SHA)."),
    ),
    profile: Flag.String("profile").pipe(
      Flag.optional,
      Flag.withDescription("Comma-separated profile names from the configured repository."),
    ),
    repo: Flag.String("repo").pipe(
      Flag.optional,
      Flag.withDescription("Local BYOR repository checkout to validate and use."),
    ),
    wingetOnly: Flag.Boolean("winget-only").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip Scoop while bootstrapping WinGet."),
    ),
  },
  ({ machineId, manifestBaseUrl, manifestRef, profile, repo, wingetOnly }) =>
    initializeWindows({
      profiles: Option.isSome(profile) ? [profile.value] : undefined,
      machineId: Option.getOrUndefined(machineId),
      manifestBaseUrl: Option.getOrUndefined(manifestBaseUrl),
      manifestRef: Option.getOrUndefined(manifestRef),
      repo: Option.getOrUndefined(repo),
      useWindowsRoutes: true,
      nextCommand: "Applying Windows desired state…",
    }).pipe(
      Effect.flatMap(() =>
        applyWindows({
          profiles: Option.isSome(profile) ? [profile.value] : undefined,
          wingetOnly,
          yes: true,
        }),
      ),
    ),
).pipe(
  Command.withDescription(
    "Initialize and apply the configured Windows profiles, packages, and PowerShell profile.",
  ),
);
