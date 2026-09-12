import { Effect } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { foreignPackageManagerStub } from "@/commands/update/stubs";
import {
  foreignPackageManagers,
  NIX_ACTIONS,
  type HostPlatform,
  type PackageManager,
  type NixAction,
} from "@/platform";
import { updateBrew } from "@/update/brew";
import { updateBun } from "@/update/bun";
import { updateNix } from "@/update/nix";

const noSyncFlag = Flag.boolean("no-sync").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Skip pushing inventory/lock blobs after a successful update."),
);

const nixActionDescription = {
  build: "Build the nix-darwin system without activating.",
  switch: "Build and activate the nix-darwin system (activate runs in-process).",
  test: "Test-build the nix-darwin system without activating.",
  dry: "Dry-run the nix-darwin build without activating.",
} as const satisfies Record<NixAction, string>;

const makeForeignStub = (pm: PackageManager, host: HostPlatform) =>
  Command.make(pm, {}, () => foreignPackageManagerStub(pm, host)).pipe(
    Command.withDescription(`Not available on ${host} (hint stub).`),
  );

const makeNixCommand = () => {
  const actions = NIX_ACTIONS.map((action) =>
    Command.make(action, {}, () => updateNix({ action })).pipe(
      Command.withDescription(nixActionDescription[action]),
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
        `update all is not implemented yet (no-sync=${noSync}; lands in the next migration step).`,
      ),
    ),
).pipe(
  Command.withDescription(
    "Run nix switch → brew → bun → inventory sync; continue on failure; exit ≠0 if any step failed.",
  ),
);

/**
 * macOS `update` tree: bun | brew | nix implemented; all stub;
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
