import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Effect } from "effect";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { writeRepoPath } from "@/config/repo";
import { CliFailure } from "@/errors";
import { pushLockfile } from "@/lockfiles";
import { runSetup } from "@/setup/run";
import { activateHomeManager } from "@/update/nix/activate";
import { buildNixSystem } from "@/update/nix/build";
import { updateNix } from "@/update/nix/run";

vi.mock("@/process", () => ({ which: async () => "/bin/nix" }));
vi.mock("@/update/nix/recovery", () => ({ readNixRecovery: async () => undefined }));
vi.mock("@/update/nix/symlinks", () => ({ ensureNixSymlinks: vi.fn(async () => undefined) }));
vi.mock("@/update/nix/build", () => ({
  buildNixSystem: vi.fn(async () => "/nix/store/test-system"),
}));
vi.mock("@/update/nix/activate", () => ({
  activateHomeManager: vi.fn(async () => undefined),
}));
vi.mock("@/lockfiles", () => ({
  pullLockfile: () => Effect.fail(new CliFailure({ message: "service unavailable" })),
  pushLockfile: vi.fn(() => Effect.void),
}));

const temporaryRoots: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(buildNixSystem).mockImplementation(async () => "/nix/store/test-system");
  vi.mocked(activateHomeManager).mockImplementation(async () => undefined);
  vi.stubEnv("OUTFITTING_REPO", "");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
  );
});

async function makeLinuxSource(profile: string, withLock = false) {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-nix-state-"));
  const repo = await mkdtemp(join(tmpdir(), "outfitting-nix-repo-"));
  temporaryRoots.push(stateRoot, repo);
  const flake = "system/home";
  await mkdir(join(repo, flake), { recursive: true });
  await writeFile(join(repo, flake, "flake.nix"), "{ outputs = {}; }\n");
  if (withLock) {
    await writeFile(join(repo, flake, "flake.lock"), '{ "version": 7 }\n');
  }
  await writeFile(
    join(repo, "outfitting.json"),
    `${JSON.stringify({
      schema: 1,
      profiles: {
        [profile]: {
          linux: {
            nix: { flake, attribute: "homeConfigurations.work.activationPackage" },
          },
        },
      },
    })}\n`,
  );
  await writeRepoPath(repo, { stateRoot, profile });
  return {
    stateRoot,
    repo,
    config: {
      stateRoot,
      machineId: "test:aarch64-linux",
      machineIdOverridden: true,
      linux: { profile },
    },
  };
}

test("setup persists and validates a selected local macOS BYOR checkout", async () => {
  const stateRoot = await mkdtemp(join(tmpdir(), "outfitting-macos-source-state-"));
  const repo = await mkdtemp(join(tmpdir(), "outfitting-macos-source-repo-"));
  temporaryRoots.push(stateRoot, repo);
  const flake = "system/macos";
  await mkdir(join(repo, flake), { recursive: true });
  await writeFile(join(repo, flake, "flake.nix"), "{ darwinConfigurations = {}; }\n");
  await writeFile(join(repo, flake, "darwin.nix"), "local macOS config\n");
  await writeFile(
    join(repo, "outfitting.json"),
    `${JSON.stringify({
      schema: 1,
      profiles: {
        workstation: { macos: { nix: { flake, attribute: "darwinConfigurations.work.system" } } },
      },
    })}\n`,
  );
  const fetcher = vi.fn(async () => new Response("unexpected network source"));

  await Effect.runPromise(
    runSetup({
      platform: "macos",
      stateRoot,
      repo,
      repoProfile: "workstation",
      skipSymlinks: true,
      fetcher,
    }),
  );

  expect(await readFile(join(stateRoot, "repo-path"), "utf8")).toBe(`${repo}\n`);
  expect(fetcher).not.toHaveBeenCalled();
});

test("Linux switch activates the selected BYOR Home Manager profile without pushing when disabled", async () => {
  const { config } = await makeLinuxSource("hm-work");
  await Effect.runPromise(updateNix({ action: "switch", config, noPush: true }));

  expect(buildNixSystem).toHaveBeenCalledWith(
    expect.objectContaining({ repo: expect.objectContaining({ homeManagerName: "hm-work" }) }),
  );
  expect(activateHomeManager).toHaveBeenCalled();
  expect(pushLockfile).not.toHaveBeenCalled();
});

test("Linux Nix actions use the selected local BYOR flake without fetching", async () => {
  const { config, repo } = await makeLinuxSource("hm-dev");
  const fetcher = vi.fn(async () => new Response("unexpected remote refresh"));
  await Effect.runPromise(
    updateNix({ action: "build", config, noPush: true, sourceFetcher: fetcher }),
  );

  expect(fetcher).not.toHaveBeenCalled();
  expect(buildNixSystem).toHaveBeenCalledWith(
    expect.objectContaining({ repo: expect.objectContaining({ root: repo }) }),
  );
});

test.skipIf(process.platform !== "darwin")(
  "publishes a lock generated during a macOS bootstrap",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "outfitting-macos-nix-push-"));
    temporaryRoots.push(root);
    const flake = join(root, "system", "macos");
    await mkdir(flake, { recursive: true });
    await writeFile(join(flake, "flake.nix"), "flake\n");
    await writeFile(join(flake, "darwin.nix"), "darwin\n");
    await writeFile(
      join(root, "outfitting.json"),
      `${JSON.stringify({
        schema: 1,
        profiles: {
          macos: {
            macos: {
              nix: { flake: "system/macos", attribute: "darwinConfigurations.macos.system" },
            },
          },
        },
      })}\n`,
    );
    const lockPath = join(flake, "flake.lock");
    vi.mocked(buildNixSystem).mockImplementation(async ({ repo }) => {
      await writeFile(join(repo.flakePath, "flake.lock"), '{ "version": 7 }\n');
      return "/nix/store/system";
    });
    const config = {
      stateRoot: join(root, "state"),
      machineId: "test:aarch64-darwin",
      machineIdOverridden: true,
    };

    await Effect.runPromise(
      updateNix({
        action: "build",
        config,
        repo: {
          root,
          flakePath: flake,
          darwinNixPath: join(flake, "darwin.nix"),
          flakeKind: "macos",
          systemAttr: "darwinConfigurations.macos.system",
        },
      }),
    );

    expect(pushLockfile).toHaveBeenCalledWith({
      machine: config.machineId,
      kind: "nix",
      path: lockPath,
    });
  },
);

test("publishes the selected Home Manager flake lock after a Linux action", async () => {
  const { config, repo } = await makeLinuxSource("hm-lock", true);
  const lockPath = join(repo, "system", "home", "flake.lock");

  await Effect.runPromise(updateNix({ action: "build", config }));

  expect(pushLockfile).toHaveBeenCalledWith({
    machine: config.machineId,
    kind: "nix",
    path: lockPath,
  });
});
