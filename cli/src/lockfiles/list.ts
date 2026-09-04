import { decodeResponse, isJsonValue, KindsResponse } from "@outfitting/contract";
import { Console, Effect } from "effect";

import { tryPromise } from "@/lockfiles/effect";
import { request } from "@/lockfiles/request";
import { ui } from "@/ui";

export const listLockfiles = (machine: string) =>
  Effect.gen(function* () {
    const response = yield* tryPromise(() => request(["lockfiles", machine]));
    const kinds = yield* tryPromise(async () => {
      const raw: unknown = await response.json();
      if (!isJsonValue(raw)) {
        throw new Error("Worker returned an invalid kinds response.");
      }
      const decoded = decodeResponse(KindsResponse, raw, "kinds");
      if (decoded === undefined) {
        throw new Error("Worker returned an invalid kinds response.");
      }
      return decoded;
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
