import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const SECRET_SERVICE = "outfitting-lockfiles";
const TOKEN_SECRET_NAME = "api-token";
const URL_SECRET_NAME = "worker-url";

const HELP = `Usage: outfitting-manager lockfiles <command>

Commands:
  configure-worker [url]
  configure-token
  push <machine> <kind> <path> [--if-match <sha256>]
  pull <machine> <kind> [outPath]
  list <machine>
  history <machine> <kind>

The Worker URL and API token are stored in your OS keychain.`;

interface PushResult {
  hash: string;
  size: number;
}

interface HistoryEntry extends PushResult {
  created_at: string;
}

function requireArgs(args: string[], count: number, usage: string): string[] {
  if (args.length < count) {
    throw new Error(`Usage: ${usage}`);
  }

  return args;
}

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

async function apiToken(): Promise<string> {
  // Bun.secrets is experimental and does not isolate credentials between scripts running as the same OS user. That is acceptable for this personal tool, but the keychain entry is not a hard security boundary.
  const token = await Bun.secrets.get({
    service: SECRET_SERVICE,
    name: TOKEN_SECRET_NAME,
  });

  if (token) {
    return token;
  }

  return promptAndStoreApiToken();
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

async function endpoint(parts: string[]): Promise<string> {
  return `${await baseUrl()}/${parts.map(encodeURIComponent).join("/")}`;
}
interface CliRequestInit {
  body?: ArrayBuffer;
  headers?: Record<string, string>;
  method?: "PUT";
}

async function request(parts: string[], init: CliRequestInit = {}): Promise<Response> {
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
  const normalized = kind.toLowerCase();
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
    "repo-bun": "bun.lock",
    winget: "winget.json",
  };

  return names[normalized];
}

export function normalizeSha256(value: string): string {
  const hash = value.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error("Expected a 64-character SHA-256 hash.");
  }
  return hash;
}

async function push(args: string[]): Promise<void> {
  const required = requireArgs(
    args,
    3,
    "outfitting-manager lockfiles push <machine> <kind> <path> [--if-match <sha256>]",
  ) as [string, string, string, ...string[]];
  const [machine, kind, path, ...options] = required;
  let ifMatch: string | undefined;
  if (options.length > 0) {
    if (options.length !== 2 || options[0] !== "--if-match") {
      throw new Error(
        "Usage: outfitting-manager lockfiles push <machine> <kind> <path> [--if-match <sha256>]",
      );
    }
    ifMatch = normalizeSha256(options[1] as string);
  }
  const file = Bun.file(path);

  if (!(await file.exists())) {
    throw new Error(`File not found: ${path}`);
  }

  const headers: Record<string, string> = { "Content-Type": "text/plain; charset=utf-8" };
  if (ifMatch) {
    headers["If-Match"] = `"${ifMatch}"`;
  }

  const response = await request(["lockfiles", machine, kind], {
    method: "PUT",
    body: await file.arrayBuffer(),
    headers,
  });
  const result = (await response.json()) as PushResult;

  console.log(`${machine}/${kind} ${result.hash} (${result.size} bytes)`);
}

async function pull(args: string[]): Promise<void> {
  const [machine, kind, requestedPath] = requireArgs(
    args,
    2,
    "outfitting-manager lockfiles pull <machine> <kind> [outPath]",
  ) as [string, string, string?];
  const outPath = requestedPath ?? inferOutputPath(kind);

  if (!outPath) {
    throw new Error(`Cannot infer a filename for kind "${kind}"; provide outPath explicitly.`);
  }

  const response = await request(["lockfiles", machine, kind]);
  await mkdir(dirname(outPath), { recursive: true });
  const size = await Bun.write(outPath, await response.arrayBuffer());
  console.log(`Wrote ${size} bytes to ${outPath}`);
}

async function list(args: string[]): Promise<void> {
  const [machine] = requireArgs(args, 1, "outfitting-manager lockfiles list <machine>") as [string];
  const response = await request(["lockfiles", machine]);
  const kinds = (await response.json()) as unknown;

  if (!Array.isArray(kinds) || !kinds.every((kind) => typeof kind === "string")) {
    throw new Error("Worker returned an invalid kinds response.");
  }

  if (kinds.length === 0) {
    console.log(`No lockfiles tracked for ${machine}.`);
    return;
  }

  for (const kind of kinds) {
    console.log(kind);
  }
}

async function history(args: string[]): Promise<void> {
  const [machine, kind] = requireArgs(
    args,
    2,
    "outfitting-manager lockfiles history <machine> <kind>",
  ) as [string, string];
  const response = await request(["lockfiles", machine, kind, "history"]);
  const entries = (await response.json()) as HistoryEntry[];

  if (entries.length === 0) {
    console.log(`No history for ${machine}/${kind}.`);
    return;
  }

  console.log("CREATED_AT\tSIZE\tHASH");
  for (const entry of entries) {
    console.log(`${entry.created_at}\t${entry.size}\t${entry.hash}`);
  }
}

async function configureWorker(args: string[]): Promise<void> {
  const requestedUrl =
    args[0] ?? prompt("Lockfiles Worker URL (stored in your OS keychain):")?.trim();
  if (!requestedUrl) {
    throw new Error("A Worker URL is required.");
  }

  const url = await storeWorkerUrl(requestedUrl);
  console.log(`Stored Worker URL: ${url}`);
}

async function configureToken(): Promise<void> {
  await promptAndStoreApiToken();
  console.log("Stored API token in your OS keychain.");
}

export async function runLockfilesCli(args: string[]): Promise<void> {
  const [command, ...commandArgs] = args;

  switch (command) {
    case "configure-worker":
      await configureWorker(commandArgs);
      return;
    case "configure-token":
      await configureToken();
      return;
    case "push":
      await push(commandArgs);
      return;
    case "pull":
      await pull(commandArgs);
      return;
    case "list":
      await list(commandArgs);
      return;
    case "history":
      await history(commandArgs);
      return;
    case "help":
    case "--help":
    case "-h":
    case undefined:
      console.log(HELP);
      return;
    default:
      throw new Error(`Unknown lockfiles command: ${command}\n\n${HELP}`);
  }
}
