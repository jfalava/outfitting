import { Console, Effect } from "effect";
import { Command, Prompt } from "effect/unstable/cli";

import {
  DEFAULT_WINDOWS_ROUTES,
  loadConfig,
  saveConfigFile,
  type ManagerConfigFile,
} from "@/config";
import { tryPromise } from "@/lockfiles/effect";
import { ui } from "@/ui";

interface ConfigAnswers {
  readonly baseUrl: string;
  readonly ref: string;
  readonly machineId: string;
  readonly wingetProfilePath: string;
  readonly scoopPath: string;
  readonly powershellProfilePath: string;
  readonly fontListPath: string;
  readonly registryPath: string;
  readonly defaultProfiles: string;
}

function requiredText(value: string, label: string): Effect.Effect<string, string> {
  const trimmed = value.trim();
  return trimmed.length > 0 ? Effect.succeed(trimmed) : Effect.fail(`${label} cannot be empty.`);
}

function routeText(value: string, label: string): Effect.Effect<string, string> {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, "");
  if (
    trimmed.length === 0 ||
    trimmed.includes("\\") ||
    trimmed.split("/").some((segment) => segment === ".." || segment.length === 0)
  ) {
    return Effect.fail(`${label} must be a repository-relative path.`);
  }
  if (label === "WinGet profile route" && !trimmed.includes("{profile}")) {
    return Effect.fail("WinGet profile route must contain {profile}.");
  }
  return Effect.succeed(trimmed);
}

function profilesText(value: string): Effect.Effect<string, string> {
  const profiles = [...new Set(value.split(",").map((profile) => profile.trim()))].filter(
    (profile) => profile.length > 0,
  );
  if (
    profiles.length === 0 ||
    profiles.some((profile) => !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(profile))
  ) {
    return Effect.fail("Profiles must be comma-separated names such as base,dev,work.");
  }
  return Effect.succeed(profiles.join(","));
}

function answersToPatch(answers: ConfigAnswers): ManagerConfigFile {
  return {
    machineId: answers.machineId,
    manifest: {
      baseUrl: answers.baseUrl,
      ref: answers.ref,
    },
    windows: {
      wingetProfilePath: answers.wingetProfilePath,
      scoopPath: answers.scoopPath,
      powershellProfilePath: answers.powershellProfilePath,
      fontListPath: answers.fontListPath,
      registryPath: answers.registryPath,
      defaultProfiles: answers.defaultProfiles.split(","),
    },
  };
}

/** Convert wizard answers to the on-disk config shape. Exported for tests. */
export function windowsConfigPatch(answers: ConfigAnswers): ManagerConfigFile {
  return answersToPatch(answers);
}

/** Run the interactive Windows repository configuration wizard. */
export const runWindowsConfigWizard = Effect.fn("runWindowsConfigWizard")(function* () {
  const config = yield* tryPromise(() => loadConfig());
  const windows = config.windows ?? DEFAULT_WINDOWS_ROUTES;
  const answers = yield* Prompt.all({
    baseUrl: Prompt.String({
      message: "Repository raw base URL",
      default: config.manifest.baseUrl,
      validate: (value) => requiredText(value, "Repository raw base URL"),
    }),
    ref: Prompt.String({
      message: "Repository ref",
      default: config.manifest.ref,
      validate: (value) => requiredText(value, "Repository ref"),
    }),
    machineId: Prompt.String({
      message: "Machine id",
      default: config.machineId,
      validate: (value) => requiredText(value, "Machine id"),
    }),
    wingetProfilePath: Prompt.String({
      message: "WinGet profile route ({profile} is replaced with the selected profile)",
      default: windows.wingetProfilePath,
      validate: (value) => routeText(value, "WinGet profile route"),
    }),
    scoopPath: Prompt.String({
      message: "Scoop manifest route",
      default: windows.scoopPath,
      validate: (value) => routeText(value, "Scoop manifest route"),
    }),
    powershellProfilePath: Prompt.String({
      message: "PowerShell profile route",
      default: windows.powershellProfilePath,
      validate: (value) => routeText(value, "PowerShell profile route"),
    }),
    fontListPath: Prompt.String({
      message: "FontGet list route",
      default: windows.fontListPath,
      validate: (value) => routeText(value, "FontGet list route"),
    }),
    registryPath: Prompt.String({
      message: "Registry tweaks directory route",
      default: windows.registryPath,
      validate: (value) => routeText(value, "Registry route"),
    }),
    defaultProfiles: Prompt.String({
      message: "Default WinGet profiles (comma-separated)",
      default: windows.defaultProfiles.join(","),
      validate: profilesText,
    }),
  });
  const path = yield* tryPromise(() => saveConfigFile(windowsConfigPatch(answers), {}));
  yield* Console.log(ui.success(`Windows configuration saved: ${path}`));
  yield* Console.log(ui.muted(`Source: ${answers.baseUrl}/${answers.ref}`));
  yield* Console.log(ui.muted(`Default profiles: ${answers.defaultProfiles}`));
  return path;
});

export const windowsConfigCommand = Command.make("config", {}, () =>
  runWindowsConfigWizard().pipe(Effect.asVoid),
).pipe(
  Command.withDescription(
    "Interactively configure the compatible repository source, Windows routes, and default profiles.",
  ),
);
