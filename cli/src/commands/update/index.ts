import { Command, Flag } from "effect/unstable/cli";

import { foreignPackageManagerStub } from "@/commands/update/stubs";
import {
  foreignPackageManagers,
  NIX_ACTIONS,
  type HostPlatform,
  type PackageManager,
  type NixAction,
} from "@/platform";
import { updateAll } from "@/update/all";
import { updateBrew } from "@/update/brew";
import { updateNix } from "@/update/nix";

const noPushFlag = Flag.Boolean("no-push").pipe(
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

  // No default action: bare `update nix` only lists subcommands.
  return Command.make("nix").pipe(
    Command.withDescription(
      "Nix-darwin actions: build | switch | test | dry (pick one; bare nix lists them).",
    ),
    Command.withSubcommands(actions),
  );
};

const brewCommand = Command.make("brew", { noPush: noPushFlag }, ({ noPush }) =>
  updateBrew({ noPush }),
).pipe(Command.withDescription("Upgrade installed Homebrew packages."));

const allCommand = Command.make("all", { noPush: noPushFlag }, ({ noPush }) =>
  updateAll({ noPush }),
).pipe(
  Command.withDescription(
    "Run nix switch → brew (inventory upload unless --no-push); continue on failure; exit ≠0 if any step failed.",
  ),
);

/** macOS `update` tree: one manager per subcommand, plus foreign PM hints. */
export const makeMacosUpdateCommand = () => {
  const host = "macos" as const satisfies HostPlatform;
  const foreign = foreignPackageManagers(host).map((pm) => makeForeignStub(pm, host));

  return Command.make("update").pipe(
    Command.withDescription(
      "Update machine packages (brew, nix, or all); Bun updates use `bun update -g`.",
    ),
    Command.withSubcommands([brewCommand, makeNixCommand(), allCommand, ...foreign]),
  );
};
