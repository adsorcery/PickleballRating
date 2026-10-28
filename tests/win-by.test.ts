import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { openDatabase } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { createUser } from "@/lib/auth/auth";
import { matches, matchPlayers, players, predictionSnapshots, ratingHistory, users } from "@/lib/db/schema";
import {
  computeMatchUpdate,
  DEFAULT_RATING_CONFIG,
  gameWinProbability,
  GAME_TARGETS,
  predictMatch,
  replay,
  validateScore,
  WIN_BY_OPTIONS,
  type WinBy,
} from "@/lib/rating";
import { getLeaderboard } from "@/lib/queries";
import { confirmNewMatch, correctMatch, previewMatch, saveDraft, type MatchInput } from "@/lib/services/matches";
import { createPlayer } from "@/lib/services/players";
import { getPreferredWinBy, setPreferredWinBy } from "@/lib/services/preferences";
import { changedMatchIds, loadReplayInputs, rebuildRatings } from "@/lib/services/replay-store";
import { memoryDb, tempDir } from "./helpers/db";

/** Independent oracle: a final score is valid iff it is terminal and the previous rally was not. */
function oracleValid(a: number, b: number, n: number, winBy: WinBy): boolean {
  const terminal = (x: number, y: number) =>
    winBy === 1 ? x >= n || y >= n : (x >= n || y >= n) && Math.abs(x - y) >= 2;
  if (!terminal(a, b)) return false;
  const aScoredLast = a > 0 && !terminal(a - 1, b);
  const bScoredLast = b > 0 && !terminal(a, b - 1);
  return aScoredLast || bScoredLast;
}

describe("validateScore with win by 1 and win by 2", () => {
  it("matches the oracle for every score, target and rule (both teams winning)", () => {
    for (const n of GAME_TARGETS) {
      for (const winBy of WIN_BY_OPTIONS) {
        for (let a = 0; a <= 40; a++) {
          for (let b = 0; b <= 40; b++) {
            expect(validateScore(a, b, n, winBy).valid, `${a}-${b} to ${n} win by ${winBy}`).toBe(oracleValid(a, b, n, winBy));
          }
        }
      }
    }
  });

  it("accepts and rejects the documented examples (game to 11)", () => {
    for (const [a, b] of [[11, 10], [11, 9], [11, 5], [10, 11], [9, 11], [0, 11]]) expect(validateScore(a, b, 11, 1).valid).toBe(true);
    for (const [a, b] of [[10, 10], [12, 10], [12, 11], [10, 9], [11, 11]]) expect(validateScore(a, b, 11, 1).valid).toBe(false);
    for (const [a, b] of [[11, 9], [12, 10], [13, 11], [9, 11], [10, 12]]) expect(validateScore(a, b, 11, 2).valid).toBe(true);
    for (const [a, b] of [[11, 10], [10, 11], [10, 10], [13, 10]]) expect(validateScore(a, b, 11, 2).valid).toBe(false);
  });

  it("covers 15 and 21 explicitly", () => {
    expect(validateScore(15, 14, 15, 1).valid).toBe(true);
    expect(validateScore(15, 14, 15, 2).valid).toBe(false);
    expect(validateScore(21, 20, 21, 1).valid).toBe(true);
    expect(validateScore(22, 20, 21, 2).valid).toBe(true);
    expect(validateScore(22, 20, 21, 1).valid).toBe(false);
    expect(validateScore(11, 9, 15, 1).valid).toBe(false);
  });

  it("rejects an unknown rule", () => {
    expect(validateScore(11, 5, 11, 3 as WinBy).valid).toBe(false);
  });
});

