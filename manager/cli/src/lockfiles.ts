import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, relative, resolve as resolvePath } from "node:path";
import { promisify } from "node:util";

import { Console, Effect } from "effect";

import { ui } from "./ui";

const SECRET_SERVICE = "outfitting-lockfiles";
const TOKEN_SECRET_NAME = "api-token";
const URL_SECRET_NAME = "worker-url";
const execFileAsync = promisify(execFile);

interface PushResult {
  hash: string;
  size: number;
}

interface HistoryEntry extends PushResult {
  created_at: string;
}

export interface PushLockfileOptions {
  machine: string;
  kind: string;
  path: string;
  ifMatch?: string;
}

export interface PullLockfileOptions {
  machine: string;
  kind: string;
  outPath?: string;
}

const toError = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

const tryPromise = <A>(try_: () => Promise<A>) =>
  Effect.tryPromise({
    try: try_,
    catch: toError,
  });

export function normalizeWorkerUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("Worker URL must be a valid URL.");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("Worker URL must use HTTP or HTTPS.");
  }

  return parsed.toString().replace(/\/$/, "");
}

async function storeWorkerUrl(value: string): Promise<string> {
  const url = normalizeWorkerUrl(value);
  await Bun.secrets.set({
    service: SECRET_SERVICE,
    name: URL_SECRET_NAME,
    value: url,
  });
  return url;
}

async function baseUrl(): Promise<string> {
  const stored = await Bun.secrets.get({
    service: SECRET_SERVICE,
    name: URL_SECRET_NAME,
  });

  if (stored) {
    return normalizeWorkerUrl(stored);
  }

  const value = prompt("Lockfiles Worker URL (stored in your OS keychain):")?.trim();
  if (!value) {
    throw new Error("A Worker URL is required.");
  }

  return storeWorkerUrl(value);
}

type TerminalEscapeState = "normal" | "escape" | "csi";

function consumeTerminalEscape(
  character: string,
  state: TerminalEscapeState,
): TerminalEscapeState | undefined {
  if (state === "escape") {
    return character === "[" ? "csi" : "normal";
  }
  if (state === "csi") {
    return character >= "@" && character <= "~" ? "normal" : "csi";
  }
  return character === "\u001b" ? "escape" : undefined;
}

async function maskedPrompt(message: string): Promise<string | null> {
  const input = process.stdin;
  const output = process.stderr;

  if (!input.isTTY || typeof input.setRawMode !== "function") {
    throw new Error("API token entry requires an interactive terminal.");
  }

  output.write(message);
  input.setEncoding("utf8");
  input.setRawMode(true);
  input.resume();

  return new Promise((resolve, reject) => {
    let value = "";
    let escapeState: TerminalEscapeState = "normal";

    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
    };

    const finish = (result: string | null) => {
      cleanup();
      resolve(result);
    };

    const onData = (chunk: string) => {
      for (const character of chunk) {
        const nextEscapeState = consumeTerminalEscape(character, escapeState);
        if (nextEscapeState) {
          escapeState = nextEscapeState;
          continue;
        }

        if (character === "\r" || character === "\n") {
          finish(value);
          return;
        }

        if (character === "\u0003") {
          cleanup();
          reject(new Error("API token entry cancelled."));
          return;
        }

        if (character === "\u007f" || character === "\b") {
          if (value.length > 0) {
            value = Array.from(value).slice(0, -1).join("");
            output.write("\b \b");
          }
          continue;
        }

        if (character >= " " && character !== "\u007f") {
          value += character;
          output.write("*");
        }
      }
    };

    input.on("data", onData);
  });
}

async function promptAndStoreApiToken(): Promise<string> {
  const token =
    (await maskedPrompt("Lockfiles API token (stored in your OS keychain): "))?.trim() ?? null;
  if (!token) {
    throw new Error("An API token is required.");
  }

  await Bun.secrets.set({
    service: SECRET_SERVICE,
    name: TOKEN_SECRET_NAME,
    value: token,
  });
  return token;
}

async function apiToken(): Promise<string> {
  // Bun.secrets is experimental and does not isolate credentials between scripts running as the same OS user. That is acceptable for this personal tool, but the keychain entry is not a hard security boundary.
  const token = await Bun.secrets.get({
    service: SECRET_SERVICE,
    name: TOKEN_SECRET_NAME,
  });

  return token || promptAndStoreApiToken();
}

async function endpoint(parts: ReadonlyArray<string>): Promise<string> {
  return `${await baseUrl()}/${parts.map(encodeURIComponent).join("/")}`;
}

interface CliRequestInit {
  body?: ArrayBuffer;
  headers?: Record<string, string>;
  method?: "PUT";
}

async function request(parts: ReadonlyArray<string>, init: CliRequestInit = {}): Promise<Response> {
  const url = await endpoint(parts);
  const token = await apiToken();
  const headers = { ...init.headers, Authorization: `Bearer ${token}` };

  const response = await fetch(url, { ...init, headers });
  if (response.ok) {
    return response;
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  let detail = response.statusText;
  if (contentType.includes("application/json")) {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") {
      detail = body.error;
    }
  } else {
    detail = (await response.text()) || detail;
  }

  throw new Error(`Worker returned ${response.status}: ${detail}`);
}

export function inferOutputPath(kind: string): string | undefined {
  const names: Record<string, string> = {
    brew: "Brewfile",
    brewfile: "Brewfile",
    bun: "bun.lock",
    flake: "flake.lock",
    homebrew: "Brewfile",
    "homebrew-inventory": "homebrew-inventory.txt",
    nix: "flake.lock",
    npm: "package-lock.json",
    "package-lock": "package-lock.json",
    winget: "winget.json",
  };

  return names[kind.toLowerCase()];
}

export async function isGitTrackedFile(path: string): Promise<boolean> {
  const absolutePath = resolvePath(path);

  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", dirname(absolutePath), "rev-parse", "--show-toplevel"],
      { encoding: "utf8" },
    );
    const root = stdout.trim();
    if (!root) {
      return false;
    }

    const repositoryPath = relative(root, absolutePath);
    await execFileAsync("git", ["-C", root, "ls-files", "--error-unmatch", "--", repositoryPath]);
    return true;
  } catch {
    return false;
  }
}

export function normalizeSha256(value: string): string {
  const hash = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error("Expected a 64-character SHA-256 hash.");
  }
  return hash;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

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

export const listLockfiles = (machine: string) =>
  Effect.gen(function* () {
    const response = yield* tryPromise(() => request(["lockfiles", machine]));
    const kinds = yield* tryPromise(() => response.json());

    if (!isStringArray(kinds)) {
      return yield* Effect.fail(new Error("Worker returned an invalid kinds response."));
    }

    if (kinds.length === 0) {
      yield* Console.log(ui.muted(`No lockfiles tracked for ${machine}.`));
      return undefined;
    }

    for (const kind of kinds) {
      yield* Console.log(ui.key(kind));
    }
    return undefined;
  });

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

export const configureWorker = (requestedUrl?: string) =>
  Effect.gen(function* () {
    const value =
      requestedUrl ?? prompt("Lockfiles Worker URL (stored in your OS keychain):")?.trim();
    if (!value) {
      return yield* Effect.fail(new Error("A Worker URL is required."));
    }

    const url = yield* tryPromise(() => storeWorkerUrl(value));
    yield* Console.log(ui.success(`Stored Worker URL: ${ui.key(url)}`));
    return undefined;
  });

export const configureToken = Effect.gen(function* () {
  yield* tryPromise(promptAndStoreApiToken);
  yield* Console.log(ui.success("Stored API token in your OS keychain."));
});
