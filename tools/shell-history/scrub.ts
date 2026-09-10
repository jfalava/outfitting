#!/usr/bin/env bun
/**
 * Scrub secrets from shell history files (zsh + PowerShell/PSReadLine).
 *
 * Requires Bun on PATH (present on macOS, WSL, and Windows machines).
 *
 *   bun tools/shell-history/scrub.ts                  # auto-scrub entries matching SECRET_PATTERN
 *   bun tools/shell-history/scrub.ts --redact         # blank them out instead of deleting
 *   bun tools/shell-history/scrub.ts -i               # interactive review of suspicious entries
 *   bun tools/shell-history/scrub.ts -i --all         # interactive review of every entry
 *   bun tools/shell-history/scrub.ts -i --search jwt  # interactive review matching a regex
 *   --file <path> overrides the target (default: ~/.zsh_history, then PSReadLine history)
 *   --dry-run         never writes
 *
 * Formats are auto-detected: zsh extended history (": <ts>:<dur>;<cmd>" with
 * backslash continuation lines) or PSReadLine's one-command-per-line file.
 *
 * Interactive keys: d=delete  r=redact  k=keep  a=delete all remaining  q=quit
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Keep in sync with zshaddhistory (system/common/zsh/outfitting.plugin.zsh) and
// $secretHistoryPattern (dotfiles/Microsoft.PowerShell_profile.ps1).
const SECRET_PATTERN =
	/[A-Za-z0-9_]*(token|secret|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key|credentials?)[A-Za-z0-9_]*\s*[=:]|(--(token|password|passwd|secret|secret[-_]access[-_]key|client[-_]secret|api[_-]?key|access[_-]?token|passphrase)(=|\s))|(authorization\s*:)/i;

// Signals that an entry MIGHT contain a secret no pattern can name. These are
// never auto-deleted; they mark entries for interactive review. Blob patterns
// use explicit boundaries so `_`-prefixed tokens (ghp_...) are caught too.
const SUSPICIOUS: Array<[string, RegExp]> = [
	["jwt", /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./],
	["url-creds", /[a-z][a-z0-9+.-]*:\/\/[^\s/@]+:[^\s/@]+@/i],
	["hex-blob", /(^|[^A-Za-z0-9])[0-9a-f]{32,}(?![a-z0-9])/i],
	["base64-blob", /(^|[^A-Za-z0-9+/])[A-Za-z0-9+/]{32,}={0,2}(?![A-Za-z0-9+/])/],
];

type Entry = { lines: string[] };

type Format = "zsh" | "psreadline";

function defaultFile(): string | null {
	const candidates = [
		process.env.HISTFILE,
		join(homedir(), ".zsh_history"),
		join(homedir(), ".local/share/powershell/PSReadLine/ConsoleHost_history.txt"),
		join(homedir(), "AppData/Roaming/Microsoft/Windows/PowerShell/PSReadLine/ConsoleHost_history.txt"),
	];
	for (const c of candidates) {
		if (c && existsSync(c)) return c;
	}
	return null;
}

function detectFormat(lines: string[]): Format {
	return /^:\s*\d+:\d+;/.test(lines[0] ?? "") ? "zsh" : "psreadline";
}

function parseEntries(lines: string[], format: Format): Entry[] {
	if (format === "psreadline") {
		return lines.filter((l) => l.length > 0).map((l) => ({ lines: [l] }));
	}
	const entries: Entry[] = [];
	for (const line of lines) {
		if (line.startsWith(":") || entries.length === 0) {
			entries.push({ lines: [line] });
		} else {
			entries.at(-1)!.lines.push(line);
		}
	}
	return entries;
}

function serialize(entries: Entry[], format: Format): string {
	const kept = entries.filter((e) => e.lines.length > 0);
	if (format === "psreadline") return kept.map((e) => e.lines[0]).join("\n") + "\n";
	return kept.map((e) => e.lines.join("\n") + "\n").join("");
}

function entryText(entry: Entry, fmt: Format): string {
	return fmt === "zsh"
		? entry.lines.map((l) => l.replace(/^:\s*\d+:\d+;/, "")).join("\n")
		: entry.lines.join("\n");
}

function redactEntry(entry: Entry, fmt: Format): Entry {
	if (fmt === "psreadline") return { lines: ["# redacted"] };
	// Keep the timestamp, blank the command (continuation lines are dropped).
	return { lines: [entry.lines[0].replace(/^(:\s*\d+):\d+;.*$/, "$1:0;")] };
}

function atomicWrite(path: string, content: string): void {
	const tmp = `${path}.scrub-tmp-${process.pid}`;
	writeFileSync(tmp, content);
	renameSync(tmp, path);
}

function preview(entry: Entry, fmt: Format): string {
	const flat = entryText(entry, fmt).replace(/\n/g, " ⏎ ");
	return flat.length > 100 ? `${flat.slice(0, 100)}...` : flat;
}

// ---- key reading (raw single-key when on a TTY, newline-based otherwise) ----

let pipedKeys: string[] | null = null;

async function readKey(): Promise<string> {
	if (process.stdin.isTTY) {
		process.stdin.setRawMode(true);
		try {
			const [chunk] = await new Promise<[Buffer]>((resolve, reject) => {
				const onData = (c: Buffer) => {
					cleanup();
					resolve([c]);
				};
				const onErr = (e: Error) => {
					cleanup();
					reject(e);
				};
				const cleanup = () => {
					process.stdin.off("data", onData);
					process.stdin.off("error", onErr);
				};
				process.stdin.on("data", onData);
				process.stdin.on("error", onErr);
			});
			return chunk.toString();
		} finally {
			process.stdin.setRawMode(false);
		}
	}
	return pipedKeys?.shift() ?? "q";
}

async function main() {
	const args = process.argv.slice(2);
	const flag = (name: string) => args.includes(name);
	const value = (name: string) => {
		const i = args.indexOf(name);
		return i >= 0 ? args[i + 1] : undefined;
	};

	const dryRun = flag("--dry-run");
	const interactive = flag("-i") || flag("--interactive");
	const redactMode = flag("--redact");
	const reviewAll = flag("--all");
	const search = value("--search");
	const file = value("--file") ?? defaultFile();
	if (!file) {
		console.error("No history file found. Pass --file <path>.");
		process.exit(1);
	}
	if (search && !interactive) {
		console.error("--search only applies in interactive mode (-i).");
		process.exit(1);
	}

	const lines = readFileSync(file, "utf8").split("\n");
	if (lines.at(-1) === "") lines.pop();
	const format = detectFormat(lines);
	const entries = parseEntries(lines, format);

	const isCandidate = (e: Entry): string | null => {
		const text = entryText(e, format);
		if (reviewAll) return "";
		if (search && new RegExp(search, "i").test(text)) return "";
		if (SECRET_PATTERN.test(text)) return "pattern";
		return SUSPICIOUS.find(([, re]) => re.test(text))?.[0] ?? null;
	};

	let deleted = 0;
	let redacted = 0;

	if (!interactive) {
		const kept: Entry[] = [];
		for (const entry of entries) {
			if (SECRET_PATTERN.test(entryText(entry, format))) {
				console.log(`${redactMode ? "redacted" : "dropped"}: ${preview(entry, format)}`);
				if (redactMode) {
					kept.push(redactEntry(entry, format));
					redacted++;
				} else {
					deleted++;
				}
			} else {
				kept.push(entry);
			}
		}
		if (deleted + redacted === 0) {
			console.log("No pattern-matching entries found.");
			return;
		}
		console.log(
			`${deleted + redacted} of ${entries.length} entries ${redactMode ? "redacted" : "match"}.`,
		);
		if (dryRun) {
			console.log("Dry run: file not modified.");
			return;
		}
		atomicWrite(file, serialize(kept, format));
		console.log(`Scrubbed ${file}.`);
		return;
	}

	// ---- interactive review ----
	const pending = entries.filter((e) => isCandidate(e) !== null);
	if (pending.length === 0) {
		console.log("No candidate entries to review.");
		return;
	}
	console.log(
		`Reviewing ${pending.length} of ${entries.length} entries. ` +
			"Keys: d=delete r=redact k=keep a=delete all remaining q=quit",
	);
	if (!process.stdin.isTTY) {
		// Piped input (e.g. tests): one command per line.
		const input = readFileSync(0, "utf8");
		pipedKeys = input
			.split(/\r?\n/)
			.filter((l) => l.length > 0)
			.flatMap((l) => l.split(""));
	}

	for (const entry of pending) {
		const why = isCandidate(entry) || "";
		const tag = why ? ` [${why}]` : "";
		console.log(`\n•${tag} ${preview(entry, format)}`);
		const key = (await readKey()).trim().toLowerCase() || "k";
		if (key === "d") {
			entry.lines = [];
			deleted++;
			console.log("  deleted");
		} else if (key === "r") {
			const replacement = redactEntry(entry, format);
			entry.lines = replacement.lines;
			redacted++;
			console.log("  redacted");
		} else if (key === "a") {
			for (const rest of pending) {
				if (rest.lines.length > 0) {
					rest.lines = [];
					deleted++;
				}
			}
			console.log("  deleted all remaining");
			break;
		} else if (key === "q") {
			break;
		} else {
			console.log("  kept");
		}
	}

	if (dryRun) {
		console.log(`\nDry run: ${deleted} to delete, ${redacted} to redact. File not modified.`);
		return;
	}
	if (deleted + redacted === 0) {
		console.log("\nNothing changed.");
		return;
	}
	atomicWrite(file, serialize(entries, format));
	console.log(`\nScrubbed ${file}: ${deleted} deleted, ${redacted} redacted.`);
}

await main();
