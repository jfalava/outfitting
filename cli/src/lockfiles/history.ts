import { decodeResponse, HistoryResponse, isJsonValue } from "@outfitting/contract";
import { Console, Effect } from "effect";

import { CliFailure } from "@/errors";
import { tryPromise } from "@/lockfiles/effect";
import { resolveKindSelection } from "@/lockfiles/files";
import { fetchLockfileKinds } from "@/lockfiles/list";
import { resolveLockfileMachine } from "@/lockfiles/machine";
import { request } from "@/lockfiles/request";
import type { HistoryLockfileOptions } from "@/lockfiles/types";
import { ui } from "@/ui";

const historyForKind = (machine: string, kind: string) =>
  Effect.gen(function* () {
    const response = yield* tryPromise(() => request(["lockfiles", machine, kind, "history"]));
    const entries = yield* tryPromise(async () => {
      const raw: unknown = await response.json();
      if (!isJsonValue(raw)) {
        throw new CliFailure({ message: "Worker returned an invalid history response." });
      }
      const decoded = decodeResponse(HistoryResponse, raw, "history");
      if (decoded === undefined) {
        throw new CliFailure({ message: "Worker returned an invalid history response." });
      }
      return decoded;
    });

    if (entries.length === 0) {
      yield* Console.log(ui.muted(`No history for ${machine}/${kind}.`));
      return;
    }

    yield* Console.log(ui.heading(`${machine}/${kind}`));
    yield* Console.log(ui.heading("CREATED_AT\tSIZE\tHASH"));
    for (const entry of entries) {
      yield* Console.log(`${entry.created_at}\t${entry.size}\t${ui.hash(entry.hash)}`);
    }
  });

export const historyLockfiles = (options: HistoryLockfileOptions = {}) =>
  Effect.gen(function* () {
    const machine = yield* resolveLockfileMachine(options.machine);

    const selection = resolveKindSelection(options.kind);
    if (selection.mode === "one") {
      yield* historyForKind(machine, selection.kind);
      return;
    }

    const kinds = yield* fetchLockfileKinds(machine);
    if (kinds.length === 0) {
      yield* Console.log(ui.muted(`No lockfiles tracked for ${machine}.`));
      return;
    }
    for (const [index, kind] of kinds.entries()) {
      if (index > 0) {
        yield* Console.log("");
      }
      yield* historyForKind(machine, kind);
    }
  });
