import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { Console, Effect } from "effect";

import { tryPromise } from "@/lockfiles/effect";
import { inferOutputPath } from "@/lockfiles/files";
import { request } from "@/lockfiles/request";
import type { PullLockfileOptions } from "@/lockfiles/types";
import { ui } from "@/ui";

export const pullLockfile = ({ machine, kind, outPath: requestedPath }: PullLockfileOptions) =>
  Effect.gen(function* () {
    const outPath = requestedPath ?? inferOutputPath(kind);
    if (!outPath) {
      return yield* Effect.fail(
        new Error(`Cannot infer a filename for kind "${kind}"; provide out-path explicitly.`),
      );
    }

    const response = yield* tryPromise(() => request(["lockfiles", machine, kind]));
    yield* tryPromise(() => mkdir(dirname(outPath), { recursive: true }));
    const contents = yield* tryPromise(() => response.arrayBuffer());
    const size = yield* tryPromise(() => Bun.write(outPath, contents));

    yield* Console.log(ui.success(`Wrote ${ui.key(`${size} bytes`)} to ${ui.key(outPath)}`));
    return undefined;
  });
