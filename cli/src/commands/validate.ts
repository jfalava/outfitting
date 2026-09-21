import { Console, Effect, Option } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { tryPromise } from "@/lockfiles/effect";
import { validateLinuxByorSource } from "@/source/contract";
import { ui } from "@/ui";

/** Validate a repository-owned Linux BYOR contract without applying it. */
export const validateCommand = Command.make(
  "validate",
  {
    repo: Flag.String("repo").pipe(
      Flag.optional,
      Flag.withDescription("Local BYOR repository (default: current directory)."),
    ),
    profile: Flag.String("profile").pipe(
      Flag.optional,
      Flag.withDescription("Profile to validate; required when the repository defines several."),
    ),
  },
  ({ repo, profile }) =>
    Effect.gen(function* () {
      const result = yield* tryPromise(() =>
        validateLinuxByorSource({
          root: Option.getOrElse(repo, () => process.cwd()),
          profile: Option.getOrUndefined(profile),
        }),
      );
      yield* Console.log(ui.success(`BYOR contract valid: ${result.root}`));
      yield* Console.log(`profile: ${result.profile}`);
      yield* Console.log(`backends: ${result.backends.join(", ")}`);
    }),
).pipe(
  Command.withDescription("Validate a repository-owned Linux profile without changing the system."),
);
