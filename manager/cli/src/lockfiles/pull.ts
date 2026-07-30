import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { Console, Effect } from "effect";

import { ui } from "../ui";

import { tryPromise } from "./effect";
import { inferOutputPath } from "./files";
import { request } from "./request";
import type { PullLockfileOptions } from "./types";

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
