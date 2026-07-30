#!/usr/bin/env bun

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect } from "effect";
import { CliError, Command } from "effect/unstable/cli";
import pc from "picocolors";

import { normalizeCommandAlias } from "@/arguments";
import { makeRootCommand } from "@/cli";

import packageJson from "./package.json" with { type: "json" };

const args = normalizeCommandAlias(Bun.argv.slice(2));
const program = Command.runWith(makeRootCommand(packageJson.version), {
  version: packageJson.version,
})(args.length === 0 ? ["--help"] : args).pipe(
  Effect.provide(BunServices.layer),
  Effect.catch((error) =>
    Effect.sync(() => {
      process.exitCode = 1;
      if (!CliError.isCliError(error)) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`${pc.red(pc.bold("Error:"))} ${message}`);
      }
    }),
  ),
);

BunRuntime.runMain(program, { disableErrorReporting: true });
