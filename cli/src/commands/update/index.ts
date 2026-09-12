import { Command } from "effect/unstable/cli";

import { foreignPackageManagerStub, notImplementedYet } from "@/commands/update/stubs";
import {
  foreignPackageManagers,
  NIX_ACTIONS,
  type HostPlatform,
  type PackageManager,
} from "@/platform";

const makeLeaf = (name: string, description: string, effect: ReturnType<typeof notImplementedYet>) =>
  Command.make(name, {}, () => effect).pipe(Command.withDescription(description));

const makeNixCommand = () => {
  const actions = NIX_ACTIONS.map((action) =>
    makeLeaf(
      action,
      action === "switch"
        ? "Build and activate the nix-darwin system (activate runs in-process)."
        : action === "dry"
          ? "Dry-run the nix-darwin build without activating."
          : action === "test"
            ? "Test-build the nix-darwin system without activating."
            : "Build the nix-darwin system without activating.",
      notImplementedYet(`update nix ${action}`),
    ),
  );

  return Command.make("nix").pipe(
    Command.withDescription(
      "nix-darwin build | switch | test | dry (no flake-input upgrade in v1).",
    ),
    Command.withSubcommands(actions),
  );
};

const makeNativeStub = (pm: Exclude<PackageManager, "nix">, description: string) =>
  makeLeaf(pm, description, notImplementedYet(`update ${pm}`));

const makeForeignStub = (pm: PackageManager, host: HostPlatform) =>
  makeLeaf(pm, `Not available on ${host} (hint stub).`, foreignPackageManagerStub(pm, host));

/**
 * macOS `update` tree: bun | brew | nix | all as not-yet-implemented stubs,
 * plus foreign PM hint stubs (scoop, winget, …).
 */
export const makeMacosUpdateCommand = () => {
  const host = "macos" as const satisfies HostPlatform;

  const native = [
    makeNativeStub("bun", "Update Bun global packages (fails if bun is missing)."),
    makeNativeStub("brew", "Full Homebrew path from the managed Brewfile desired state."),
    makeNixCommand(),
    makeNativeStub(
      "all",
      "Run nix switch → brew → bun → inventory sync; continue on failure; exit ≠0 if any step failed.",
    ),
  ];

  const foreign = foreignPackageManagers(host).map((pm) => makeForeignStub(pm, host));

  return Command.make("update").pipe(
    Command.withDescription(
      "Update machine packages (bun, brew, nix, or all). One verb = full package path for that manager.",
    ),
    Command.withSubcommands([...native, ...foreign]),
  );
};
