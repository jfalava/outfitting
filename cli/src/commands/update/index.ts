import { Effect } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { foreignPackageManagerStub } from "@/commands/update/stubs";
import {
  foreignPackageManagers,
  NIX_ACTIONS,
  type HostPlatform,
  type PackageManager,
} from "@/platform";
import { updateBrew } from "@/update/brew";
import { updateBun } from "@/update/bun";

const noSyncFlag = Flag.boolean("no-sync").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Skip pushing inventory/lock blobs after a successful update."),
);

const makeForeignStub = (pm: PackageManager, host: HostPlatform) =>
  Command.make(pm, {}, () => foreignPackageManagerStub(pm, host)).pipe(
    Command.withDescription(`Not available on ${host} (hint stub).`),
  );

const makeNixCommand = () => {
  const actions = NIX_ACTIONS.map((action) =>
    Command.make(action, {}, () =>
      Effect.fail(new Error(`update nix ${action} is not implemented yet`)),
    ).pipe(
      Command.withDescription(
        action === "switch"
          ? "Build and activate the nix-darwin system (activate runs in-process)."
          : action === "dry"
            ? "Dry-run the nix-darwin build without activating."
            : action === "test"
              ? "Test-build the nix-darwin system without activating."
              : "Build the nix-darwin system without activating.",
      ),
    ),
  );

  return Command.make("nix").pipe(
    Command.withDescription(
      "nix-darwin build | switch | test | dry (no flake-input upgrade in v1).",
    ),
    Command.withSubcommands(actions),
  );
};

const bunCommand = Command.make("bun", {}, () => updateBun()).pipe(
  Command.withDescription("Update Bun global packages (fails if bun is missing)."),
);

const brewCommand = Command.make(
  "brew",
  { noSync: noSyncFlag },
  ({ noSync }) => updateBrew({ noSync }),
).pipe(
  Command.withDescription("Full Homebrew path from the managed Brewfile desired state."),
);

const allCommand = Command.make(
  "all",
  { noSync: noSyncFlag },
  ({ noSync }) =>
    Effect.fail(
      new Error(
        `update all is not implemented yet (no-sync=${noSync}; lands after nix step).`,
      ),
    ),
).pipe(
  Command.withDescription(
    "Run nix switch → brew → bun → inventory sync; continue on failure; exit ≠0 if any step failed.",
  ),
);

/**
 * macOS `update` tree: bun | brew implemented; nix | all stubs;
 * plus foreign PM hint stubs (scoop, winget).
 */
export const makeMacosUpdateCommand = () => {
  const host = "macos" as const satisfies HostPlatform;
  const foreign = foreignPackageManagers(host).map((pm) => makeForeignStub(pm, host));

  return Command.make("update").pipe(
    Command.withDescription(
      "Update machine packages (bun, brew, nix, or all). One verb = full package path for that manager.",
    ),
    Command.withSubcommands([
      bunCommand,
      brewCommand,
      makeNixCommand(),
      allCommand,
      ...foreign,
    ]),
  );
};

