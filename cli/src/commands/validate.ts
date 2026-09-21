import { Console, Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { tryPromise } from "@/lockfiles/effect";
import {
  byorContractPlatforms,
  readByorContract,
  validateLinuxByorSource,
  validateWindowsByorSource,
  type ByorContract,
} from "@/source/contract";
import { ui } from "@/ui";

function resolveValidatePlatform(
  contract: ByorContract,
  platformFlag: string | undefined,
): "linux" | "windows" {
  const platforms = byorContractPlatforms(contract);
  if (platformFlag === "linux" || platformFlag === "windows") {
    if (platformFlag === "linux" && !platforms.linux) {
      throw new Error("outfitting.json does not declare any Linux profiles.");
    }
    if (platformFlag === "windows" && !platforms.windows) {
      throw new Error("outfitting.json does not declare any Windows profiles.");
    }
    return platformFlag;
  }
  if (platformFlag !== undefined) {
    throw new Error(`--platform must be linux or windows (got \`${platformFlag}\`).`);
  }
  if (platforms.linux && platforms.windows) {
    throw new Error(
      "outfitting.json declares both Linux and Windows profiles. Pass --platform linux|windows.",
    );
  }
  if (platforms.windows) {
    return "windows";
  }
  if (platforms.linux) {
    return "linux";
  }
  throw new Error("outfitting.json does not declare any Linux or Windows profiles.");
}

async function runValidate(options: {
  root: string;
  profile: string | undefined;
  platform: string | undefined;
}): Promise<{ lines: string[] }> {
  const contract = await readByorContract(options.root);
  const target = resolveValidatePlatform(contract, options.platform?.toLowerCase());

  if (target === "linux") {
    const result = await validateLinuxByorSource({
      root: options.root,
      profile: options.profile,
    });
    return {
      lines: [
        ui.success(`BYOR contract valid: ${result.root}`),
        "platform: linux",
        `profile: ${result.profile}`,
        `backends: ${result.backends.join(", ")}`,
      ],
    };
  }

  const result = await validateWindowsByorSource({
    root: options.root,
    profiles: options.profile === undefined ? undefined : [options.profile],
  });
  return {
    lines: [
      ui.success(`BYOR contract valid: ${result.root}`),
      "platform: windows",
      `profiles: ${result.names.join(", ")}`,
      `winget: ${result.names.map((name) => `${name}=${result.wingetPaths[name]}`).join(", ")}`,
    ],
  };
}

/** Validate a repository-owned BYOR contract without applying it. */
export const validateCommand = Command.make(
  "validate",
  {
    repo: Flag.String("repo").pipe(
      Flag.optional,
      Flag.withDescription("Local BYOR repository (default: current directory)."),
    ),
    profile: Flag.String("profile").pipe(
      Flag.optional,
      Flag.withDescription(
        "Profile to validate; comma-separated for Windows. Required when several Linux profiles exist.",
      ),
    ),
    platform: Flag.String("platform").pipe(
      Flag.optional,
      Flag.withDescription("Platform to validate when the contract declares both (linux|windows)."),
    ),
  },
  ({ repo, profile, platform }) =>
    Effect.gen(function* () {
      const result = yield* tryPromise(() =>
        runValidate({
          root: Option.getOrElse(repo, () => process.cwd()),
          profile: Option.getOrUndefined(profile),
          platform: Option.getOrUndefined(platform),
        }),
      );
      for (const line of result.lines) {
        yield* Console.log(line);
      }
    }),
).pipe(
  Command.withDescription(
    "Validate a repository-owned BYOR profile without changing the system.",
  ),
);
