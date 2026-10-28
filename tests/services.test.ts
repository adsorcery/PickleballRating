import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { auditLogs, matches, matchPlayers, players, predictionSnapshots, ratingHistory } from "@/lib/db/schema";
import { createUser } from "@/lib/auth/auth";
import {
  changeInitialRating,
  createPlayer,
  importRosterCsv,
  previewInitialRatingChange,
  previewRosterCsv,
  setPlayerActive,
  updatePlayer,
} from "@/lib/services/players";
import { confirmDraft, confirmNewMatch, correctMatch, previewMatch, saveDraft, voidMatch, type MatchInput } from "@/lib/services/matches";
import { loadReplayInputs } from "@/lib/services/replay-store";
import { replay } from "@/lib/rating";
import { ServiceError } from "@/lib/result";
import { memoryDb } from "./helpers/db";

let db: Db;
let actor: string;
let ids: string[];
let key = 0;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const ratingOf = (id: string) => db.select().from(players).where(eq(players.id, id)).get()!.currentCincoRating;
const allRatings = () => ids.map(ratingOf);

function input(over: Partial<MatchInput> = {}): MatchInput {
  key++;
  return {
    teamA: [ids[0], ids[1]],
    teamB: [ids[2], ids[3]],
    playedAtLocal: "2026-03-01T10:00",
    formatTarget: 11,
    scoreA: 11,
    scoreB: 7,
    rated: true,
    notes: null,
    idempotencyKey: `idem-key-${key}`,
    ...over,
  };
}

const NOW = new Date("2026-06-01T12:00:00Z");

beforeEach(async () => {
  ({ db } = await memoryDb("UTC"));
  actor = createUser(db, { email: "admin@x.io", passwordHash: "x" });
  ids = [3.0, 3.2, 3.4, 3.6, 3.8, 4.0].map((r, i) =>
    createPlayer(db, actor, { displayName: `Player ${i + 1}`, initialRating: r, duprRating: null, avatarUrl: null, notes: null }, NOW),
  );
});

describe("players", () => {
  it("creates with current = initial and does not move other ratings", () => {
    const before = allRatings();
    const id = createPlayer(db, actor, { displayName: "Newbie", initialRating: 2.75, duprRating: 3.1, avatarUrl: null, notes: null });
    const p = db.select().from(players).where(eq(players.id, id)).get()!;
    expect(p.initialCincoRating).toBe(2.75);
    expect(p.currentCincoRating).toBe(2.75);
    expect(p.active).toBe(true);
    expect(allRatings()).toEqual(before);
  });

  it("rejects duplicate names case-insensitively and requires a rating", () => {
    expect(() => createPlayer(db, actor, { displayName: " player 1 ", initialRating: 3, duprRating: null, avatarUrl: null, notes: null })).toThrow(ServiceError);
    expect(() => createPlayer(db, actor, { displayName: "X", initialRating: undefined as unknown as number, duprRating: null, avatarUrl: null, notes: null })).toThrow();
    expect(() => createPlayer(db, actor, { displayName: "Y", initialRating: 3, duprRating: null, avatarUrl: "javascript:alert(1)", notes: null })).toThrow();
  });

  it("name edits do not touch ratings; deactivation keeps history", () => {
    confirmNewMatch(db, actor, input(), { now: NOW });
    const before = allRatings();
    const p = db.select().from(players).where(eq(players.id, ids[0])).get()!;
    updatePlayer(db, actor, { playerId: ids[0], displayName: "Renamed", duprRating: 4.1, avatarUrl: null, notes: "hi", expectedUpdatedAt: p.updatedAt.getTime() });
    expect(allRatings()).toEqual(before);
    setPlayerActive(db, actor, ids[0], false);
    expect(db.select().from(matchPlayers).where(eq(matchPlayers.playerId, ids[0])).all()).toHaveLength(1);
    expect(() => confirmNewMatch(db, actor, input({ playedAtLocal: "2026-03-02T10:00" }), { now: NOW })).toThrow(/inactive/);
  });

  it("detects stale player edits", () => {
    const p = db.select().from(players).where(eq(players.id, ids[0])).get()!;
    expect(() =>
      updatePlayer(db, actor, { playerId: ids[0], displayName: "A", duprRating: null, avatarUrl: null, notes: null, expectedUpdatedAt: p.updatedAt.getTime() + 1 }),
    ).toThrow(/changed by someone else/);
  });
});

