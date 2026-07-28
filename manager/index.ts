#!/usr/bin/env bun

import { runLockfilesCli } from "@outfitting/lockfiles/cli";

const HELP = `Usage: outfitting-manager <command>

Commands:
  lockfiles  Push and pull lockfile snapshots
  help       Show this help
`;

async function main(args: string[]): Promise<void> {
  const [command, ...commandArgs] = args;

  switch (command) {
    case "lockfiles":
      await runLockfilesCli(commandArgs);
      return;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      console.log(HELP);
      return;
    default:
      throw new Error(`Unknown command: ${command}\n\n${HELP}`);
  }
}

main(Bun.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
