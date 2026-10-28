import { describe, expect, it } from "vitest";
import { DEFAULT_RATING_CONFIG, matchupKey, replay, ReplayError, type ReplayMatch, type ReplayPlayer } from "@/lib/rating";

const config = { ...DEFAULT_RATING_CONFIG, timezone: "UTC" };
const players: ReplayPlayer[] = ["a", "b", "c", "d", "e", "f"].map((id, i) => ({ id, initialRating: 3 + i * 0.1 }));
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 10, 15, 0);

let seq = 0;
function match(over: Partial<ReplayMatch> & Pick<ReplayMatch, "teamA" | "teamB">): ReplayMatch {
  seq++;
  return {
    id: `m${String(seq).padStart(3, "0")}`,
    playedAt: T0 + seq * 60_000,
    createdAt: T0 + seq,
    formatTarget: 11,
    scoreA: 11,
    scoreB: 7,
    rated: true,
    config,
    ...over,
  };
}

const sum = (xs: Iterable<number>) => [...xs].reduce((a, b) => a + b, 0);

describe("replay", () => {
  it("is deterministic and independent of input order", () => {
    const ms = [
      match({ teamA: ["a", "b"], teamB: ["c", "d"] }),
      match({ teamA: ["a", "c"], teamB: ["b", "e"], scoreA: 8, scoreB: 11 }),
      match({ teamA: ["d", "e"], teamB: ["f", "a"], scoreA: 12, scoreB: 10 }),
    ];
    const r1 = replay(players, ms);
    const r2 = replay(players, [...ms].reverse());
    expect(r2).toEqual(r1);
    expect(replay(players, ms)).toEqual(r1);
  });

  it("conserves total rating (zero-sum) and chains pre/post ratings", () => {
    const ms = Array.from({ length: 40 }, (_, i) =>
      match({
        teamA: [players[i % 6].id, players[(i + 1) % 6].id],
        teamB: [players[(i + 2) % 6].id, players[(i + 3) % 6].id],
        scoreA: i % 3 === 0 ? 5 : 11,
        scoreB: i % 3 === 0 ? 11 : 6,
        playedAt: T0 + i * DAY,
      }),
    );
    const r = replay(players, ms);
    expect(sum(r.finalRatings.values())).toBeCloseTo(sum(players.map((p) => p.initialRating)), 10);
    const last = new Map<string, number>(players.map((p) => [p.id, p.initialRating]));
    for (const res of r.results) {
      res.playerIds.forEach((id, i) => {
        expect(res.pre[i]).toBeCloseTo(last.get(id)!, 12);
        expect(res.post[i]).toBeCloseTo(res.pre[i] + res.delta[i], 12);
        last.set(id, res.post[i]);
      });
    }
  });

  it("orders canonically by (playedAt, createdAt, id)", () => {
    const x = match({ teamA: ["a", "b"], teamB: ["c", "d"], playedAt: T0, createdAt: 2, id: "z" });
    const y = match({ teamA: ["a", "b"], teamB: ["c", "d"], playedAt: T0, createdAt: 1, id: "y" });
    const w = match({ teamA: ["a", "b"], teamB: ["c", "d"], playedAt: T0, createdAt: 1, id: "x" });
    expect(replay(players, [x, y, w]).results.map((r) => r.matchId)).toEqual(["x", "y", "z"]);
  });

  it("discounts K after three games of the same four on the same local day, regardless of orientation", () => {
    const orient = [
      { teamA: ["a", "b"], teamB: ["c", "d"] },
      { teamA: ["d", "c"], teamB: ["b", "a"] },
      { teamA: ["a", "c"], teamB: ["b", "d"] },
      { teamA: ["a", "b"], teamB: ["c", "d"] },
      { teamA: ["b", "d"], teamB: ["a", "c"] },
    ] as const;
    const ms = orient.map((o) => match({ teamA: [...o.teamA], teamB: [...o.teamB] }));
    const r = replay(players, ms);
    expect(r.results.map((x) => x.priorSameSetGames)).toEqual([0, 1, 2, 3, 4]);
    expect(r.results.map((x) => x.kEff)).toEqual([0.35, 0.35, 0.35, 0.175, 0.175]);
    expect(matchupKey(["a", "b", "c", "d"])).toBe(matchupKey(["d", "c", "b", "a"]));
  });

  it("resets the repeat count on a new local day (timezone aware) and for different sets", () => {
    const la = { ...config, timezone: "America/Los_Angeles" };
    // Same UTC day, but they straddle local midnight in Los Angeles.
    const lateLA = Date.UTC(2026, 0, 11, 7, 30); // Jan 10 23:30 LA
    const earlyLA = Date.UTC(2026, 0, 11, 8, 30); // Jan 11 00:30 LA
    const base = { teamA: ["a", "b"] as [string, string], teamB: ["c", "d"] as [string, string] };
    const utc = replay(players, [match({ ...base, playedAt: lateLA }), match({ ...base, playedAt: earlyLA })]);
    expect(utc.results.map((x) => x.priorSameSetGames)).toEqual([0, 1]);
    const local = replay(players, [match({ ...base, playedAt: lateLA, config: la }), match({ ...base, playedAt: earlyLA, config: la })]);
    expect(local.results.map((x) => x.priorSameSetGames)).toEqual([0, 0]);
    const other = replay(players, [match({ ...base }), match({ teamA: ["a", "b"], teamB: ["c", "e"] })]);
    expect(other.results.map((x) => x.priorSameSetGames)).toEqual([0, 0]);
  });

  it("counts only the trailing window for reliability weights", () => {
    const base = { teamA: ["a", "b"] as [string, string], teamB: ["c", "d"] as [string, string] };
    const old = Array.from({ length: 6 }, (_, i) => match({ ...base, playedAt: T0 - 400 * DAY + i * DAY }));
    const recent = match({ ...base, playedAt: T0 });
    const r = replay(players, [...old, recent]);
    expect(r.results.at(-1)!.priorGames).toEqual([0, 0, 0, 0]);
    expect(r.ratedGames.get("a")).toBe(7);
    const near = replay(players, [match({ ...base, playedAt: T0 - 10 * DAY }), recent]);
    expect(near.results.at(-1)!.priorGames).toEqual([1, 1, 1, 1]);
  });

  it("does not feed unrated matches to the algorithm", () => {
    const base = { teamA: ["a", "b"] as [string, string], teamB: ["c", "d"] as [string, string] };
    const unrated = match({ ...base, rated: false, scoreA: 11, scoreB: 0 });
    const next = match({ ...base });
    const withUnrated = replay(players, [unrated, next]);
    const without = replay(players, [next]);
    expect(withUnrated.results[0].delta).toEqual([0, 0, 0, 0]);
    expect(withUnrated.results[1].delta).toEqual(without.results[0].delta);
    expect(withUnrated.results[1].priorSameSetGames).toBe(0);
    expect(withUnrated.ratedGames.get("a")).toBe(1);
  });

  it("uses each match's stored config and never rewrites it when a newer config exists", () => {
    const base = { teamA: ["a", "b"] as [string, string], teamB: ["c", "d"] as [string, string] };
    const old = match({ ...base, playedAt: T0 });
    const newer = match({ ...base, playedAt: T0 + 3 * DAY, config: { ...config, k: 0.7, maximumTeamDelta: 0.2 } });
    const before = replay(players, [old]);
    const both = replay(players, [old, newer]);
    expect(both.results[0]).toEqual(before.results[0]);
    expect(both.results[1].kEff).toBe(0.7);
  });

  it("recomputes later results when an earlier match is corrected", () => {
    const base = { teamA: ["a", "b"] as [string, string], teamB: ["c", "d"] as [string, string] };
    const first = match({ ...base, playedAt: T0 });
    const second = match({ ...base, playedAt: T0 + DAY });
    const orig = replay(players, [first, second]);
    const corrected = replay(players, [{ ...first, scoreA: 5, scoreB: 11 }, second]);
    expect(corrected.results[1].pre[0]).not.toBeCloseTo(orig.results[1].pre[0], 6);
    expect(corrected.results[1].pre[0]).toBeCloseTo(corrected.results[0].post[0], 12);
  });

  it("flags players outside the 2-6 display range without clipping", () => {
    const r = replay([{ id: "a", initialRating: 6 }, { id: "b", initialRating: 3 }, { id: "c", initialRating: 3 }, { id: "d", initialRating: 3 }], [
      match({ teamA: ["a", "b"], teamB: ["c", "d"], scoreA: 11, scoreB: 0 }),
    ]);
    expect(r.finalRatings.get("a")!).toBeGreaterThan(6 - 0.1);
    const fixed = replay([{ id: "a", initialRating: 6.5 }, { id: "b", initialRating: 3 }, { id: "c", initialRating: 3 }, { id: "d", initialRating: 3 }], []);
    expect(fixed.outOfRange).toEqual([{ playerId: "a", rating: 6.5 }]);
  });

  it("rejects corrupt inputs", () => {
    expect(() => replay(players, [match({ teamA: ["a", "a"], teamB: ["c", "d"] })])).toThrow(ReplayError);
    expect(() => replay(players, [match({ teamA: ["a", "zz"], teamB: ["c", "d"] })])).toThrow(ReplayError);
    expect(() => replay(players, [match({ teamA: ["a", "b"], teamB: ["c", "d"], scoreA: 10, scoreB: 10 })])).toThrow(ReplayError);
  });
});