describe("confirming matches", () => {
  it("atomically writes the match, four rating changes, history, snapshot and audit", () => {
    const before = allRatings();
    const out = confirmNewMatch(db, actor, input({ scoreA: 5, scoreB: 11 }), { now: NOW });
    expect(out.alreadySaved).toBe(false);
    const slots = db.select().from(matchPlayers).where(eq(matchPlayers.matchId, out.matchId)).all();
    expect(slots).toHaveLength(4);
    for (const s of slots) {
      expect(s.preRating).not.toBeNull();
      expect(s.postRating!).toBeCloseTo(s.preRating! + s.deltaRating!, 12);
      expect(ratingOf(s.playerId)).toBe(s.postRating);
    }
    expect(sum(slots.map((s) => s.deltaRating!))).toBeCloseTo(0, 12);
    expect(sum(allRatings())).toBeCloseTo(sum(before), 12);
    expect(ratingOf(ids[4])).toBe(before[4]);
    expect(db.select().from(ratingHistory).all()).toHaveLength(4);
    const m = db.select().from(matches).where(eq(matches.id, out.matchId)).get()!;
    expect(m.predictedWinProbA).toBeGreaterThan(0);
    expect(m.algorithmVersion).toBe("vcpr-v1");
    expect(db.select().from(predictionSnapshots).all()).toHaveLength(1);
    expect(db.select().from(auditLogs).where(eq(auditLogs.entityId, out.matchId)).all()[0].action).toBe("confirm");
  });

  it("rolls back everything if any step of the transaction fails", async () => {
    const before = allRatings();
    db.run(sql`drop table prediction_snapshots`);
    expect(() => confirmNewMatch(db, actor, input(), { now: NOW })).toThrow();
    expect(db.select().from(matches).all()).toHaveLength(0);
    expect(db.select().from(matchPlayers).all()).toHaveLength(0);
    expect(db.select().from(ratingHistory).all()).toHaveLength(0);
    expect(allRatings()).toEqual(before);
  });

  it("is idempotent: a duplicate submission does not multiply rating changes", () => {
    const i = input();
    const a = confirmNewMatch(db, actor, i, { now: NOW });
    const after1 = allRatings();
    const b = confirmNewMatch(db, actor, i, { now: NOW });
    expect(b).toEqual({ matchId: a.matchId, alreadySaved: true });
    expect(allRatings()).toEqual(after1);
    expect(db.select().from(matches).all()).toHaveLength(1);
  });

  it("writes nothing when validation fails", () => {
    const before = allRatings();
    expect(() => confirmNewMatch(db, actor, input({ scoreA: 11, scoreB: 10 }), { now: NOW })).toThrow(/lead by at least 2/);
    expect(() => confirmNewMatch(db, actor, input({ teamB: [ids[2], ids[0]] }), { now: NOW })).toThrow(/four different/);
    expect(() => confirmNewMatch(db, actor, input({ playedAtLocal: "2027-01-01T10:00" }), { now: NOW })).toThrow(/future/);
    expect(db.select().from(matches).all()).toHaveLength(0);
    expect(allRatings()).toEqual(before);
  });

  it("warns on suspected duplicates and requires acknowledgement", () => {
    confirmNewMatch(db, actor, input(), { now: NOW });
    const dupInput = input({ teamA: [ids[3], ids[2]], teamB: [ids[1], ids[0]], scoreA: 7, scoreB: 11, playedAtLocal: "2026-03-01T11:00" });
    expect(previewMatch(db, dupInput, { now: NOW }).duplicates).toHaveLength(1);
    expect(() => confirmNewMatch(db, actor, dupInput, { now: NOW })).toThrow(/same four players/);
    expect(confirmNewMatch(db, actor, dupInput, { now: NOW, acknowledgeDuplicate: true }).alreadySaved).toBe(false);
  });

  it("previews without writing and matches what confirm then does", () => {
    const i = input({ scoreA: 9, scoreB: 11 });
    const preview = previewMatch(db, i, { now: NOW });
    expect(db.select().from(matches).all()).toHaveLength(0);
    expect(preview.players.map((p) => p.pre)).toEqual([3.0, 3.2, 3.4, 3.6]);
    expect(preview.prediction.winProbA + preview.prediction.winProbB).toBeCloseTo(1, 12);
    confirmNewMatch(db, actor, i, { now: NOW });
    expect(ids.slice(0, 4).map(ratingOf)).toEqual(preview.players.map((p) => p.post));
    expect(preview.players.every((p) => p.provisional)).toBe(true);
  });

  it("applies the repeated-matchup discount in preview", () => {
    for (let n = 0; n < 3; n++) confirmNewMatch(db, actor, input({ playedAtLocal: `2026-03-01T1${n}:00`, scoreA: 11, scoreB: 5 + n }), { now: NOW, acknowledgeDuplicate: true });
    const p = previewMatch(db, input({ playedAtLocal: "2026-03-01T15:00", scoreA: 11, scoreB: 2 }), { now: NOW });
    expect(p.repeat).toMatchObject({ priorSameSetGames: 3, discounted: true });
    expect(p.repeat.kEff).toBeCloseTo(0.175, 12);
  });

  it("unrated matches are stored but never move ratings", () => {
    const before = allRatings();
    const out = confirmNewMatch(db, actor, input({ rated: false }), { now: NOW });
    expect(allRatings()).toEqual(before);
    expect(db.select().from(ratingHistory).all()).toHaveLength(0);
    const slots = db.select().from(matchPlayers).where(eq(matchPlayers.matchId, out.matchId)).all();
    expect(slots.every((s) => s.deltaRating === 0)).toBe(true);
  });
});

