import { Console, Effect } from "effect";

import { ui } from "../ui";

import { tryPromise, toError } from "./effect";
import { isGitTrackedFile, normalizeSha256 } from "./files";
import { request } from "./request";
import type { PushLockfileOptions, PushResult } from "./types";

export const pushLockfile = ({
  machine,
  kind,
  path,
  ifMatch: requestedIfMatch,
}: PushLockfileOptions) =>
  Effect.gen(function* () {
    const ifMatch = requestedIfMatch
      ? yield* Effect.try({
          try: () => normalizeSha256(requestedIfMatch),
          catch: toError,
        })
      : undefined;
    const file = Bun.file(path);

    if (!(yield* tryPromise(() => file.exists()))) {
      return yield* Effect.fail(new Error(`File not found: ${path}`));
    }

    if (yield* tryPromise(() => isGitTrackedFile(path))) {
      return yield* Effect.fail(
        new Error(
          `Refusing to upload Git-tracked file: ${path}; KV is reserved for lock state that is not committed to Git.`,
        ),
      );
    }

    const headers: Record<string, string> = {
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
    const result = yield* tryPromise(() => response.json() as Promise<PushResult>);

    yield* Console.log(
      ui.success(
        `${ui.key(`${machine}/${kind}`)} ${ui.hash(result.hash)} ${ui.muted(`(${result.size} bytes)`)}`,
      ),
    );
    return undefined;
  });
