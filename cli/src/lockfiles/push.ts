import { decodeResponse, isJsonValue, PushResponse } from "@outfitting/contract";
import { Console, Effect } from "effect";

import { CliFailure } from "@/errors";
import { tryPromise, toError } from "@/lockfiles/effect";
import {
  inferOutputPath,
  isGitTrackedFile,
  KNOWN_LOCKFILE_KINDS,
  normalizeSha256,
  resolveKindSelection,
} from "@/lockfiles/files";
import { resolveLockfileMachine } from "@/lockfiles/machine";
import { request } from "@/lockfiles/request";
import type { PushLockfileOptions } from "@/lockfiles/types";
import { ui } from "@/ui";

const pushOne = ({
  machine,
  kind,
  path,
  ifMatch: requestedIfMatch,
}: {
  machine: string;
  kind: string;
  path: string;
  ifMatch?: string;
}) =>
  Effect.gen(function* () {
    const ifMatch = requestedIfMatch
      ? yield* Effect.try({
          try: () => normalizeSha256(requestedIfMatch),
          catch: toError,
        })
      : undefined;
    const file = Bun.file(path);

    if (!(yield* tryPromise(() => file.exists()))) {
      return yield* new CliFailure({ message: `File not found: ${path}` });
    }

    if (yield* tryPromise(() => isGitTrackedFile(path))) {
      return yield* new CliFailure({
        message: `Refusing to upload Git-tracked file: ${path}; KV is reserved for lock state that is not committed to Git.`,
      });
    }

    type RequestHeaders = Record<string, string>;
    const headers: RequestHeaders = {
      "Content-Type": "text/plain; charset=utf-8",
    };
    if (ifMatch) {
      headers["If-Match"] = `"${ifMatch}"`;
    }

    const body = yield* tryPromise(() => file.arrayBuffer());
    const response = yield* tryPromise(() =>
      request(["lockfiles", machine, kind], {
        method: "PUT",
        body,
        headers,
      }),
    );
    const result = yield* tryPromise(async () => {
      const raw: unknown = await response.json();
      if (!isJsonValue(raw)) {
        throw new CliFailure({ message: "Worker returned an invalid push response." });
      }
      const decoded = decodeResponse(PushResponse, raw, "push");
      if (decoded === undefined) {
        throw new CliFailure({ message: "Worker returned an invalid push response." });
      }
      return decoded;
    });

    yield* Console.log(
      ui.success(
        `${ui.key(`${machine}/${kind}`)} ${ui.hash(result.hash)} ${ui.muted(`(${result.size} bytes)`)}`,
      ),
    );
    return undefined;
  });

export const pushLockfile = ({
  machine: requestedMachine,
  kind,
  path,
  ifMatch: requestedIfMatch,
}: PushLockfileOptions) =>
  Effect.gen(function* () {
    const machine = yield* resolveLockfileMachine(requestedMachine);

    const selection = resolveKindSelection(kind);
    if (selection.mode === "one") {
      if (path === undefined) {
        return yield* new CliFailure({
          message: `path is required when pushing kind "${selection.kind}".`,
        });
      }
      yield* pushOne({
        machine,
        kind: selection.kind,
        path,
        ifMatch: requestedIfMatch,
      });
      return undefined;
    }

    if (path !== undefined) {
      return yield* new CliFailure({
        message: "path cannot be combined with kind all; each kind uses its default local path.",
      });
    }
    if (requestedIfMatch !== undefined) {
      return yield* new CliFailure({
        message: "--if-match cannot be combined with kind all.",
      });
    }

    let pushed = 0;
    for (const selectedKind of KNOWN_LOCKFILE_KINDS) {
      const localPath = inferOutputPath(selectedKind);
      if (localPath === undefined) {
        continue;
      }
      const file = Bun.file(localPath);
      if (!(yield* tryPromise(() => file.exists()))) {
        continue;
      }
      if (yield* tryPromise(() => isGitTrackedFile(localPath))) {
        yield* Console.log(ui.muted(`Skipped Git-tracked ${selectedKind} at ${localPath}.`));
        continue;
      }
      yield* pushOne({ machine, kind: selectedKind, path: localPath });
      pushed += 1;
    }

    if (pushed === 0) {
      yield* Console.log(
        ui.muted(
          `No local lockfiles found to push for ${machine}. Expected default paths for: ${KNOWN_LOCKFILE_KINDS.join(", ")}.`,
        ),
      );
    }
    return undefined;
  });
