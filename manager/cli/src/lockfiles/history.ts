import { Console, Effect } from "effect";

import { tryPromise } from "@/lockfiles/effect";
import { request } from "@/lockfiles/request";
import type { HistoryEntry } from "@/lockfiles/types";
import { ui } from "@/ui";

export const historyLockfiles = (machine: string, kind: string) =>
  Effect.gen(function* () {
    const response = yield* tryPromise(() => request(["lockfiles", machine, kind, "history"]));
    const entries = (yield* tryPromise(() => response.json())) as HistoryEntry[];

    if (entries.length === 0) {
      yield* Console.log(ui.muted(`No history for ${machine}/${kind}.`));
      return;
    }

    yield* Console.log(ui.heading("CREATED_AT\tSIZE\tHASH"));
    for (const entry of entries) {
      yield* Console.log(`${entry.created_at}\t${entry.size}\t${ui.hash(entry.hash)}`);
    }
  });
