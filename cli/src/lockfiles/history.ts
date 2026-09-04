import { decodeResponse, HistoryResponse, isJsonValue } from "@outfitting/contract";
import { Console, Effect } from "effect";

import { tryPromise } from "@/lockfiles/effect";
import { request } from "@/lockfiles/request";
import { ui } from "@/ui";

export const historyLockfiles = (machine: string, kind: string) =>
  Effect.gen(function* () {
    const response = yield* tryPromise(() => request(["lockfiles", machine, kind, "history"]));
    const entries = yield* tryPromise(async () => {
      const raw: unknown = await response.json();
      if (!isJsonValue(raw)) {
        throw new Error("Worker returned an invalid history response.");
      }
      const decoded = decodeResponse(HistoryResponse, raw, "history");
      if (decoded === undefined) {
        throw new Error("Worker returned an invalid history response.");
      }
      return decoded;
    });

    if (entries.length === 0) {
      yield* Console.log(ui.muted(`No history for ${machine}/${kind}.`));
      return;
    }

    yield* Console.log(ui.heading("CREATED_AT\tSIZE\tHASH"));
    for (const entry of entries) {
      yield* Console.log(`${entry.created_at}\t${entry.size}\t${ui.hash(entry.hash)}`);
    }
  });
