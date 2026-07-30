#!/usr/bin/env bun

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect } from "effect";
import { CliError, Command } from "effect/unstable/cli";
import pc from "picocolors";

import { rootCommand } from "@/cli";

const args = Bun.argv.slice(2);
const program = Command.runWith(rootCommand, { version: "0.1.0" })(
  args.length === 0 ? ["--help"] : args,
).pipe(
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
