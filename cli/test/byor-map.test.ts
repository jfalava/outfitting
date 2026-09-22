import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
  parseConfirmedPaths,
  pathDiff,
  profileFromAnswers,
  saveByorWizardAnswers,
} from "@/commands/byor";
import { byorMapPath } from "@/config/paths";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("BYOR wizard", () => {
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