describe("win-by-1 win probability", () => {
  const choose = (n: number, k: number) => {
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return r;
  };
  /** P(reach n first) = sum_k C(n-1+k, k) p^n q^k */
  const closedForm = (p: number, n: number) => {
    let sum = 0;
    for (let k = 0; k < n; k++) sum += choose(n - 1 + k, k) * p ** n * (1 - p) ** k;
    return sum;
  };

  it.each(GAME_TARGETS)("matches the negative-binomial closed form (n=%i)", (n) => {
    for (const p of [0.05, 0.3, 0.5, 0.55, 0.7, 0.95]) expect(gameWinProbability(p, n, 1)).toBeCloseTo(closedForm(p, n), 12);
  });

  it("matches hand-computed small cases", () => {
    expect(gameWinProbability(0.7, 1, 1)).toBeCloseTo(0.7, 12);
    expect(gameWinProbability(0.7, 2, 1)).toBeCloseTo(0.49 + 2 * 0.49 * 0.3, 12);
  });

  it.each(GAME_TARGETS)("is 0.5 at p=0.5, complementary, and weaker than win-by-2 for the favourite (n=%i)", (n) => {
    expect(gameWinProbability(0.5, n, 1)).toBeCloseTo(0.5, 12);
    for (const p of [0.2, 0.45, 0.6, 0.8]) {
      expect(gameWinProbability(p, n, 1) + gameWinProbability(1 - p, n, 1)).toBeCloseTo(1, 12);
    }
    expect(gameWinProbability(0.6, n, 1)).toBeLessThan(gameWinProbability(0.6, n, 2));
    expect(gameWinProbability(0.6, n, 1)).toBeGreaterThan(0.6);
  });

  it("changes the win probability but never the expected point share", () => {
    for (const n of GAME_TARGETS) {
      const one = predictMatch([3.2, 3.6, 3.0, 3.1], n, DEFAULT_RATING_CONFIG, 1);
      const two = predictMatch([3.2, 3.6, 3.0, 3.1], n, DEFAULT_RATING_CONFIG, 2);
      expect(one.pointShareA).toBe(two.pointShareA);
      expect(one.winProbA).not.toBe(two.winProbA);
      expect(one.winProbA + one.winProbB).toBeCloseTo(1, 12);
      expect(one.winBy).toBe(1);
    }
    const equal = predictMatch([3.5, 3.5, 3.5, 3.5], 11, DEFAULT_RATING_CONFIG, 1);
    expect(equal.winProbA).toBeCloseTo(0.5, 12);
  });
});

