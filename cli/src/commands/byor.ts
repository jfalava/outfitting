import { Console, Effect, Option } from "effect";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import { byorMapPath, ensureStateRoot, saveConfigFile } from "@/config";
import { CliFailure } from "@/errors";
import { classifyGitHubRepository, normalizeRepositoryUrl } from "@/fetch/github";
import { toError, tryPromise } from "@/lockfiles/effect";
import { readByorMap, writeByorProfile } from "@/source/byor-map";
import {
  linuxPathsFromProfile,
  macosPathsFromProfile,
  relativeSourcePath,
  type ByorContract,
  type ByorProfileDeclaration,
  type LinuxProfileDeclaration,
} from "@/source/contract";
import { isLinuxProfile } from "@/source/linux-profile";
import { ui } from "@/ui";

export interface ByorWizardAnswers {
  readonly repoUrl: string;
  readonly ref: string;
  readonly profile: string;
  readonly platform: "linux" | "macos" | "windows";
  readonly apt?: string;
  readonly pacman?: string;
  readonly flake?: string;
  readonly attribute?: string;
  readonly brewfile?: string;
  readonly winget?: string;
  /** Explicit out-of-flake list. Empty means the user confirmed there are none. */
  readonly paths: readonly string[];
}

function requiredText(value: string, label: string): Effect.Effect<string, string> {
  const trimmed = value.trim();
  return trimmed.length > 0 ? Effect.succeed(trimmed) : Effect.fail(`${label} cannot be empty.`);
}

function profileText(value: string): Effect.Effect<string, string> {
  const trimmed = value.trim();
  if (!isLinuxProfile(trimmed)) {
    return Effect.fail("Profile must contain only letters, numbers, ., _, and -.");
  }
  return Effect.succeed(trimmed);
}

function repoText(value: string): Effect.Effect<string, string> {
  const trimmed = value.trim();
  if (classifyGitHubRepository(trimmed) === undefined) {
    return Effect.fail("Repository must be a GitHub or GitHub Enterprise URL.");
  }
  return Effect.succeed(trimmed);
}

function optionalPath(value: string | undefined, label: string): string | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  return relativeSourcePath(value, label);
}

/** Split a comma-separated path list. An empty string is an explicit empty confirmation. */
export function parseConfirmedPaths(value: string): string[] {
  return value
    .split(",")
    .map((path) => path.trim())
    .filter((path) => path.length > 0)
    .map((path, index) => relativeSourcePath(path, `paths[${index}]`));
}

function linuxProfileFromAnswers(
  answers: ByorWizardAnswers,
  paths: string[],
): LinuxProfileDeclaration {
  const linux: LinuxProfileDeclaration = { paths };
  const apt = optionalPath(answers.apt, "apt manifest");
  const pacman = optionalPath(answers.pacman, "pacman manifest");
  const flake = optionalPath(answers.flake, "flake directory");
  if (apt !== undefined) {
    linux.apt = { manifest: apt };
  }
  if (pacman !== undefined) {
    linux.pacman = { manifest: pacman };
  }
  if (flake !== undefined) {
    if (answers.attribute === undefined || answers.attribute.trim().length === 0) {
      throw new Error("A Nix flake requires an attribute.");
    }
    linux.nix = { flake, attribute: answers.attribute.trim() };
  }
  if (linux.apt === undefined && linux.pacman === undefined && linux.nix === undefined) {
    throw new Error("A Linux profile needs an apt manifest, a pacman manifest, or a Nix flake.");
  }
  return linux;
}

export function profileFromAnswers(answers: ByorWizardAnswers): ByorProfileDeclaration {
  const paths = [...answers.paths];
  if (answers.platform === "linux") {
    return { linux: linuxProfileFromAnswers(answers, paths) };
  }
  if (answers.platform === "macos") {
    const flake = optionalPath(answers.flake, "flake directory");
    if (
      flake === undefined ||
      answers.attribute === undefined ||
      answers.attribute.trim().length === 0
    ) {
      throw new Error("A macOS profile needs a flake directory and attribute.");
    }
    const macos: NonNullable<ByorProfileDeclaration["macos"]> = {
      nix: { flake, attribute: answers.attribute.trim() },
      paths,
    };
    const brewfile = optionalPath(answers.brewfile, "Brewfile");
    if (brewfile !== undefined) {
      macos.brewfile = brewfile;
    }
    return { macos };
  }
  const winget = optionalPath(answers.winget, "WinGet manifest");
  if (winget === undefined) {
    throw new Error("A Windows profile needs a WinGet manifest.");
  }
  return { windows: { winget: { manifest: winget } } };
}

