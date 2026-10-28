import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  actualPointShare,
  computeMatchUpdate,
  DEFAULT_RATING_CONFIG as C,
  effectiveK,
  expectedPointShare,
  gameWinProbability,
  predictMatch,
  reliabilityWeight,
  validateScore,
  type Four,
} from "@/lib/rating";

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** Independent reference: propagate score-state probabilities forward on a bounded grid. */
function referenceWinProbability(p: number, n: number): number {
  const q = 1 - p;
  const size = n + 400;
  let grid = Array.from({ length: size + 2 }, () => new Array<number>(size + 2).fill(0));
  grid[0][0] = 1;
  let aWins = 0;
  for (let total = 0; total < 2 * size; total++) {
    const next = Array.from({ length: size + 2 }, () => new Array<number>(size + 2).fill(0));
    for (let a = 0; a <= Math.min(total, size); a++) {
      const b = total - a;
      if (b < 0 || b > size) continue;
      const mass = grid[a][b];
      if (mass === 0) continue;
      for (const [na, nb, pr] of [[a + 1, b, p], [a, b + 1, q]] as const) {
        const m = mass * pr;
        if (na >= n && na - nb >= 2) aWins += m;
        else if (nb >= n && nb - na >= 2) continue;
        else if (na <= size && nb <= size) next[na][nb] += m;
      }
    }
    grid = next;
  }
  return aWins;
}

describe("expected point share", () => {
  it("is 0.5 for equal teams and complementary when teams swap", () => {
    expect(expectedPointShare(4, 4, C.beta)).toBe(0.5);
    fc.assert(
      fc.property(fc.double({ min: 1, max: 7, noNaN: true }), fc.double({ min: 1, max: 7, noNaN: true }), (a, b) => {
        expect(expectedPointShare(a, b, C.beta) + expectedPointShare(b, a, C.beta)).toBeCloseTo(1, 12);
      }),
    );
  });

  it("matches a known numeric fixture", () => {
    expect(expectedPointShare(4, 3, 2.6)).toBeCloseTo(0.9308615, 6);
    expect(expectedPointShare(3.5, 3.9, 2.6)).toBeCloseTo(1 / (1 + Math.exp(1.04)), 12);
  });
});

describe("game win probability", () => {
  it.each([11, 15, 21])("is 0.5 when p = 0.5 (n=%i)", (n) => {
    expect(gameWinProbability(0.5, n)).toBeCloseTo(0.5, 12);
  });

  it("handles the extremes", () => {
    expect(gameWinProbability(1, 11)).toBe(1);
    expect(gameWinProbability(0, 11)).toBe(0);
  });

  it.each([11, 15, 21])("matches an independent grid propagation (n=%i)", (n) => {
    for (const p of [0.1, 0.35, 0.5, 0.6, 0.77, 0.93]) {
      expect(gameWinProbability(p, n)).toBeCloseTo(referenceWinProbability(p, n), 9);
    }
  });

  it("is complementary and monotonic in p, and amplifies point share", () => {
    fc.assert(
      fc.property(fc.double({ min: 0.001, max: 0.999, noNaN: true }), fc.constantFrom(11, 15, 21), (p, n) => {
        const w = gameWinProbability(p, n);
        expect(w + gameWinProbability(1 - p, n)).toBeCloseTo(1, 10);
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
        if (p > 0.5) expect(w).toBeGreaterThanOrEqual(p - 1e-12);
        if (p < 0.5) expect(w).toBeLessThanOrEqual(p + 1e-12);
      }),
    );
    expect(gameWinProbability(0.55, 11)).toBeLessThan(gameWinProbability(0.6, 11));
  });

  it("gives equal-rated teams a 50/50 game and probabilities that sum to 1", () => {
    const pred = predictMatch([3.2, 4.4, 3.8, 3.8], 15, C);
    expect(pred.pointShareA).toBeCloseTo(0.5, 12);
    expect(pred.winProbA).toBeCloseTo(0.5, 12);
    expect(pred.winProbA + pred.winProbB).toBeCloseTo(1, 12);
  });

  it("rejects invalid targets", () => {
    expect(() => gameWinProbability(0.5, 0)).toThrow();
  });
});