describe("drafts", () => {
  it("have no effect until confirmed", () => {
    const before = allRatings();
    const d = saveDraft(db, actor, input({ scoreA: 3, scoreB: 3 }), { now: NOW });
    expect(allRatings()).toEqual(before);
    expect(db.select().from(ratingHistory).all()).toHaveLength(0);
    const row = db.select().from(matches).where(eq(matches.id, d.matchId)).get()!;
    expect(row.status).toBe("draft");
    expect(() => confirmDraft(db, actor, d.matchId, input({ scoreA: 3, scoreB: 3 }), { expectedUpdatedAt: row.updatedAt.getTime(), now: NOW })).toThrow(/tie/);
    const done = confirmDraft(db, actor, d.matchId, input(), { expectedUpdatedAt: row.updatedAt.getTime(), now: NOW });
    expect(done.alreadySaved).toBe(false);
    expect(ratingOf(ids[0])).not.toBe(before[0]);
    expect(confirmDraft(db, actor, d.matchId, input(), { expectedUpdatedAt: row.updatedAt.getTime(), now: NOW }).alreadySaved).toBe(true);
  });

  it("can be discarded without touching ratings", () => {
    const d = saveDraft(db, actor, input(), { now: NOW });
    const row = db.select().from(matches).where(eq(matches.id, d.matchId)).get()!;
    voidMatch(db, actor, d.matchId, { reason: "entered by mistake", expectedUpdatedAt: row.updatedAt.getTime(), now: NOW });
    expect(db.select().from(matches).where(eq(matches.id, d.matchId)).get()!.status).toBe("void");
  });
});