/** Paths the written profile will fetch, for the confirmation diff. */
export function profileFetchPaths(profile: ByorProfileDeclaration): string[] {
  return [
    ...new Set([
      ...(profile.linux === undefined ? [] : linuxPathsFromProfile(profile.linux)),
      ...(profile.macos === undefined ? [] : macosPathsFromProfile(profile.macos)),
      ...(profile.windows === undefined ? [] : [profile.windows.winget.manifest]),
    ]),
  ];
}

function existingPaths(contract: ByorContract | undefined, name: string): string[] {
  const profile = contract?.profiles[name];
  return profile === undefined ? [] : profileFetchPaths(profile);
}

export function pathDiff(before: readonly string[], after: readonly string[]): string[] {
  const removed = before.filter((path) => !after.includes(path)).map((path) => `- ${path}`);
  const added = after.filter((path) => !before.includes(path)).map((path) => `+ ${path}`);
  return [...removed, ...added];
}

/** Persist one answered profile. Does not write into the remote repository. */
export async function saveByorWizardAnswers(
  answers: ByorWizardAnswers,
  stateRoot: string,
): Promise<{ path: string; diff: string[] }> {
  const existing = await readByorMap(stateRoot);
  const profile = profileFromAnswers(answers);
  const before = existingPaths(existing, answers.profile);
  const after = profileFetchPaths({ ...existing?.profiles[answers.profile], ...profile });
  await writeByorProfile({ stateRoot, name: answers.profile, profile, existing });
  await saveConfigFile(
    {
      manifest: {
        kind: "byor",
        baseUrl: normalizeRepositoryUrl(answers.repoUrl),
        ref: answers.ref.trim(),
      },
    },
    { stateRoot },
  );
  return { path: byorMapPath(stateRoot), diff: pathDiff(before, after) };
}

function asWizardError<A>(validation: Effect.Effect<A, string>): Effect.Effect<A, CliFailure> {
  return validation.pipe(Effect.mapError((message) => new CliFailure({ message })));
}

function flagValue(flag: Option.Option<string>): string | undefined {
  return Option.getOrUndefined(flag);
}

interface ByorWizardFlags {
  repo: Option.Option<string>;
  ref: Option.Option<string>;
  profile: Option.Option<string>;
  platform: Option.Option<string>;
  apt: Option.Option<string>;
  pacman: Option.Option<string>;
  flake: Option.Option<string>;
  attribute: Option.Option<string>;
  brewfile: Option.Option<string>;
  winget: Option.Option<string>;
  paths: Option.Option<string>;
}

function collectPlatformPaths(flags: ByorWizardFlags, platform: ByorWizardAnswers["platform"]) {
  return Effect.gen(function* () {
    if (platform === "windows") {
      return {
        winget:
          flagValue(flags.winget) ?? (yield* Prompt.String({ message: "WinGet manifest path" })),
      };
    }
    if (platform === "macos") {
      return {
        flake: flagValue(flags.flake) ?? (yield* Prompt.String({ message: "Nix flake directory" })),
        attribute:
          flagValue(flags.attribute) ?? (yield* Prompt.String({ message: "Nix output attribute" })),
        brewfile:
          flagValue(flags.brewfile) ??
          (yield* Prompt.String({ message: "Brewfile path (empty to skip)", default: "" })),
      };
    }
    let apt = flagValue(flags.apt);
    let pacman = flagValue(flags.pacman);
    let flake = flagValue(flags.flake);
    if ([apt, pacman, flake].every((value) => value === undefined)) {
      apt = yield* Prompt.String({ message: "apt manifest path (empty to skip)", default: "" });
      pacman = yield* Prompt.String({
        message: "pacman manifest path (empty to skip)",
        default: "",
      });
      flake = yield* Prompt.String({ message: "Nix flake directory (empty to skip)", default: "" });
    }
    const attribute = flake?.trim()
      ? (flagValue(flags.attribute) ?? (yield* Prompt.String({ message: "Nix output attribute" })))
      : undefined;
    return { apt, pacman, flake, attribute };
  });
}

