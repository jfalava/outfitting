import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { URL } from "node:url";

import { describe, expect, test } from "vitest";

import {
  ADVANCE_HEAD_SQL,
  DELETE_LOCKFILE_SQL,
  DELETE_PROMOTIONS_SQL,
  PROMOTE_HISTORY_SQL,
} from "@/index";

const migration = (name: string) =>
  readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");

const promotionArguments = (hash: string, parent: string | null) => [
  "machine",
  "nix",
  hash,
  parent,
  parent,
  "machine",
  "nix",
  parent,
];

const deletionArguments = (hash: string) => [
  "machine",
  "nix",
  hash,
  "machine",
  "nix",
  hash,
];

describe("lockfile head migration", () => {
  test("advances from the expected parent and ignores a stale parent", () => {
    const database = new DatabaseSync(":memory:");
    database.exec(migration("0001_create_lockfiles.sql"));
    database.exec(migration("0002_add_lockfile_heads.sql"));

    const firstHash = "1".padStart(64, "0");
    const secondHash = "2".padStart(64, "0");
    const insertLock = database.prepare(
      "INSERT INTO lockfiles (machine, kind, hash, size) VALUES (?, ?, ?, ?)",
    );
    const promote = database.prepare(PROMOTE_HISTORY_SQL);
    const advance = database.prepare(ADVANCE_HEAD_SQL);
    insertLock.run("machine", "nix", firstHash, 1);
    promote.run(...promotionArguments(firstHash, null));
    advance.run(
      ...promotionArguments(firstHash, null).slice(0, 3),
      null,
      "machine",
      "nix",
      null,
    );
    insertLock.run("machine", "nix", secondHash, 1);
    promote.run(...promotionArguments(secondHash, firstHash));
    advance.run(
      ...promotionArguments(secondHash, firstHash).slice(0, 3),
      firstHash,
      "machine",
      "nix",
      firstHash,
    );

    const getHead = database.prepare(
      "SELECT hash FROM lockfile_heads WHERE machine = ? AND kind = ?",
    );
    expect(getHead.get("machine", "nix")).toEqual({ hash: secondHash });
    expect(
      promote.run(...promotionArguments(firstHash, firstHash)).changes,
    ).toBe(0);
    expect(
      advance.run(
        "machine",
        "nix",
        firstHash,
        firstHash,
        "machine",
        "nix",
        firstHash,
      ).changes,
    ).toBe(0);
    expect(getHead.get("machine", "nix")).toEqual({ hash: secondHash });

    const deletePromotions = database.prepare(DELETE_PROMOTIONS_SQL);
    const deleteLockfile = database.prepare(DELETE_LOCKFILE_SQL);

    expect(deletePromotions.run(...deletionArguments(secondHash)).changes).toBe(
      0,
    );
    expect(deleteLockfile.run(...deletionArguments(secondHash)).changes).toBe(
      0,
    );
    expect(getHead.get("machine", "nix")).toEqual({ hash: secondHash });

    expect(deletePromotions.run(...deletionArguments(firstHash)).changes).toBe(
      1,
    );
    expect(deleteLockfile.run(...deletionArguments(firstHash)).changes).toBe(1);
    expect(
      database
        .prepare(
          "SELECT id FROM lockfiles WHERE machine = ? AND kind = ? AND hash = ?",
        )
        .get("machine", "nix", firstHash),
    ).toBeUndefined();

    database.close();
  });
});
