import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const SECRET_SERVICE = "outfitting-lockfiles";
const SECRET_NAME = "api-token";

const HELP = `Usage: outfitting-manager lockfiles <command>

Commands:
  push <machine> <kind> <path>
  pull <machine> <kind> [outPath]
  list <machine>
  history <machine> <kind>

Set OUTFITTING_LOCKFILES_URL to the deployed Worker URL.`;

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

function baseUrl(): string {
  const value = Bun.env.OUTFITTING_LOCKFILES_URL?.trim();

  if (!value) {
    throw new Error("OUTFITTING_LOCKFILES_URL is not set. Point it at the deployed Worker.");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("OUTFITTING_LOCKFILES_URL must be a valid URL.");
  }

  return parsed.toString().replace(/\/$/, "");
}

async function apiToken(): Promise<string> {
  // Bun.secrets is experimental and does not isolate credentials between scripts running as the same OS user. That is acceptable for this personal tool, but the keychain entry is not a hard security boundary.
  let token = await Bun.secrets.get({
    service: SECRET_SERVICE,
    name: SECRET_NAME,
  });

  if (token) {
    return token;
  }

  token = prompt("Lockfiles API token (stored in your OS keychain):")?.trim() ?? null;
  if (!token) {
    throw new Error("An API token is required.");
  }

  await Bun.secrets.set({
    service: SECRET_SERVICE,
    name: SECRET_NAME,
    value: token,
  });
  return token;
}

function endpoint(parts: string[]): string {
  return `${baseUrl()}/${parts.map(encodeURIComponent).join("/")}`;
}
interface CliRequestInit {
  body?: ArrayBuffer;
  headers?: Record<string, string>;
  method?: "PUT";
}

async function request(parts: string[], init: CliRequestInit = {}): Promise<Response> {
  const token = await apiToken();
  const headers = { ...init.headers, Authorization: `Bearer ${token}` };

  const response = await fetch(endpoint(parts), { ...init, headers });
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
    nix: "flake.lock",
    npm: "package-lock.json",
    "package-lock": "package-lock.json",
    winget: "winget.json",
  };

  return names[normalized];
}

async function push(args: string[]): Promise<void> {
  const [machine, kind, path] = requireArgs(
    args,
    3,
    "outfitting-manager lockfiles push <machine> <kind> <path>",
  ) as [string, string, string];
  const file = Bun.file(path);

  if (!(await file.exists())) {
    throw new Error(`File not found: ${path}`);
  }

  const response = await request(["lockfiles", machine, kind], {
    method: "PUT",
    body: await file.arrayBuffer(),
    headers: { "Content-Type": "text/plain; charset=utf-8" },
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

export async function runLockfilesCli(args: string[]): Promise<void> {
  const [command, ...commandArgs] = args;

  switch (command) {
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