export function collectByorAnswers(flags: ByorWizardFlags) {
  return Effect.gen(function* () {
    const platformValue = flagValue(flags.platform);
    if (platformValue !== undefined && !["linux", "macos", "windows"].includes(platformValue)) {
      return yield* new CliFailure({ message: "Platform must be linux, macos, or windows." });
    }
    const platform =
      platformValue === "linux" || platformValue === "macos" || platformValue === "windows"
        ? platformValue
        : yield* Prompt.Select({
            message: "Platform",
            choices: [
              { title: "Linux", value: "linux" as const },
              { title: "macOS", value: "macos" as const },
              { title: "Windows", value: "windows" as const },
            ],
          });
    const repoUrl = yield* asWizardError(
      repoText(flagValue(flags.repo) ?? (yield* Prompt.String({ message: "Repository URL" }))),
    );
    const ref = yield* asWizardError(
      requiredText(
        flagValue(flags.ref) ??
          (yield* Prompt.String({ message: "Repository ref", default: "main" })),
        "Repository ref",
      ),
    );
    const profile = yield* asWizardError(
      profileText(flagValue(flags.profile) ?? (yield* Prompt.String({ message: "Profile name" }))),
    );
    const platformPaths = yield* collectPlatformPaths(flags, platform);
    const pathsText =
      platform === "windows"
        ? ""
        : (flagValue(flags.paths) ??
          (yield* Prompt.String({
            message: "Files outside the flake directory, comma-separated (empty to confirm none)",
            default: "",
          })));
    const paths = yield* Effect.try({ try: () => parseConfirmedPaths(pathsText), catch: toError });
    const answers = {
      repoUrl,
      ref,
      profile,
      platform,
      ...platformPaths,
      paths,
    } satisfies ByorWizardAnswers;
    yield* Effect.try({ try: () => profileFromAnswers(answers), catch: toError });
    return answers;
  });
}

export const byorCommand = Command.make(
  "byor",
  {
    repo: Flag.String("repo").pipe(Flag.optional, Flag.withDescription("GitHub repository URL.")),
    ref: Flag.String("ref").pipe(Flag.optional, Flag.withDescription("Repository ref.")),
    profile: Flag.String("profile").pipe(Flag.optional, Flag.withDescription("Profile name.")),
    platform: Flag.String("platform").pipe(
      Flag.optional,
      Flag.withDescription("linux, macos, or windows."),
    ),
    apt: Flag.String("apt").pipe(
      Flag.optional,
      Flag.withDescription("Repository-relative apt manifest."),
    ),
    pacman: Flag.String("pacman").pipe(
      Flag.optional,
      Flag.withDescription("Repository-relative pacman manifest."),
    ),
    flake: Flag.String("flake").pipe(
      Flag.optional,
      Flag.withDescription("Repository-relative flake directory."),
    ),
    attribute: Flag.String("attribute").pipe(Flag.optional, Flag.withDescription("Nix attribute.")),
    brewfile: Flag.String("brewfile").pipe(
      Flag.optional,
      Flag.withDescription("Repository-relative Brewfile."),
    ),
    winget: Flag.String("winget").pipe(
      Flag.optional,
      Flag.withDescription("Repository-relative WinGet manifest."),
    ),
    paths: Flag.String("paths").pipe(
      Flag.optional,
      Flag.withDescription(
        "Comma-separated files outside the flake directory. Pass an empty value to confirm there are none.",
      ),
    ),
  },
  (flags) =>
    Effect.gen(function* () {
      const answers = yield* collectByorAnswers(flags);
      const root = yield* tryPromise(() => ensureStateRoot());
      const existing = yield* tryPromise(() => readByorMap(root));
      const profile = yield* Effect.try({ try: () => profileFromAnswers(answers), catch: toError });
      const merged = { ...existing?.profiles[answers.profile], ...profile };
      const diff = pathDiff(existingPaths(existing, answers.profile), profileFetchPaths(merged));
      if (existing?.profiles[answers.profile] !== undefined) {
        yield* Console.log(diff.length === 0 ? "Profile paths are unchanged." : diff.join("\n"));
        yield* Console.log(JSON.stringify(merged, null, 2));
        const confirmed = yield* Prompt.Confirm({
          message: `Replace local profile ${answers.profile}?`,
          initial: false,
        });
        if (!confirmed) {
          return yield* new CliFailure({ message: "Left the local BYOR profile unchanged." });
        }
      }
      const saved = yield* tryPromise(() => saveByorWizardAnswers(answers, root));
      yield* Console.log(ui.success(`Local BYOR profile map: ${saved.path}`));
      yield* Console.log(ui.muted("The remote repository was not modified."));
    }),
).pipe(
  Command.withDescription(
    "Write a local BYOR profile map for a remote repository that does not contain outfitting.json.",
  ),
);
