import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect, Option, FileSystem, Layer, Path, Terminal, Queue } from "effect";
import { Prompt } from "effect/unstable/cli";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  parseConfirmedPaths,
  pathDiff,
  profileFromAnswers,
  saveByorWizardAnswers,
  collectByorAnswers,
} from "@/commands/byor";
import { byorMapPath } from "@/config/paths";
import { readByorMap, writeByorProfile } from "@/source/byor-map";

vi.mock("effect/unstable/cli", async (importOriginal) => {
  const original = await importOriginal<typeof import("effect/unstable/cli")>();
  return { ...original, Prompt: { ...original.Prompt, String: vi.fn(), Select: vi.fn() } };
});

const temps: string[] = [];
const promptServices = Layer.mergeAll(
  FileSystem.layerNoop({}),
  Path.layer,
  Layer.mock(Terminal.Terminal, {
    "~effect/Terminal": "~effect/Terminal",
    readInput: Queue.unbounded<Terminal.UserInput>(),
  }),
);

afterEach(async () => {
  vi.resetAllMocks();
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("BYOR wizard", () => {
  test.each([
    [
      "linux",
      [
        "packages/apt.txt",
        "",
        "nix/linux",
        "homeConfigurations.desk.activationPackage",
        "outside.nix",
      ],
    ],
    ["macos", ["nix/macos", "darwinConfigurations.desk.system", "Brewfile", "outside.nix"]],
    ["windows", ["packages/windows.txt"]],
  ] as const)(
    "collects a complete %s profile without path flags",
    async (platform, pathAnswers) => {
      const values = ["https://github.com/org/repo", "main", "desk", ...pathAnswers];
      vi.mocked(Prompt.Select).mockReturnValue(Prompt.succeed(platform));
      vi.mocked(Prompt.String).mockImplementation(() => {
        const answer = values.shift();
        if (answer === undefined) {
          throw new Error("Unexpected prompt");
        }
        return Prompt.succeed(answer);
      });
      const flags = {
        repo: Option.none<string>(),
        ref: Option.none<string>(),
        profile: Option.none<string>(),
        platform: Option.none<string>(),
        apt: Option.none<string>(),
        pacman: Option.none<string>(),
        flake: Option.none<string>(),
        attribute: Option.none<string>(),
        brewfile: Option.none<string>(),
        winget: Option.none<string>(),
        paths: Option.none<string>(),
      };
      const answers = await Effect.runPromise(
        collectByorAnswers(flags).pipe(Effect.provide(promptServices)),
      );
      const profile = profileFromAnswers(answers);
      expect(values).toEqual([]);
      if (platform === "linux") {
        expect(profile.linux).toEqual({
          apt: { manifest: "packages/apt.txt" },
          nix: { flake: "nix/linux", attribute: "homeConfigurations.desk.activationPackage" },
          paths: ["outside.nix"],
        });
      } else if (platform === "macos") {
        expect(profile.macos).toEqual({
          nix: { flake: "nix/macos", attribute: "darwinConfigurations.desk.system" },
          brewfile: "Brewfile",
          paths: ["outside.nix"],
        });
      } else {
        expect(profile.windows).toEqual({ winget: { manifest: "packages/windows.txt" } });
      }
    },
  );

  test("complete Linux flags avoid prompting and invalid platforms fail before prompting", async () => {
    const flags = {
      repo: Option.some("https://github.com/org/repo"),
      ref: Option.some("main"),
      profile: Option.some("desk"),
      platform: Option.some("linux"),
      apt: Option.some("packages/apt.txt"),
      pacman: Option.none<string>(),
      flake: Option.none<string>(),
      attribute: Option.none<string>(),
      brewfile: Option.none<string>(),
      winget: Option.none<string>(),
      paths: Option.some(""),
    };
    expect(
      (await Effect.runPromise(collectByorAnswers(flags).pipe(Effect.provide(promptServices)))).apt,
    ).toBe("packages/apt.txt");
    await expect(
      Effect.runPromise(
        collectByorAnswers({ ...flags, platform: Option.some("linx") }).pipe(
          Effect.provide(promptServices),
        ),
      ),
    ).rejects.toThrow(/Platform must/);
    expect(Prompt.String).not.toHaveBeenCalled();
    expect(Prompt.Select).not.toHaveBeenCalled();
  });

  test("adding a platform preserves other profiles and platforms", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-byor-merge-"));
    temps.push(stateRoot);
    await writeByorProfile({
      stateRoot,
      name: "desk",
      profile: { linux: { apt: { manifest: "apt.txt" } } },
    });
    await writeByorProfile({
      stateRoot,
      name: "other",
      profile: { windows: { winget: { manifest: "other.txt" } } },
    });
    const saved = await saveByorWizardAnswers(
      {
        repoUrl: "https://github.com/org/repo",
        ref: "main",
        profile: "desk",
        platform: "windows",
        winget: "desk.txt",
        paths: [],
      },
      stateRoot,
    );
    expect(saved.diff).toEqual(["+ desk.txt"]);
    expect((await readByorMap(stateRoot))!.profiles).toEqual({
      desk: {
        linux: { apt: { manifest: "apt.txt" } },
        windows: { winget: { manifest: "desk.txt" } },
      },
      other: { windows: { winget: { manifest: "other.txt" } } },
    });
  });

  test("an empty path answer is stored as an explicit empty list", async () => {
    const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-byor-map-"));
    temps.push(stateRoot);
    const answers = {
      repoUrl: "https://pepito.ghe.com/jalava/machine-config",
      ref: "main",
      profile: "desk",
      platform: "linux" as const,
      apt: "packages/apt.txt",
      flake: "nix/linux",
      attribute: "homeConfigurations.desk.activationPackage",
      paths: parseConfirmedPaths(""),
    };

    expect(answers.paths).toEqual([]);
    expect(profileFromAnswers(answers).linux?.paths).toEqual([]);
    const saved = await saveByorWizardAnswers(answers, stateRoot);
    const map = JSON.parse(await readFile(byorMapPath(stateRoot), "utf8")) as {
      profiles: { desk: { linux: { paths: string[] } } };
    };
    const config = JSON.parse(await readFile(join(stateRoot, "config.json"), "utf8")) as {
      manifest: { baseUrl: string };
    };

    expect(map.profiles.desk.linux.paths).toEqual([]);
    expect(config.manifest.baseUrl).toBe("https://pepito.ghe.com/jalava/machine-config");
    expect(saved.diff).toEqual(["+ packages/apt.txt", "+ nix/linux"]);
  });

  test("replacing a profile reports removed and added paths", () => {
    expect(pathDiff(["nix/linux", "nix/common"], ["nix/linux", "packages/apt.txt"])).toEqual([
      "- nix/common",
      "+ packages/apt.txt",
    ]);
  });
});
