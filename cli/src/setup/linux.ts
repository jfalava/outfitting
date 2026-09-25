import { Effect } from "effect";

import { tryPromise } from "@/lockfiles/effect";
import { resolveSetupSource, runSetup, type SetupOptions } from "@/setup/run";
import type { LinuxProfile } from "@/source/linux-profile";

export interface LinuxInitOptions extends SetupOptions {
  profile?: LinuxProfile;
}

/** Prepare Linux state and validate its configured source. */
export const runLinuxInit = (options: LinuxInitOptions) =>
  Effect.gen(function* () {
    const { profile, ...input } = options;
    const source = yield* tryPromise(() =>
      resolveSetupSource({ ...input, platform: "linux", repoProfile: profile }),
    );
    yield* runSetup({
      ...source,
      repoProfile: profile,
      nextCommand:
        "Next: outfitting-manager apply --no-refresh --if-configured, then outfitting-manager nix switch --no-refresh --if-configured",
    });
  });