describe("corrections, voids and replay", () => {
  function expectConsistentWithFreshReplay() {
    const inputs = loadReplayInputs(db);
    const fresh = replay(inputs.players, inputs.matches);
    for (const [id, rating] of fresh.finalRatings) expect(ratingOf(id)).toBe(rating);
    for (const r of fresh.results) {
      const rows = db.select().from(matchPlayers).where(eq(matchPlayers.matchId, r.matchId)).all();
      for (const row of rows) {
        const i = r.playerIds.indexOf(row.playerId);
        expect(row.preRating).toBe(r.pre[i]);
        expect(row.postRating).toBe(r.post[i]);
      }
    }
    expect(sum(allRatings())).toBeCloseTo(sum([3.0, 3.2, 3.4, 3.6, 3.8, 4.0]), 10);
  }

  function seedThree() {
    const m1 = confirmNewMatch(db, actor, input({ playedAtLocal: "2026-03-01T10:00" }), { now: NOW });
    const m2 = confirmNewMatch(db, actor, input({ teamA: [ids[0], ids[4]], teamB: [ids[1], ids[5]], playedAtLocal: "2026-03-02T10:00", scoreA: 8, scoreB: 11 }), { now: NOW });
    const m3 = confirmNewMatch(db, actor, input({ teamA: [ids[2], ids[0]], teamB: [ids[3], ids[4]], playedAtLocal: "2026-03-03T10:00", scoreA: 11, scoreB: 9 }), { now: NOW });
    return [m1.matchId, m2.matchId, m3.matchId];
  }

  const stamp = (id: string) => db.select().from(matches).where(eq(matches.id, id)).get()!.updatedAt.getTime();

  it("correcting a match replays all later matches", () => {
    const [m1, m2, m3] = seedThree();
    const m3Before = db.select().from(matchPlayers).where(eq(matchPlayers.matchId, m3)).all().map((r) => r.preRating);
    const res = correctMatch(db, actor, m1, input({ scoreA: 3, scoreB: 11 }), { reason: "typo in score", expectedUpdatedAt: stamp(m1), now: NOW });
    expect(res.affectedMatches).toBeGreaterThanOrEqual(3);
    const m3After = db.select().from(matchPlayers).where(eq(matchPlayers.matchId, m3)).all().map((r) => r.preRating);
    expect(m3After).not.toEqual(m3Before);
    expectConsistentWithFreshReplay();
    const audit = db.select().from(auditLogs).where(eq(auditLogs.entityId, m1)).all().find((a) => a.action === "correct")!;
    expect(audit.reason).toBe("typo in score");
    expect(audit.beforeJson).toMatchObject({ scoreA: 11, scoreB: 7 });
    expect(audit.afterJson).toMatchObject({ scoreA: 3, scoreB: 11, timeChanged: false });
    expect(m2).toBeTruthy();
  });

  it("changing the played time reorders the replay and is surfaced in the audit trail", () => {
    const [m1, m2] = seedThree();
    correctMatch(db, actor, m1, input({ playedAtLocal: "2026-03-05T10:00" }), { reason: "wrong day entered", expectedUpdatedAt: stamp(m1), now: NOW });
    expectConsistentWithFreshReplay();
    const first = db.select().from(matchPlayers).where(eq(matchPlayers.matchId, m2)).all().find((r) => r.playerId === ids[1])!;
    expect(first.preRating).toBe(3.2);
    const audit = db.select().from(auditLogs).where(eq(auditLogs.entityId, m1)).all().find((a) => a.action === "correct")!;
    expect(audit.afterJson).toMatchObject({ timeChanged: true });
  });

  it("voiding restores ratings as if the match never happened", () => {
    const [m1] = seedThree();
    voidMatch(db, actor, m1, { reason: "wrong players", expectedUpdatedAt: stamp(m1), now: NOW });
    expectConsistentWithFreshReplay();
    expect(db.select().from(ratingHistory).where(eq(ratingHistory.matchId, m1)).all()).toHaveLength(0);
    expect(db.select().from(matchPlayers).where(eq(matchPlayers.matchId, m1)).all().every((r) => r.postRating === null)).toBe(true);
    expect(() => voidMatch(db, actor, m1, { reason: "again", expectedUpdatedAt: stamp(m1), now: NOW })).toThrow(/already void/);
  });

  it("voiding everything returns every player to the initial rating", () => {
    for (const id of seedThree()) voidMatch(db, actor, id, { reason: "reset", expectedUpdatedAt: stamp(id), now: NOW });
    expect(allRatings()).toEqual([3.0, 3.2, 3.4, 3.6, 3.8, 4.0]);
  });

  it("a back-dated match changes later matches' starting ratings", () => {
    const [, m2] = seedThree();
    const pre = db.select().from(matchPlayers).where(eq(matchPlayers.matchId, m2)).all().map((r) => r.preRating);
    const preview = previewMatch(db, input({ teamA: [ids[0], ids[5]], teamB: [ids[1], ids[4]], playedAtLocal: "2026-02-20T10:00" }), { now: NOW });
    expect(preview.laterMatchesAffected).toBe(3);
    confirmNewMatch(db, actor, input({ teamA: [ids[0], ids[5]], teamB: [ids[1], ids[4]], playedAtLocal: "2026-02-20T10:00" }), { now: NOW });
    const post = db.select().from(matchPlayers).where(eq(matchPlayers.matchId, m2)).all().map((r) => r.preRating);
    expect(post).not.toEqual(pre);
    expectConsistentWithFreshReplay();
  });

  it("rejects stale edits (concurrent admin updates)", () => {
    const [m1] = seedThree();
    const stale = stamp(m1);
    correctMatch(db, actor, m1, input({ scoreA: 11, scoreB: 8 }), { reason: "first fix", expectedUpdatedAt: stale, now: new Date(NOW.getTime() + 1000) });
    expect(() => correctMatch(db, actor, m1, input({ scoreA: 11, scoreB: 6 }), { reason: "second fix", expectedUpdatedAt: stale, now: NOW })).toThrow(/changed elsewhere/);
    expect(() => voidMatch(db, actor, m1, { reason: "nope", expectedUpdatedAt: stale })).toThrow(/changed elsewhere/);
  });

  it("requires a reason for corrections", () => {
    const [m1] = seedThree();
    expect(() => correctMatch(db, actor, m1, input(), { reason: " ", expectedUpdatedAt: stamp(m1) })).toThrow();
  });
});

