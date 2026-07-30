import { Console, Effect } from "effect";

import { tryPromise } from "@/lockfiles/effect";
import { request } from "@/lockfiles/request";
import { ui } from "@/ui";

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export const listLockfiles = (machine: string) =>
  Effect.gen(function* () {
    const response = yield* tryPromise(() => request(["lockfiles", machine]));
    const kinds = yield* tryPromise(() => response.json());

    if (!isStringArray(kinds)) {
      return yield* Effect.fail(new Error("Worker returned an invalid kinds response."));
    }

    if (kinds.length === 0) {
      yield* Console.log(ui.muted(`No lockfiles tracked for ${machine}.`));
      return undefined;
    }

    for (const kind of kinds) {
      yield* Console.log(ui.key(kind));
    }
    return undefined;
  });