describe("score validation", () => {
  const ok = [[11, 0], [11, 9], [9, 11], [12, 10], [13, 11], [20, 18], [15, 13], [21, 19], [25, 23]];
  it.each(ok)("accepts %i-%i to 11/15/21 where valid", (a, b) => {
    const target = Math.max(a, b) >= 21 ? 21 : Math.max(a, b) >= 15 ? 15 : 11;
    expect(validateScore(a, b, target).valid).toBe(true);
  });
  it("rejects ties, short games, bad margins and bad inputs", () => {
    expect(validateScore(11, 11, 11).valid).toBe(false);
    expect(validateScore(10, 8, 11).valid).toBe(false);
    expect(validateScore(11, 10, 11).valid).toBe(false);
    expect(validateScore(12, 11, 11).valid).toBe(false);
    expect(validateScore(13, 10, 11).valid).toBe(false);
    expect(validateScore(14, 11, 11).valid).toBe(false);
    expect(validateScore(11, 9, 15).valid).toBe(false);
    expect(validateScore(-1, 11, 11).valid).toBe(false);
    expect(validateScore(11.5, 3, 11).valid).toBe(false);
    expect(validateScore(11, 3, 12).valid).toBe(false);
    expect(validateScore(0, 0, 11).valid).toBe(false);
  });
  it("accepts exactly the games that end as soon as the rules permit", () => {
    fc.assert(
      fc.property(fc.constantFrom(11, 15, 21), fc.integer({ min: 0, max: 40 }), fc.integer({ min: 0, max: 40 }), (n, a, b) => {
        const w = Math.max(a, b);
        const l = Math.min(a, b);
        const expected = w >= n && w - l >= 2 && (w === n || w - l === 2);
        expect(validateScore(a, b, n).valid).toBe(expected);
      }),
    );
  });
});

describe("reliability weights and effective K", () => {
  it.each([
    [0, 1.5], [4, 1.5], [5, 1.25], [14, 1.25], [15, 1.0], [29, 1.0], [30, 0.8], [200, 0.8],
  ])("%i games -> weight %f", (games, weight) => {
    expect(reliabilityWeight(games, C.weightTiers)).toBe(weight);
  });
  it("discounts K after three games with the same four", () => {
    expect([0, 1, 2, 3, 4].map((n) => effectiveK(n, C))).toEqual([0.35, 0.35, 0.35, 0.175, 0.175]);
  });
});

describe("match update", () => {
  const input = (over: Partial<Parameters<typeof computeMatchUpdate>[0]> = {}) => ({
    ratings: [4, 4, 3, 3] as Four<number>,
    priorGames: [20, 20, 20, 20] as Four<number>,
    scoreA: 11,
    scoreB: 5,
    kEff: 0.35,
    config: C,
    ...over,
  });

  it("caps the team-average shift (known fixture: favourite wins 11-5)", () => {
    const u = computeMatchUpdate(input());
    expect(u.expectedShareA).toBeCloseTo(0.9308615, 6);
    expect(u.capped).toBe(true);
    expect(u.teamDelta).toBeCloseTo(-0.08, 12);
    expect(u.deltas[0]).toBeCloseTo(-0.08, 12);
    expect(u.deltas[2]).toBeCloseTo(0.08, 12);
  });

  it("an upset moves ratings in the expected direction, uncapped", () => {
    const u = computeMatchUpdate(input({ ratings: [3.5, 3.5, 3.5, 3.5], scoreA: 11, scoreB: 9 }));
    expect(u.capped).toBe(false);
    expect(u.teamDelta).toBeCloseTo(0.35 * (11 / 20 - 0.5), 12);
  });

  it("splits team change by reliability weight (provisional players move more)", () => {
    const u = computeMatchUpdate(input({ ratings: [3.5, 3.5, 3.5, 3.5], priorGames: [0, 30, 15, 15] }));
    expect(u.weights).toEqual([1.5, 0.8, 1, 1]);
    expect(u.deltas[0] / u.deltas[1]).toBeCloseTo(1.5 / 0.8, 12);
    expect(u.deltas[0] + u.deltas[1]).toBeCloseTo(2 * u.teamDelta, 12);
    expect(u.deltas[2]).toBeCloseTo(u.deltas[3], 12);
  });

  it("is zero-sum, respects the team cap, and is symmetric under swapping teams", () => {
    const rating = fc.double({ min: 0, max: 8, noNaN: true });
    const games = fc.integer({ min: 0, max: 60 });
    const score = fc.constantFrom<[number, number]>([11, 0], [11, 7], [7, 11], [12, 10], [3, 11], [11, 9]);
    fc.assert(
      fc.property(fc.tuple(rating, rating, rating, rating), fc.tuple(games, games, games, games), score, (r, g, [a, b]) => {
        const u = computeMatchUpdate(input({ ratings: r, priorGames: g, scoreA: a, scoreB: b }));
        expect(Math.abs(sum(u.deltas))).toBeLessThan(1e-12);
        expect(Math.abs(u.teamDelta)).toBeLessThanOrEqual(0.08 + 1e-15);
        expect((u.deltas[0] + u.deltas[1]) / 2).toBeCloseTo(u.teamDelta, 12);
        const sw = computeMatchUpdate(
          input({ ratings: [r[2], r[3], r[0], r[1]], priorGames: [g[2], g[3], g[0], g[1]], scoreA: b, scoreB: a }),
        );
        expect(sw.deltas[0]).toBeCloseTo(u.deltas[2], 12);
        expect(sw.deltas[1]).toBeCloseTo(u.deltas[3], 12);
        expect(sw.deltas[2]).toBeCloseTo(u.deltas[0], 12);
        expect(sw.expectedShareA).toBeCloseTo(1 - u.expectedShareA, 12);
      }),
    );
  });

  it("requires a positive point total", () => {
    expect(() => actualPointShare(0, 0)).toThrow();
  });
});