describe("changing initial ratings", () => {
  it("applies immediately when the player has no history", () => {
    const p = db.select().from(players).where(eq(players.id, ids[5])).get()!;
    changeInitialRating(db, actor, { playerId: ids[5], newRating: 4.5, expectedUpdatedAt: p.updatedAt.getTime() });
    expect(ratingOf(ids[5])).toBe(4.5);
  });

  it("requires confirmation + reason with history, shows affected count, then replays with an audit record", () => {
    confirmNewMatch(db, actor, input({ playedAtLocal: "2026-03-01T10:00" }), { now: NOW });
    confirmNewMatch(db, actor, input({ playedAtLocal: "2026-03-02T10:00", scoreA: 9, scoreB: 11 }), { now: NOW });
    const p = db.select().from(players).where(eq(players.id, ids[0])).get()!;
    const impact = previewInitialRatingChange(db, ids[0], 3.5);
    expect(impact).toMatchObject({ hasHistory: true, confirmedGames: 2, affectedMatches: 2 });
    const base = { playerId: ids[0], newRating: 3.5, expectedUpdatedAt: p.updatedAt.getTime() };
    expect(() => changeInitialRating(db, actor, base)).toThrow(/Confirm to continue/);
    expect(() => changeInitialRating(db, actor, { ...base, confirmReplay: true })).toThrow(/reason/i);
    const result = changeInitialRating(db, actor, { ...base, confirmReplay: true, reason: "Re-rated after assessment" }, NOW);
    expect(result.affectedMatches).toBe(2);
    const inputs = loadReplayInputs(db);
    expect(replay(inputs.players, inputs.matches).finalRatings.get(ids[0])).toBe(ratingOf(ids[0]));
    const audit = db.select().from(auditLogs).where(eq(auditLogs.action, "change_initial_rating")).all();
    expect(audit).toHaveLength(1);
    expect(audit[0].reason).toBe("Re-rated after assessment");
  });
});

describe("CSV import", () => {
  const csv = ["display_name,initial_cinco_rating,dupr_rating,notes", "Zed,3.25,3.9,lefty", '"Quinn, Q",4.1,,', "player 2,3,,", "Zed,3.5,,", "Bad,abc,,", ",3,,"].join("\n");

  it("previews validation and duplicate detection without writing", () => {
    const preview = previewRosterCsv(db, csv);
    expect(preview.counts).toEqual({ ok: 2, invalid: 2, duplicate_existing: 1, duplicate_in_file: 1 });
    expect(preview.rows[1].displayName).toBe("Quinn, Q");
    expect(db.select().from(players).all()).toHaveLength(6);
  });

  it("imports valid rows atomically and skips the rest", () => {
    const before = allRatings();
    expect(importRosterCsv(db, actor, csv)).toEqual({ imported: 2, skipped: 4 });
    expect(db.select().from(players).all()).toHaveLength(8);
    expect(allRatings()).toEqual(before);
  });

  it("rejects bad headers and oversize input", () => {
    expect(previewRosterCsv(db, "a,b\n1,2").fatal).toMatch(/Header/);
    expect(previewRosterCsv(db, "x".repeat(300_000)).fatal).toMatch(/too large/);
  });
});