describe("match entry and confirmation", () => {
  let db: Db;
  let actor: string;
  let ids: string[];
  let n = 0;
  const NOW = new Date("2026-06-01T12:00:00Z");

  const input = (over: Partial<MatchInput> = {}): MatchInput => ({
    teamA: [ids[0], ids[1]],
    teamB: [ids[2], ids[3]],
    playedAtLocal: "2026-03-01T10:00",
    formatTarget: 11,
    winBy: 1,
    scoreA: 11,
    scoreB: 10,
    rated: true,
    notes: null,
    idempotencyKey: `winby-key-${++n}`,
    ...over,
  });

  beforeEach(async () => {
    ({ db } = await memoryDb("UTC"));
    actor = createUser(db, { email: "a@b.co", passwordHash: "x" });
    ids = [3.0, 3.2, 3.4, 3.6].map((r, i) =>
      createPlayer(db, actor, { displayName: `W${i}`, initialRating: r, duprRating: null, avatarUrl: null, notes: null }),
    );
  });

  it("ACCEPTANCE: 11–10 to 11 with win by 1 saves and recalculates all four players with the existing formula", () => {
    const before = ids.map((id) => db.select().from(players).where(eq(players.id, id)).get()!.currentCincoRating);
    const out = confirmNewMatch(db, actor, input(), { now: NOW });
    const row = db.select().from(matches).where(eq(matches.id, out.matchId)).get()!;
    expect(row).toMatchObject({ status: "confirmed", winBy: 1, scoreA: 11, scoreB: 10 });

    // Existing formula, computed independently from the actual 11/21 point share.
    const expected = computeMatchUpdate({
      ratings: [before[0], before[1], before[2], before[3]],
      priorGames: [0, 0, 0, 0],
      scoreA: 11,
      scoreB: 10,
      kEff: DEFAULT_RATING_CONFIG.k,
      config: DEFAULT_RATING_CONFIG,
    });
    expect(expected.actualShareA).toBeCloseTo(11 / 21, 12);
    ids.forEach((id, i) => {
      const after = db.select().from(players).where(eq(players.id, id)).get()!.currentCincoRating;
      expect(after).toBe(before[i] + expected.deltas[i]);
    });
    expect(db.select().from(ratingHistory).all()).toHaveLength(4);
    const snapshot = db.select().from(predictionSnapshots).get()!;
    expect(snapshot.inputJson).toMatchObject({ winBy: 1 });
    expect(snapshot.probabilityA).toBe(gameWinProbability(expected.expectedShareA, 11, 1));
  });

  it("rejects 11–10 under win by 2, and over-length scores under win by 1, without writing", () => {
    expect(() => confirmNewMatch(db, actor, input({ winBy: 2 }), { now: NOW })).toThrow(/lead by at least 2/);
    expect(() => confirmNewMatch(db, actor, input({ scoreA: 12, scoreB: 10 }), { now: NOW })).toThrow(/no team can score more than 11/);
    expect(() => confirmNewMatch(db, actor, input({ scoreA: 10, scoreB: 10 }), { now: NOW })).toThrow(/tie/);
    expect(db.select().from(matches).all()).toHaveLength(0);
    expect(getLeaderboard(db).map((p) => p.rating)).toEqual([3.6, 3.4, 3.2, 3.0]);
  });

  it("defaults to win by 1 when the rule is omitted", () => {
    const { winBy: _omit, ...rest } = input();
    void _omit;
    const out = confirmNewMatch(db, actor, rest, { now: NOW });
    expect(db.select().from(matches).where(eq(matches.id, out.matchId)).get()!.winBy).toBe(1);
  });

  it.each(
    GAME_TARGETS.flatMap((target) =>
      WIN_BY_OPTIONS.flatMap((winBy) => [
        [target, winBy, "A", true],
        [target, winBy, "B", true],
      ]),
    ) as [11 | 15 | 21, WinBy, "A" | "B", boolean][],
  )("confirms a valid result to %i, win by %i, team %s winning", (target, winBy, winner) => {
    const close = winBy === 1 ? [target, target - 1] : [target + 2, target];
    const [w, l] = close;
    const out = confirmNewMatch(db, actor, input({ formatTarget: target, winBy, scoreA: winner === "A" ? w : l, scoreB: winner === "A" ? l : w }), { now: NOW });
    const row = db.select().from(matches).where(eq(matches.id, out.matchId)).get()!;
    expect(row.winBy).toBe(winBy);
    const slots = db.select().from(matchPlayers).where(eq(matchPlayers.matchId, out.matchId)).all();
    const winners = slots.filter((s) => s.team === winner);
    expect(winners.every((s) => s.deltaRating! !== 0)).toBe(true);
    expect(slots.reduce((t, s) => t + s.deltaRating!, 0)).toBeCloseTo(0, 12);
  });

  it("previews with the selected rule's win probability", () => {
    const one = previewMatch(db, input(), { now: NOW });
    const two = previewMatch(db, input({ winBy: 2, scoreA: 11, scoreB: 9 }), { now: NOW });
    expect(one.winBy).toBe(1);
    expect(two.winBy).toBe(2);
    expect(one.prediction.pointShareA).toBe(two.prediction.pointShareA);
    expect(one.prediction.winProbA).toBe(gameWinProbability(one.prediction.pointShareA, 11, 1));
    expect(two.prediction.winProbA).toBe(gameWinProbability(two.prediction.pointShareA, 11, 2));
    expect(db.select().from(matches).all()).toHaveLength(0);
  });

  it("stores the rule on drafts without validating the ending, and corrections can change it", () => {
    const d = saveDraft(db, actor, input({ winBy: 2 }), { now: NOW });
    expect(db.select().from(matches).where(eq(matches.id, d.matchId)).get()).toMatchObject({ winBy: 2, status: "draft" });

    const m = confirmNewMatch(db, actor, input(), { now: NOW });
    const stamp = db.select().from(matches).where(eq(matches.id, m.matchId)).get()!.updatedAt.getTime();
    expect(() => correctMatch(db, actor, m.matchId, input({ winBy: 2 }), { reason: "rule was 2", expectedUpdatedAt: stamp, now: NOW })).toThrow(/lead by at least 2/);
    correctMatch(db, actor, m.matchId, input({ winBy: 2, scoreA: 12, scoreB: 10 }), { reason: "played to win by 2", expectedUpdatedAt: stamp, now: NOW });
    expect(db.select().from(matches).where(eq(matches.id, m.matchId)).get()).toMatchObject({ winBy: 2, scoreA: 12, scoreB: 10 });
    const inputs = loadReplayInputs(db);
    const fresh = replay(inputs.players, inputs.matches);
    for (const [id, r] of fresh.finalRatings) expect(db.select().from(players).where(eq(players.id, id)).get()!.currentCincoRating).toBe(r);
  });

  it("mixes legacy win-by-2 and new win-by-1 matches without disturbing earlier results", () => {
    const first = confirmNewMatch(db, actor, input({ winBy: 2, scoreA: 12, scoreB: 10, playedAtLocal: "2026-03-01T10:00" }), { now: NOW });
    const snapshotBefore = JSON.stringify(db.select().from(matchPlayers).where(eq(matchPlayers.matchId, first.matchId)).all());
    confirmNewMatch(db, actor, input({ playedAtLocal: "2026-03-02T10:00" }), { now: NOW });
    expect(JSON.stringify(db.select().from(matchPlayers).where(eq(matchPlayers.matchId, first.matchId)).all())).toBe(snapshotBefore);
    const inputs = loadReplayInputs(db);
    expect(inputs.matches.map((x) => x.winBy).sort()).toEqual([1, 2]);
    db.transaction((tx) => expect(rebuildRatings(tx).changedMatchIds).toEqual([]));
  });
});

