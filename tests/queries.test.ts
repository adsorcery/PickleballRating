import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/lib/db/client";
import { createUser } from "@/lib/auth/auth";
import { createPlayer, setPlayerActive } from "@/lib/services/players";
import { confirmNewMatch, saveDraft, type MatchInput } from "@/lib/services/matches";
import { getAdminOverview, getLeaderboard, getPlayerProfile, getRecentMatches, listSelectablePlayers, searchMatches } from "@/lib/queries";
import { formatProbability } from "@/lib/utils";
import { memoryDb } from "./helpers/db";

let db: Db;
let actor: string;
let ids: string[];
let n = 0;
const NOW = new Date("2026-06-10T12:00:00Z");

function match(teamA: number[], teamB: number[], when: string, a = 11, b = 7, over: Partial<MatchInput> = {}): MatchInput {
  return {
    teamA: [ids[teamA[0]], ids[teamA[1]]],
    teamB: [ids[teamB[0]], ids[teamB[1]]],
    playedAtLocal: when,
    formatTarget: 11,
    scoreA: a,
    scoreB: b,
    rated: true,
    notes: null,
    idempotencyKey: `query-key-${++n}`,
    ...over,
  };
}

beforeEach(async () => {
  ({ db } = await memoryDb("UTC"));
  actor = createUser(db, { email: "a@b.co", passwordHash: "x" });
  ids = [3.0, 3.2, 3.4, 3.6, 3.8].map((r, i) =>
    createPlayer(db, actor, { displayName: `P${i}`, initialRating: r, duprRating: null, avatarUrl: null, notes: null }, NOW),
  );
});

describe("public queries", () => {
  it("ranks by current rating and counts W-L, provisional, and trends", () => {
    confirmNewMatch(db, actor, match([0, 1], [2, 3], "2026-06-09T10:00"), { now: NOW });
    confirmNewMatch(db, actor, match([0, 2], [1, 4], "2026-06-09T11:00", 5, 11), { now: NOW });
    const rows = getLeaderboard(db, NOW.getTime());
    expect(rows.map((r) => r.rating)).toEqual([...rows.map((r) => r.rating)].sort((a, b) => b - a));
    const p0 = rows.find((r) => r.id === ids[0])!;
    expect(p0).toMatchObject({ games: 2, wins: 1, losses: 1, provisional: true });
    expect(p0.trend7).not.toBeNull();
    expect(rows.find((r) => r.id === ids[4])!.games).toBe(1);
  });

  it("excludes drafts and inactive players from public data", () => {
    saveDraft(db, actor, match([0, 1], [2, 3], "2026-06-09T10:00"), { now: NOW });
    expect(getRecentMatches(db)).toHaveLength(0);
    expect(searchMatches(db, {}).total).toBe(0);
    expect(getAdminOverview(db).drafts).toHaveLength(1);
    setPlayerActive(db, actor, ids[4], false);
    expect(listSelectablePlayers(db).map((p) => p.id)).not.toContain(ids[4]);
    expect(getLeaderboard(db)).toHaveLength(4);
  });

  it("searches and filters matches with pagination", () => {
    for (let i = 0; i < 5; i++) {
      confirmNewMatch(db, actor, match([0, 1], [2, 3], `2026-06-0${i + 1}T10:00`), { now: NOW });
    }
    confirmNewMatch(db, actor, match([1, 4], [0, 3], "2026-06-08T10:00", 11, 4, { formatTarget: 15, scoreA: 15, scoreB: 4 }), { now: NOW });
    expect(searchMatches(db, {}).total).toBe(6);
    expect(searchMatches(db, { q: "p4" }).total).toBe(1);
    expect(searchMatches(db, { q: "%" }).total).toBe(0);
    expect(searchMatches(db, { format: 15 }).total).toBe(1);
    expect(searchMatches(db, { playerId: ids[2] }).total).toBe(5);
    expect(searchMatches(db, { from: Date.UTC(2026, 5, 3), to: Date.UTC(2026, 5, 5) }).total).toBe(2);
    const page = searchMatches(db, { page: 2, pageSize: 4 });
    expect(page.items).toHaveLength(2);
    expect(page.items[0].playedAt).toBeGreaterThan(page.items[1].playedAt);
  });

  it("builds a profile without fabricating metrics that lack data", () => {
    confirmNewMatch(db, actor, match([0, 1], [2, 3], "2026-06-09T10:00"), { now: NOW });
    const p = getPlayerProfile(db, ids[0])!;
    expect(p.history).toHaveLength(2);
    expect(p.partners[0]).toMatchObject({ id: ids[1], games: 1, wins: 1 });
    expect(p.distinctOpponents).toBeNull();
    expect(p.rank).not.toBeNull();
    expect(getPlayerProfile(db, "nope")).toBeNull();
    const fresh = getPlayerProfile(db, ids[4])!;
    expect(fresh.history).toHaveLength(1);
    expect(fresh.partners).toHaveLength(0);
  });

  it("reports opponent diversity once there are enough games", () => {
    for (let i = 0; i < 5; i++) {
      const opp = i % 2 === 0 ? [2, 3] : [3, 4];
      confirmNewMatch(db, actor, match([0, 1], opp, `2026-06-0${i + 1}T10:00`), { now: NOW });
    }
    expect(getPlayerProfile(db, ids[0])!.distinctOpponents).toBe(3);
  });
});

describe("formatProbability", () => {
  it("never shows a flat 0% or 100%", () => {
    expect(formatProbability(0.9999)).toBe(">99.9%");
    expect(formatProbability(0.00001)).toBe("<0.1%");
    expect(formatProbability(0.5)).toBe("50.0%");
  });
});
