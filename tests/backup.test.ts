import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import { createUser } from "@/lib/auth/auth";
import { snapshotDatabase, verifyBackup } from "@/lib/backup";
import { openDatabase } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { ensureDefaultConfig } from "@/lib/services/config";
import { confirmNewMatch } from "@/lib/services/matches";
import { createPlayer } from "@/lib/services/players";
import { tempDir } from "./helpers/db";

async function seededDb() {
  const dir = tempDir();
  const opened = openDatabase(path.join(dir, "live.sqlite"));
  await runMigrations(opened);
  ensureDefaultConfig(opened.db, "UTC");
  const actor = createUser(opened.db, { email: "a@b.co", passwordHash: "x" });
  const ids = [3, 3.2, 3.4, 3.6].map((r, i) =>
    createPlayer(opened.db, actor, { displayName: `B${i}`, initialRating: r, duprRating: null, avatarUrl: null, notes: null }),
  );
  confirmNewMatch(opened.db, actor, {
    teamA: [ids[0], ids[1]], teamB: [ids[2], ids[3]], playedAtLocal: "2026-03-01T10:00", formatTarget: 11,
    scoreA: 11, scoreB: 4, rated: true, notes: null, idempotencyKey: "backup-test-1",
  }, { now: new Date("2026-06-01T00:00:00Z") });
  return { dir, opened };
}

describe("backup", () => {
  it("snapshots a live WAL database consistently and verifies it (including gzip)", async () => {
    const { dir, opened } = await seededDb();
    const snap = path.join(dir, "snap.sqlite");
    await snapshotDatabase(opened.sqlite, snap);
    const report = await verifyBackup(snap);
    expect(report).toMatchObject({ integrity: "ok", foreignKeyViolations: 0, players: 4, confirmedMatches: 1, ratingsConsistent: true });

    const gz = `${snap}.gz`;
    fs.writeFileSync(gz, zlib.gzipSync(fs.readFileSync(snap)));
    expect((await verifyBackup(gz)).ratingsConsistent).toBe(true);
    expect(fs.readdirSync(dir).some((f) => f.startsWith(".verify-"))).toBe(false);
    opened.sqlite.close();
  });

  it("detects stored ratings that no longer match a deterministic replay", async () => {
    const { dir, opened } = await seededDb();
    const snap = path.join(dir, "tampered.sqlite");
    await snapshotDatabase(opened.sqlite, snap);
    opened.sqlite.close();
    const tampered = openDatabase(snap);
    tampered.sqlite.prepare("update players set current_cinco_rating = current_cinco_rating + 1 where display_name = 'B0'").run();
    tampered.sqlite.close();
    const report = await verifyBackup(snap);
    expect(report.ratingsConsistent).toBe(false);
    expect(report.mismatchedPlayers).toHaveLength(1);
  });
});
