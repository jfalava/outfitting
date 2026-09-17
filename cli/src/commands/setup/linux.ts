import { Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { runSetup } from "@/setup/run";
import { isLinuxProfile, linuxManifestPath } from "@/update/linux";

const profileFlag = Flag.string("profile").pipe(
  Flag.withDefault("generic-linux"),
  Flag.withDescription("Linux profile to cache (generic-linux or oci-agents)."),
);

const machineIdFlag = Flag.string("machine-id").pipe(
  Flag.optional,
  Flag.withDescription("Override machine id (default: auto user:arch-os)."),
);

const manifestBaseUrlFlag = Flag.string("manifest-base-url").pipe(
  Flag.optional,
  Flag.withDescription("Raw-compatible repository base URL without ref."),
);

const manifestRefFlag = Flag.string("manifest-ref").pipe(
  Flag.optional,
  Flag.withDescription("Git ref for manifests (default: main)."),
);

const repoFlag = Flag.string("repo").pipe(
  Flag.optional,
  Flag.withDescription("Existing monorepo path to store for the opt-in oci-agents profile."),
);

const noFetchFlag = Flag.boolean("no-fetch").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Skip fetching the selected Linux package manifest."),
);

function optional(value: Option.Option<string>): string | undefined {
  return Option.getOrUndefined(value);
}

/** Materialize Linux manager state and cache the selected profile manifest. */
export const linuxSetupCommand = Command.make(
  "setup",
  {
    profile: profileFlag,
    machineId: machineIdFlag,
    manifestBaseUrl: manifestBaseUrlFlag,
    manifestRef: manifestRefFlag,
    repo: repoFlag,
    noFetch: noFetchFlag,
  },
  ({ profile, machineId, manifestBaseUrl, manifestRef, repo, noFetch }) => {
    if (!isLinuxProfile(profile)) {
      throw new Error(`Unknown Linux profile \`${profile}\`. Choose: generic-linux or oci-agents.`);
    }
    return runSetup({
      machineId: optional(machineId),
      manifestBaseUrl: optional(manifestBaseUrl),
      manifestRef: optional(manifestRef),
      repo: optional(repo),
      fetchManifests: !noFetch,
      manifestPaths: [linuxManifestPath(profile)],
      nextCommand: "Next: outfitting-manager update all --profile generic-linux",
    });
  },
).pipe(
  Command.withDescription(
    "Materialize the Linux state root and cache a generic-linux or opt-in oci-agents package profile.",
  ),
);
