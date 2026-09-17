import * as cliProgress from "cli-progress";
import { Console, Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import {
  collectDiff,
  hasDifferences,
  type DiffPlatform,
  type DiffProgress,
  type DiffSection,
} from "@/diff";
import { CliFailure } from "@/errors";
import { tryPromise } from "@/lockfiles/effect";
import { ui } from "@/ui";

const managerFlag = Flag.string("manager").pipe(
  Flag.optional,
  Flag.withDescription("Compare one manager instead of the complete platform set."),
);

const profileFlag = Flag.string("profile").pipe(
  Flag.optional,
  Flag.withDescription(
    "Comma-separated Windows profile names; defaults to the selected sync profiles.",
  ),
);

const offlineFlag = Flag.boolean("offline").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Use cached repository manifests and skip the remote Nix comparison."),
);

const jsonFlag = Flag.boolean("json").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Print the comparison as JSON."),
);

function platformLabel(platform: DiffPlatform): string {
  return platform === "macos" ? "macOS" : "Windows";
}

interface DiffProgressRenderer {
  update: (progress: DiffProgress) => void;
  finish: () => void;
}

function makeProgressRenderer(platform: DiffPlatform): DiffProgressRenderer {
  const bar = new cliProgress.SingleBar({
    format: `${platformLabel(platform)} [{bar}] {percentage}% | {managerProgress} | {status} {manager}{item}`,
    stream: process.stderr,
    barsize: 20,
    hideCursor: true,
    linewrap: true,
  });
  let started = false;
  return {
    update: (progress) => {
      const value =
        progress.phase === "item" &&
        progress.itemIndex !== undefined &&
        progress.itemTotal !== undefined
          ? progress.completed + progress.itemIndex / progress.itemTotal
          : progress.completed;
      const payload = {
        item:
          progress.item === undefined
            ? ""
            : `: ${progress.item} (${progress.itemIndex}/${progress.itemTotal})`,
        manager: progress.manager,
        managerProgress: `${progress.completed}/${progress.total}`,
        status:
          progress.phase === "started"
            ? "loading"
            : progress.phase === "item"
              ? "comparing"
              : "done",
      };
      if (!started) {
        bar.start(progress.total, value, payload);
        started = true;
      } else {
        bar.update(value, payload);
      }
    },
    finish: () => {
      bar.stop();
    },
  };
}

function printSection(section: DiffSection): Effect.Effect<void> {
  const label = section.manager;
  if (section.status === "unavailable") {
    return Console.log(`${ui.heading("✗")} ${label}: ${section.message ?? "unavailable"}`);
  }
  if (section.status === "same") {
    return Console.log(
      ui.success(`${label}: in sync${section.message ? ` — ${section.message}` : ""}`),
    );
  }

  return Effect.gen(function* () {
    yield* Console.log(ui.heading(label));
    for (const item of section.missing) {
      yield* Console.log(`  ${ui.success(`missing: ${item}`)}`);
    }
    for (const item of section.extra) {
      yield* Console.log(`  ${ui.muted(`extra: ${item}`)}`);
    }
    for (const item of section.changed) {
      yield* Console.log(`  ${ui.key(`changed: ${item}`)}`);
    }
    if (section.message !== undefined) {
      yield* Console.log(`  ${ui.muted(section.message)}`);
    }
  });
}

function printText(result: Awaited<ReturnType<typeof collectDiff>>): Effect.Effect<void> {
  return Effect.gen(function* () {
    yield* Console.log(
      ui.heading(`Comparing ${platformLabel(result.platform)} to ${result.source}`),
    );
    yield* Console.log("");
    for (const section of result.sections) {
      yield* printSection(section);
      for (const warning of section.warnings ?? []) {
        yield* Console.log(ui.muted(`  ${warning}`));
      }
    }
    yield* Console.log("");
    if (result.unavailable) {
      yield* Console.log(ui.muted("Comparison incomplete."));
    } else if (result.differences) {
      yield* Console.log(ui.muted("Differences found."));
    } else {
      yield* Console.log(ui.success("Platform matches the configured repository state."));
    }
  });
}

function makeDiffCommand(platform: DiffPlatform) {
  return Command.make(
    "diff",
    {
      manager: managerFlag,
      profile: profileFlag,
      offline: offlineFlag,
      json: jsonFlag,
    },
    ({ manager, profile, offline, json }) =>
      Effect.gen(function* () {
        const progress = makeProgressRenderer(platform);
        const result = yield* tryPromise(() =>
          collectDiff({
            platform,
            manager: Option.getOrUndefined(manager),
            profiles: Option.isSome(profile) ? profile.value.split(",") : undefined,
            offline,
            onProgress: progress.update,
          }),
        ).pipe(Effect.ensuring(Effect.sync(progress.finish)));

        if (json) {
          yield* Console.log(JSON.stringify(result, null, 2));
        } else {
          yield* printText(result);
        }

        if (hasDifferences(result)) {
          return yield* new CliFailure({
            message: result.unavailable ? "Comparison incomplete." : "Differences found.",
          });
        }
      }),
  ).pipe(
    Command.withDescription(
      platform === "macos"
        ? "Compare live Homebrew and Nix state with the configured repository."
        : "Compare live WinGet and Scoop state with the configured repository.",
    ),
  );
}

export const makeMacosDiffCommand = () => makeDiffCommand("macos");
export const makeWindowsDiffCommand = () => makeDiffCommand("windows");
