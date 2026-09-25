import { Command, Flag } from "effect/unstable/cli";

import { optionalString } from "@/commands/linux-flags";
import { type HostPlatform, NIX_ACTIONS, type NixAction } from "@/platform";
import { updateNix } from "@/update/nix";

const noPushFlag = Flag.Boolean("no-push").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Skip publishing the Nix lock after a successful action."),
);

const noRefreshFlag = Flag.Boolean("no-refresh").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Use the local source without fetching remote changes."),
);

const profileFlag = Flag.String("profile").pipe(
  Flag.optional,
  Flag.withDescription("Override the platform profile selected in config.toml."),
);

const ifConfiguredFlag = Flag.Boolean("if-configured").pipe(
  Flag.withDefault(false),
  Flag.withDescription("On Linux, skip when the selected profile declares no Nix flake."),
);

const linuxFlags = {
  noPush: noPushFlag,
  noRefresh: noRefreshFlag,
  profile: profileFlag,
  ifConfigured: ifConfiguredFlag,
};

const macosFlags = {
  noPush: noPushFlag,
  noRefresh: noRefreshFlag,
  profile: profileFlag,
};

const actionDescriptions = {
  build: {
    macos: "Build the nix-darwin system without activating.",
    linux: "Build the Home Manager activation package without activating.",
  },
  switch: {
    macos: "Build and activate the nix-darwin system.",
    linux: "Build and activate the selected Home Manager profile.",
  },
  test: {
    macos: "Test-build the nix-darwin system without activating.",
    linux: "Test-build the Home Manager activation package without activating.",
  },
  "dry-run": {
    macos: "Dry-run the nix-darwin build without activating.",
    linux: "Dry-run the Home Manager build without activating.",
  },
} as const satisfies Record<NixAction, Record<"macos" | "linux", string>>;

/** Build, test, dry-run, or activate the configured Nix profile. */
export function makeNixCommand(platform: Extract<HostPlatform, "macos" | "linux">) {
  const flags = platform === "linux" ? linuxFlags : macosFlags;
  const actions = NIX_ACTIONS.map((action) =>
    Command.make(action, flags, (values) =>
      updateNix({
        action,
        noPush: values.noPush,
        noRefresh: values.noRefresh,
        profile: optionalString(values.profile),
        ifConfigured: "ifConfigured" in values && values.ifConfigured === true,
      }),
    ).pipe(Command.withDescription(actionDescriptions[action][platform])),
  );

  return Command.make("nix").pipe(
    Command.withDescription(
      platform === "macos"
        ? "Build, test, dry-run, or activate the nix-darwin profile."
        : "Build, test, dry-run, or activate the Home Manager profile.",
    ),
    Command.withSubcommands(actions),
  );
}
