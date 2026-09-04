import { Console, Effect, Option, Schema } from "effect";

import { tryPromise } from "@/lockfiles/effect";
import { request } from "@/lockfiles/request";
import { ui } from "@/ui";

const StringArraySchema = Schema.Array(Schema.String);
const decodeStringArray = Schema.decodeUnknownOption(StringArraySchema);

export const listLockfiles = (machine: string) =>
  Effect.gen(function* () {
    const response = yield* tryPromise(() => request(["lockfiles", machine]));
    const kinds = yield* tryPromise(async () => {
      const decoded = decodeStringArray(await response.json());
      if (Option.isNone(decoded)) {
        throw new Error("Worker returned an invalid kinds response.");
      }
      return decoded.value;
    });

    if (kinds.length === 0) {
      yield* Console.log(ui.muted(`No lockfiles tracked for ${machine}.`));
      return undefined;
    }

    for (const kind of kinds) {
      yield* Console.log(ui.key(kind));
    }
    return undefined;
  });
