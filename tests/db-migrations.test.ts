import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { players } from "@/lib/db/schema";
import { tempDir } from "./helpers/db";

describe("database", () => {
  it("applies migrations once and enforces pragmas", async () => {
    const dir = tempDir();
    const opened = openDatabase(path.join(dir, "t.sqlite"));
    expect((await runMigrations(opened)).applied).toBeGreaterThan(0);
    expect((await runMigrations(opened)).applied).toBe(0);
    expect(opened.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(opened.sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
    opened.sqlite.close();
  });

  it("persists data across restarts", async () => {
    const file = path.join(tempDir(), "t.sqlite");
    const first = openDatabase(file);
    await runMigrations(first);
    first.db
      .insert(players)
      .values({ id: "p1", displayName: "Ann", initialCincoRating: 3.5, currentCincoRating: 3.5, createdAt: new Date(), updatedAt: new Date() })
      .run();
    first.sqlite.close();
    const second = openDatabase(file);
    await runMigrations(second);
    expect(second.db.select().from(players).all()).toHaveLength(1);
    second.sqlite.close();
  });

  it("takes a consistent backup before migrating a database that already has data", async () => {
    const dir = tempDir();
    const opened = openDatabase(path.join(dir, "legacy.sqlite"));
    opened.sqlite.exec("create table legacy (id integer primary key); insert into legacy values (1);");
    const backupDir = path.join(dir, "backups");
    const result = await runMigrations(opened, { backupDir });
    expect(result.backupPath).not.toBeNull();
    expect(fs.existsSync(result.backupPath!)).toBe(true);
    const backup = openDatabase(result.backupPath!);
    expect(backup.sqlite.prepare("select count(*) as c from legacy").get()).toEqual({ c: 1 });
    backup.sqlite.close();
    opened.sqlite.close();
  });

  it("does not back up an empty database", async () => {
    const dir = tempDir();
    const opened = openDatabase(path.join(dir, "new.sqlite"));
    const result = await runMigrations(opened, { backupDir: path.join(dir, "backups") });
    expect(result.backupPath).toBeNull();
    opened.sqlite.close();
  });

  it("enforces foreign keys, unique names and check constraints", async () => {
    const opened = openDatabase(":memory:");
    await runMigrations(opened);
    const now = new Date();
    const base = { initialCincoRating: 3, currentCincoRating: 3, createdAt: now, updatedAt: now };
    opened.db.insert(players).values({ id: "a", displayName: "Sam", ...base }).run();
    expect(() => opened.db.insert(players).values({ id: "b", displayName: "sam", ...base }).run()).toThrow();
    expect(() =>
      opened.sqlite
        .prepare(
          "insert into match_players (match_id, player_id, team, position) values ('nope', 'a', 'A', 1)",
        )
        .run(),
    ).toThrow(/FOREIGN KEY/i);
    expect(() => opened.sqlite.prepare(`insert into matches (id, played_at, created_at, updated_at, format_target, score_a, score_b, status, rated, algorithm_version, config_snapshot, idempotency_key) values ('m', 1, 1, 1, 9, 1, 0, 'draft', 1, 'v', '{}', 'k')`).run()).toThrow(/CHECK/i);
    opened.sqlite.close();
  });
});
