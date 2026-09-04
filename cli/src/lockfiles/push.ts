import { decodeResponse, isJsonValue, PushResponse } from "@outfitting/contract";
import { Console, Effect } from "effect";

import { tryPromise, toError } from "@/lockfiles/effect";
import { isGitTrackedFile, normalizeSha256 } from "@/lockfiles/files";
import { request } from "@/lockfiles/request";
import type { PushLockfileOptions } from "@/lockfiles/types";
import { ui } from "@/ui";

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
        throw new Error("Worker returned an invalid push response.");
      }
      const decoded = decodeResponse(PushResponse, raw, "push");
      if (decoded === undefined) {
        throw new Error("Worker returned an invalid push response.");
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
