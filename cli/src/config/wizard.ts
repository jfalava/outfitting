import { existsSync } from "node:fs";
import { mkdtemp, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { Console, Effect } from "effect";
import { Command, Prompt } from "effect/unstable/cli";
import { stringify as stringifyToml } from "smol-toml";

import { applyWindows } from "@/commands/windows-apply";
import { normalizeGitRepository, validateGitRef } from "@/config/git";
import { loadConfig } from "@/config/load";
import { configFilePath, stateRoot } from "@/config/paths";
import { publishValidatedConfig } from "@/config/write";
import { classifyGitHubRepository, readGitHubFile } from "@/fetch/github";
import { tryPromise } from "@/lockfiles/effect";
import type { HostPlatform } from "@/platform";
import { runCommand } from "@/process";
import { envValue } from "@/secrets";
import { runSetup } from "@/setup/run";
import {
  parseByorContract,
  readLegacyByorContract,
  validateLinuxByorSource,
  validateMacosByorSource,
  validateWindowsByorSource,
  type ByorContract,
  type ByorWindowsShared,
} from "@/source/contract";
import { ui } from "@/ui";
import { applyBrew } from "@/update/brew";
import { applyLinux } from "@/update/linux";
import { updateNix } from "@/update/nix/run";

type WizardSource = { path: string } | { repository: string; ref: string };

interface WizardConfigDocument {
  schema: 1;
  source: WizardSource;
  linux?: { profile: string };
  macos?: { profile: string };
  windows?: { profiles?: string[]; shared?: Omit<ByorWindowsShared, "defaultProfiles"> };
  profiles: ByorContract["profiles"];
}

interface WizardAnswers {
  configPath: string;
  contract: ByorContract;
  platform: HostPlatform;
  profiles: string[];
  source: WizardSource;
  localRoot?: string;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function hostPlatform(): HostPlatform {
  if (process.platform === "darwin") {
    return "macos";
  }
  return process.platform === "win32" ? "windows" : "linux";
}

function profileNames(contract: ByorContract, platform: HostPlatform): string[] {
  return Object.entries(contract.profiles)
    .filter(([, declaration]) => declaration[platform] !== undefined)
    .map(([name]) => name);
}

function profilePrompt(contract: ByorContract, platform: HostPlatform) {
  const names = profileNames(contract, platform);
  if (names.length === 0) {
    throw new Error(`The source contract does not declare any ${platform} profiles.`);
  }

  if (platform !== "windows") {
    return Prompt.run(
      Prompt.Select({
        message: `Choose the ${platform} profile for this machine`,
        choices: names.map((name) => ({
          title: name,
          value: name,
          selected: names.length === 1,
        })),
      }),
    ).pipe(Effect.map((profile) => [profile]));
  }

  const configured = contract.windows?.defaultProfiles;
  const selected = new Set(configured !== undefined && configured.length > 0 ? configured : names);
  return Prompt.run(
    Prompt.MultiSelect({
      message: "Choose the Windows profiles for this machine",
      min: 1,
      choices: names.map((name) => ({ title: name, value: name, selected: selected.has(name) })),
    }),
  );
}

function targetPathPrompt(defaultPath: string) {
  return Prompt.run(
    Prompt.String({
      message: "Where should the new config.toml be written?",
      default: defaultPath,
      validate: (value) => {
        const path = value.trim();
        if (path.length === 0) {
          return Effect.fail("Enter a path for config.toml.");
        }
        const target = resolve(path);
        if (existsSync(target)) {
          return Effect.fail(
            `${target} already exists. Choose another path; it will not be overwritten.`,
          );
        }
        return Effect.succeed(target);
      },
    }),
  );
}

function localSourcePathPrompt() {
  return Prompt.run(
    Prompt.String({
      message: "Path to the local source checkout containing outfitting.json",
      default: process.cwd(),
      validate: (value) =>
        Effect.tryPromise({
          try: async () => {
            if (value.trim().length === 0) {
              throw new Error("Enter the path to a source checkout.");
            }
            const root = await realpath(resolve(value.trim()));
            if (!(await stat(root)).isDirectory()) {
              throw new Error(`${root} is not a directory.`);
            }
            return root;
          },
          catch: errorMessage,
        }),
    }),
  );
}

function normalizedTextPrompt(
  message: string,
  normalize: (value: string) => string,
  defaultValue?: string,
) {
  const validate = (value: string) => {
    if (value.trim().length === 0) {
      return Effect.fail("This value is required.");
    }
    try {
      return Effect.succeed(normalize(value.trim()));
    } catch (cause) {
      return Effect.fail(errorMessage(cause));
    }
  };
  const prompt =
    defaultValue === undefined
      ? Prompt.String({ message, validate })
      : Prompt.String({ message, default: defaultValue, validate });
  return Prompt.run(prompt);
}

async function runGit(cwd: string, args: ReadonlyArray<string>): Promise<string> {
  const result = await runCommand("git", args, { cwd, inherit: false });
  if (result.code !== 0) {
    const detail = (result.stderr || result.stdout).trim();
    throw new Error(
      `git ${args.join(" ")} failed (exit ${result.code})${detail.length > 0 ? `: ${detail}` : "."}`,
    );
  }
  return result.stdout;
}

async function readRemoteContract(repository: string, ref: string): Promise<ByorContract> {
  const githubRepository = classifyGitHubRepository(repository);
  if (githubRepository !== undefined) {
    const file = await readGitHubFile({
      repository: githubRepository,
      ref,
      path: "outfitting.json",
    });
    const parsed: unknown = JSON.parse(new TextDecoder().decode(file.body));
    return parseByorContract(parsed as Parameters<typeof parseByorContract>[0]);
  }

  const directory = await mkdtemp(join(tmpdir(), "outfitting-config-wizard-"));
  try {
    await runGit(directory, ["init", "--quiet"]);
    await runGit(directory, ["remote", "add", "origin", repository]);
    await runGit(directory, ["fetch", "--depth=1", "--no-tags", "origin", ref]);
    const contractJson = await runGit(directory, ["show", "FETCH_HEAD:outfitting.json"]);
    await writeFile(join(directory, "outfitting.json"), contractJson, "utf8");
    return await readLegacyByorContract(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

export function buildWizardConfigDocument(
  contract: ByorContract,
  source: WizardSource,
  platform: HostPlatform,
  profiles: ReadonlyArray<string>,
): WizardConfigDocument {
  const document: WizardConfigDocument = {
    schema: 1,
    source,
    profiles: contract.profiles,
  };

  if (platform === "linux") {
    document.linux = { profile: profiles[0]! };
  } else if (platform === "macos") {
    document.macos = { profile: profiles[0]! };
  } else {
    document.windows = { profiles: [...profiles] };
  }

  const { defaultProfiles: _defaultProfiles, ...shared } = contract.windows ?? {};
  if (Object.keys(shared).length > 0) {
    document.windows ??= {};
    document.windows.shared = shared;
  }
  return document;
}

async function validateLocalProfile(answers: WizardAnswers): Promise<void> {
  if (answers.localRoot === undefined) {
    return;
  }
  const profile = answers.profiles.join(",");
  switch (answers.platform) {
    case "linux":
      await validateLinuxByorSource({
        root: answers.localRoot,
        profile,
        contract: answers.contract,
      });
      break;
    case "macos":
      await validateMacosByorSource({
        root: answers.localRoot,
        profile,
        contract: answers.contract,
      });
      break;
    case "windows":
      await validateWindowsByorSource({
        root: answers.localRoot,
        profiles: answers.profiles,
        contract: answers.contract,
      });
      break;
  }
}

function interview(platform: HostPlatform) {
  return Effect.gen(function* () {
    const defaultPath = envValue("OUTFITTING_CONFIG") ?? configFilePath(stateRoot());
    const configPath = yield* targetPathPrompt(defaultPath);
    const sourceKind = yield* Prompt.run(
      Prompt.Select({
        message: "Where is the Outfitting source?",
        choices: [
          { title: "Use a local checkout", value: "local" },
          { title: "Use a remote Git repository", value: "remote" },
        ],
      }),
    );

    let contract: ByorContract;
    let source: WizardSource;
    let localRoot: string | undefined;
    if (sourceKind === "local") {
      localRoot = yield* localSourcePathPrompt();
      contract = yield* tryPromise(() => readLegacyByorContract(localRoot!));
      source = { path: localRoot };
    } else {
      const repository = yield* normalizedTextPrompt("Git repository URL", normalizeGitRepository);
      const ref = yield* normalizedTextPrompt("Git branch, tag, or ref", validateGitRef, "main");
      yield* Console.log(ui.muted(`Reading outfitting.json from ${repository}@${ref}…`));
      contract = yield* tryPromise(() => readRemoteContract(repository, ref));
      source = { repository, ref };
    }

    const profiles = yield* profilePrompt(contract, platform);
    return { configPath, contract, platform, profiles, source, localRoot } satisfies WizardAnswers;
  }).pipe(
    Effect.catchTag("QuitError", () =>
      Console.log(ui.muted("Setup wizard cancelled; no config was written.")).pipe(
        Effect.as(undefined),
      ),
    ),
  );
}

function confirm(message: string) {
  return Prompt.run(Prompt.Confirm({ message, initial: false })).pipe(
    Effect.catchTag("QuitError", () => Effect.succeed(false)),
  );
}

function commandPrefix(configPath: string, platform: HostPlatform): string {
  if (resolve(configPath) === resolve(configFilePath(stateRoot()))) {
    return "outfitting-manager";
  }
  if (platform === "windows") {
    return `$env:OUTFITTING_CONFIG = '${configPath.replaceAll("'", "''")}'; outfitting-manager`;
  }
  return `outfitting-manager --config '${configPath.replaceAll("'", "'\\''")}'`;
}

function selectedNixDeclaration(
  config: Awaited<ReturnType<typeof loadConfig>>,
  platform: HostPlatform,
  profiles: ReadonlyArray<string>,
): boolean {
  const declaration = config.declarations?.profiles[profiles[0]!];
  if (platform === "linux") {
    return declaration?.linux?.nix !== undefined;
  }
  if (platform === "macos") {
    return declaration?.macos?.nix !== undefined;
  }
  return false;
}

function displayNextCommands(commands: ReadonlyArray<string>) {
  return Effect.gen(function* () {
    if (commands.length === 0) {
      return;
    }
    yield* Console.log(ui.muted("Continue setup later with:"));
    for (const command of commands) {
      yield* Console.log(`  ${command}`);
    }
  });
}

function continueLinuxSetup(
  config: Awaited<ReturnType<typeof loadConfig>>,
  profiles: ReadonlyArray<string>,
  prefix: string,
) {
  return Effect.gen(function* () {
    const profile = profiles[0]!;
    const declaration = config.declarations?.profiles[profile]?.linux;
    if (declaration?.apt === undefined && declaration?.pacman === undefined) {
      return [];
    }
    if (yield* confirm("Install missing packages declared for this Linux profile now?")) {
      yield* applyLinux({
        config,
        profile,
        noRefresh: true,
        ifConfigured: true,
        confirm: Prompt.run(
          Prompt.Confirm({ message: "Apply the displayed package plan?", initial: false }),
        ).pipe(Effect.orDie),
      });
      return [];
    }
    return [`${prefix} apply --no-refresh`];
  });
}

function continueMacosSetup(
  config: Awaited<ReturnType<typeof loadConfig>>,
  profiles: ReadonlyArray<string>,
  prefix: string,
) {
  return Effect.gen(function* () {
    const profile = profiles[0]!;
    const declaration = config.declarations?.profiles[profile]?.macos;
    if (declaration?.brewfile === undefined) {
      return [];
    }
    if (
      yield* confirm(
        "Install the declared Homebrew packages now? This may trust taps and install software.",
      )
    ) {
      yield* applyBrew({ config, profile, noPush: true });
      return [];
    }
    return [`${prefix} apply --no-refresh`];
  });
}

function continueWindowsSetup(
  config: Awaited<ReturnType<typeof loadConfig>>,
  profiles: ReadonlyArray<string>,
  prefix: string,
) {
  return Effect.gen(function* () {
    if (yield* confirm("Review and apply the selected Windows package plan now?")) {
      yield* applyWindows({
        config,
        profiles,
        confirm: Prompt.run(
          Prompt.Confirm({ message: "Apply the displayed package plan?", initial: false }),
        ).pipe(Effect.orDie),
      });
      return [];
    }
    return [`${prefix} apply`];
  });
}

function continueNixSetup(
  config: Awaited<ReturnType<typeof loadConfig>>,
  platform: HostPlatform,
  profiles: ReadonlyArray<string>,
  prefix: string,
) {
  return Effect.gen(function* () {
    if (!selectedNixDeclaration(config, platform, profiles)) {
      return [];
    }
    const message =
      platform === "macos"
        ? "Activate the nix-darwin system now? This may require administrator access."
        : "Activate the selected Home Manager profile now?";
    if (yield* confirm(message)) {
      yield* updateNix({
        action: "switch",
        config,
        profile: profiles[0],
        noRefresh: true,
        ifConfigured: true,
        noPush: true,
      });
      return [];
    }
    return [`${prefix} nix switch --no-refresh --no-push`];
  });
}

function continueSetup(
  config: Awaited<ReturnType<typeof loadConfig>>,
  platform: HostPlatform,
  profiles: ReadonlyArray<string>,
) {
  return Effect.gen(function* () {
    const prefix = commandPrefix(config.configPath, platform);
    const platformSetup = {
      linux: continueLinuxSetup,
      macos: continueMacosSetup,
      windows: continueWindowsSetup,
    }[platform];
    const nextCommands = yield* platformSetup(config, profiles, prefix);
    nextCommands.push(...(yield* continueNixSetup(config, platform, profiles, prefix)));
    yield* displayNextCommands(nextCommands);
  });
}

const runWizard = () =>
  Effect.gen(function* () {
    const platform = hostPlatform();
    const answers = yield* interview(platform);
    if (answers === undefined) {
      return;
    }

    yield* tryPromise(() => validateLocalProfile(answers));
    const document = buildWizardConfigDocument(
      answers.contract,
      answers.source,
      platform,
      answers.profiles,
    );
    const serialized = `${stringifyToml(document).trimEnd()}\n`;

    yield* Console.log("");
    yield* Console.log(ui.heading("Review the new config.toml:"));
    yield* Console.log(serialized);
    if (!(yield* confirm("Write this config and initialize the selected Outfitting source?"))) {
      yield* Console.log(ui.muted("Setup cancelled; no config was written."));
      return;
    }

    const root = stateRoot();
    yield* tryPromise(() => publishValidatedConfig(root, answers.configPath, serialized));
    const config = yield* tryPromise(() =>
      loadConfig({ stateRoot: root, configPath: answers.configPath }),
    );
    yield* Console.log(ui.success(`Config created: ${config.configPath}`));
    yield* Console.log(ui.heading("Preparing Outfitting state and validating the source…"));
    yield* runSetup({
      platform,
      config,
      repoProfile: answers.profiles.join(","),
      refreshSource: true,
      skipSymlinks: true,
      nextCommand: "Source is initialized. Choose whether to apply packages or activate Nix below.",
    });
    yield* continueSetup(config, platform, answers.profiles);
  });

export const configWizardCommand = Command.make("wizard", {}, runWizard).pipe(
  Command.withDescription(
    "Guide first-time Outfitting setup, create config.toml, and initialize its source.",
  ),
);
