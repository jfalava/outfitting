import { Console, Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { tryPromise } from "@/lockfiles/effect";
import {
  byorContractPlatforms,
  readByorContract,
  validateLinuxByorSource,
  validateMacosByorSource,
  validateWindowsByorSource,
  type ByorContract,
  type ByorContractPlatforms,
} from "@/source/contract";
import { ui } from "@/ui";

type ValidatePlatform = "linux" | "windows" | "macos";

function platformLabel(platform: ValidatePlatform): string {
  switch (platform) {
    case "linux":
      return "Linux";
    case "windows":
      return "Windows";
    case "macos":
      return "macOS";
  }
}

function requirePlatform(
  platforms: ByorContractPlatforms,
  platform: ValidatePlatform,
): ValidatePlatform {
  if (!platforms[platform]) {
    throw new Error(
      `outfitting.json does not declare any ${platformLabel(platform)} profiles.`,
    );
  }
  return platform;
}

function declaredPlatforms(platforms: ByorContractPlatforms): ValidatePlatform[] {
  const declared: ValidatePlatform[] = [];
  if (platforms.linux) {
    declared.push("linux");
  }
  if (platforms.windows) {
    declared.push("windows");
  }
  if (platforms.macos) {
    declared.push("macos");
  }
  return declared;
}

function resolveValidatePlatform(
  contract: ByorContract,
  platformFlag: string | undefined,
): ValidatePlatform {
  const platforms = byorContractPlatforms(contract);
  if (platformFlag === "linux" || platformFlag === "windows" || platformFlag === "macos") {
    return requirePlatform(platforms, platformFlag);
  }
  if (platformFlag !== undefined) {
    throw new Error(`--platform must be linux, windows, or macos (got \`${platformFlag}\`).`);
  }

  const declared = declaredPlatforms(platforms);
  if (declared.length > 1) {
    throw new Error(
      `outfitting.json declares multiple platforms (${declared.join(", ")}). Pass --platform ${declared.join("|")}.`,
    );
  }
  if (declared.length === 1) {
    return declared[0]!;
  }
  throw new Error("outfitting.json does not declare any Linux, Windows, or macOS profiles.");
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

  if (target === "macos") {
    const result = await validateMacosByorSource({
      root: options.root,
      profile: options.profile,
    });
    return {
      lines: [
        ui.success(`BYOR contract valid: ${result.root}`),
        "platform: macos",
        `profile: ${result.profile}`,
        `flake: ${result.macos.nix.flake}`,
        `attribute: ${result.systemAttr}`,
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
        "Profile to validate; comma-separated for Windows. Required when several exclusive profiles exist.",
      ),
    ),
    platform: Flag.String("platform").pipe(
      Flag.optional,
      Flag.withDescription(
        "Platform to validate when the contract declares more than one (linux|windows|macos).",
      ),
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