describe("admin preferred winning rule", () => {
  it("defaults to win by 1 and remembers the choice", async () => {
    const { db } = await memoryDb();
    const admin = createUser(db, { email: "p@q.co", passwordHash: "x" });
    expect(getPreferredWinBy(db, admin)).toBe(1);
    setPreferredWinBy(db, admin, 2);
    expect(getPreferredWinBy(db, admin)).toBe(2);
    expect(db.select().from(users).where(eq(users.id, admin)).get()!.preferredWinBy).toBe(2);
  });
});

describe("historical compatibility (migration 0000 -> 0001)", () => {
  it("backfills win_by = 2 for existing matches and leaves every stored value untouched", async () => {
    const dir = tempDir();
    const repo = path.resolve(import.meta.dirname, "../drizzle");
    const oldFolder = path.join(dir, "old");
    fs.mkdirSync(path.join(oldFolder, "meta"), { recursive: true });
    const journal = JSON.parse(fs.readFileSync(path.join(repo, "meta/_journal.json"), "utf8")) as { entries: { tag: string }[] };
    expect(journal.entries.length).toBeGreaterThanOrEqual(2);
    fs.copyFileSync(path.join(repo, `${journal.entries[0].tag}.sql`), path.join(oldFolder, `${journal.entries[0].tag}.sql`));
    fs.writeFileSync(path.join(oldFolder, "meta/_journal.json"), JSON.stringify({ ...journal, entries: [journal.entries[0]] }));

    const opened = openDatabase(path.join(dir, "legacy.sqlite"));
    await runMigrations(opened, { folder: oldFolder });
    expect(() => opened.sqlite.prepare("select win_by from matches").all()).toThrow();

    // Legacy data as the pre-win_by app would have written it, with ratings from a win-by-2 replay.
    const cfg = { ...DEFAULT_RATING_CONFIG, timezone: "UTC" };
    const names = ["a", "b", "c", "d"];
    const playedAt = [Date.UTC(2026, 2, 1, 10), Date.UTC(2026, 2, 2, 10)];
    const legacy = playedAt.map((t, i) => ({
      id: `m${i}`, playedAt: t, createdAt: t, formatTarget: 11 as const, winBy: 2 as const, scoreA: i ? 9 : 12, scoreB: i ? 11 : 10,
      rated: true, config: cfg, teamA: ["a", "b"] as [string, string], teamB: ["c", "d"] as [string, string],
    }));
    const start = [3.0, 3.2, 3.4, 3.6];
    const result = replay(names.map((id, i) => ({ id, initialRating: start[i] })), legacy);
    const now = Date.now();
    for (const [i, id] of names.entries()) {
      opened.sqlite.prepare("insert into players (id, display_name, initial_cinco_rating, current_cinco_rating, active, created_at, updated_at) values (?,?,?,?,1,?,?)")
        .run(id, id.toUpperCase(), start[i], result.finalRatings.get(id), now, now);
    }
    result.results.forEach((r, mi) => {
      const m = legacy[mi];
      opened.sqlite.prepare("insert into matches (id, played_at, created_at, updated_at, format_target, score_a, score_b, status, rated, algorithm_version, config_snapshot, predicted_point_share_a, predicted_win_prob_a, confirmed_at, idempotency_key) values (?,?,?,?,?,?,?,'confirmed',1,'vcpr-v1',?,?,?,?,?)")
        .run(m.id, m.playedAt, m.createdAt, m.createdAt, 11, m.scoreA, m.scoreB, JSON.stringify(cfg), r.expectedShareA, r.winProbA, m.createdAt, `legacy-${mi}`);
      r.playerIds.forEach((pid, i) => {
        opened.sqlite.prepare("insert into match_players (match_id, player_id, team, position, pre_rating, delta_rating, post_rating) values (?,?,?,?,?,?,?)")
          .run(m.id, pid, i < 2 ? "A" : "B", (i % 2) + 1, r.pre[i], r.delta[i], r.post[i]);
        opened.sqlite.prepare("insert into rating_history (player_id, match_id, rating_before, rating_after, delta, played_at) values (?,?,?,?,?,?)")
          .run(pid, m.id, r.pre[i], r.post[i], r.delta[i], m.playedAt);
      });
    });
    const dump = () =>
      JSON.stringify(
        ["players", "match_players", "rating_history"].map((t) => opened.sqlite.prepare(`select * from ${t} order by 1, 2`).all()),
      );
    const matchDump = () =>
      JSON.stringify(opened.sqlite.prepare("select id, played_at, format_target, score_a, score_b, status, rated, config_snapshot, predicted_point_share_a, predicted_win_prob_a from matches order by id").all());
    const before = { core: dump(), matches: matchDump() };

    const migrated = await runMigrations(opened, { backupDir: path.join(dir, "backups") });
    expect(migrated.applied).toBe(journal.entries.length - 1);
    expect(migrated.backupPath && fs.existsSync(migrated.backupPath)).toBeTruthy();

    expect(opened.sqlite.prepare("select id, win_by from matches order by id").all()).toEqual([
      { id: "m0", win_by: 2 },
      { id: "m1", win_by: 2 },
    ]);
    expect(opened.sqlite.prepare("select preferred_win_by from users").all()).toEqual([]);
    expect({ core: dump(), matches: matchDump() }).toEqual(before);

    // Replaying history under the migrated schema reproduces the stored values exactly: nothing is rewritten.
    const inputs = loadReplayInputs(opened.db);
    expect(inputs.matches.every((m) => m.winBy === 2)).toBe(true);
    const fresh = replay(inputs.players, inputs.matches);
    expect(changedMatchIds(result, fresh)).toEqual([]);
    opened.db.transaction((tx) => {
      const rebuilt = rebuildRatings(tx);
      expect(rebuilt.changedMatchIds).toEqual([]);
      expect(rebuilt.playersUpdated).toBe(0);
    });
    expect({ core: dump(), matches: matchDump() }).toEqual(before);
    opened.sqlite.close();
  });
});
