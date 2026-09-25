import { Console, Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { configuredProfile, loadConfig, sparseSourceRoot } from "@/config";
import { CliFailure } from "@/errors";
import { tryPromise } from "@/lockfiles/effect";
import { envValue } from "@/secrets";
import { syncByorSparseSource } from "@/setup/source";
import {
  byorContractPlatforms,
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
    throw new Error(`config.toml does not declare any ${platformLabel(platform)} profiles.`);
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
      `config.toml declares multiple platforms (${declared.join(", ")}). Pass --platform ${declared.join("|")}.`,
    );
  }
  if (declared.length === 1) {
    return declared[0]!;
  }
  throw new Error("config.toml does not declare any Linux, Windows, or macOS profiles.");
}

async function runValidate(options: {
  root: string;
  contract: ByorContract;
  profile: string | undefined;
  platform: string | undefined;
}): Promise<{ lines: string[] }> {
  const contract = options.contract;
  const target = resolveValidatePlatform(contract, options.platform?.toLowerCase());

  if (target === "linux") {
    const result = await validateLinuxByorSource({
      root: options.root,
      profile: options.profile,
      contract,
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
      contract,
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
    contract,
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

async function validateConfiguredSource(options: {
  repo: string | undefined;
  profile: string | undefined;
  platform: string | undefined;
}): Promise<{ lines: string[] }> {
  const config = await loadConfig();
  const contract = config.declarations;
  if (contract === undefined) {
    throw new CliFailure({
      message: `No profile declarations are configured in ${config.configPath}.`,
    });
  }
  const target = resolveValidatePlatform(contract, options.platform?.toLowerCase());
  const selectedProfile = configuredProfile(config, target, options.profile);
  const localPath =
    options.repo ??
    envValue("OUTFITTING_REPO") ??
    (config.source?.kind === "local" ? config.source.path : undefined);
  if (localPath === undefined && config.source?.kind !== "remote") {
    throw new CliFailure({ message: `No source is configured in ${config.configPath}.` });
  }
  if (localPath === undefined) {
    await syncByorSparseSource({
      config,
      platform: target,
      profile: selectedProfile,
      offline: true,
    });
  }
  return runValidate({
    root: localPath ?? sparseSourceRoot(config.stateRoot),
    contract,
    profile: selectedProfile,
    platform: target,
  });
}

/** Validate the configured TOML declarations and selected source without applying them. */
export const validateCommand = Command.make(
  "validate",
  {
    repo: Flag.String("repo").pipe(
      Flag.optional,
      Flag.withDescription("Local source path override (defaults to config.toml)."),
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
        validateConfiguredSource({
          repo: Option.getOrUndefined(repo),
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
    "Validate config.toml declarations and the selected source without changing the system.",
  ),
);
