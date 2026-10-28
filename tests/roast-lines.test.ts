import { describe, expect, it } from "vitest";
import events from "@/i18n/vi-roast.events.json";
import type { EventCatalog } from "@/i18n/types";
import { balanceTeams } from "@/lib/balance-teams";
import { displaysAsZero, formatCincoDeltaPrecise } from "@/lib/format";
import { buildMatchRoast, buildShareText, type RoastMatch } from "@/lib/roast/lines";
import { isLineAccurate } from "@/lib/roast/pick-message";
import { gameWinProbability } from "@/lib/rating";
import { validateScore } from "@/lib/rating";

const catalog = events as unknown as EventCatalog;
const WINNER = new Set(["bagel_winner", "close_win", "blowout_win", "expected_win"]);
const LOSER = new Set(["bagel_loser", "close_loss", "blowout_loss"]);
const bucketsOf = (text: string) => Object.entries(catalog).filter(([, v]) => v.includes(text)).map(([k]) => k);

const base = (over: Partial<RoastMatch> = {}): RoastMatch => ({
  id: "match-1",
  scoreA: 11,
  scoreB: 7,
  formatTarget: 11,
  rated: true,
  predictedWinProbA: 0.7,
  teamA: [{ id: "a1", name: "Ann", delta: 0.03 }, { id: "a2", name: "Bao", delta: 0.05 }],
  teamB: [{ id: "b1", name: "Cuong", delta: -0.03 }, { id: "b2", name: "Dung", delta: -0.05 }],
  ...over,
});

/** Every valid final score for a target and rule, up to a generous overtime. */
function validScores(target: number, winBy: 1 | 2): [number, number][] {
  const out: [number, number][] = [];
  for (let w = 0; w <= target + 12; w++)
    for (let l = 0; l <= target + 12; l++) if (validateScore(w, l, target, winBy).valid && w > l) out.push([w, l]);
  return out;
}

describe("buildMatchRoast across every target, rule, score and winner", () => {
  for (const target of [11, 15, 21] as const) {
    for (const winBy of [1, 2] as const) {
      it(`to ${target}, win by ${winBy}: only accurate, correctly-assigned lines`, () => {
        const scores = validScores(target, winBy);
        expect(scores.length).toBeGreaterThanOrEqual(target); // sanity: win by 1 has exactly `target` endings
        for (const [w, l] of scores) {
          for (const aWins of [true, false]) {
            for (const pre of [null, 0.05, 0.3, 0.5, 0.9]) {
              const m = base({ scoreA: aWins ? w : l, scoreB: aWins ? l : w, formatTarget: target, predictedWinProbA: pre });
              for (let variant = 0; variant < 4; variant++) {
                const r = buildMatchRoast(catalog, m, variant);
                const win = aWins ? r.A : r.B;
                const lose = aWins ? r.B : r.A;
                if (win) {
                  expect(WINNER.has(win.event), `${w}-${l} ${win.event}`).toBe(true);
                  expect(isLineAccurate(win.text, { scoreFor: w, scoreAgainst: l })).toBe(true);
                  expect(bucketsOf(win.text)).toContain(win.event);
                }
                if (lose) {
                  expect(LOSER.has(lose.event), `${w}-${l} ${lose.event}`).toBe(true);
                  expect(isLineAccurate(lose.text, { scoreFor: l, scoreAgainst: w })).toBe(true);
                  expect(bucketsOf(lose.text)).toContain(lose.event);
                }
                // An upset is only ever claimed from a saved probability for the actual winner.
                const winnerPre = pre === null ? null : aWins ? pre : 1 - pre;
                if (r.upset) {
                  expect(winnerPre).not.toBeNull();
                  expect(winnerPre!).toBeLessThanOrEqual(0.25);
                  expect(bucketsOf(r.upset.text)).toContain("upset_win");
                }
                if (winnerPre !== null && winnerPre <= 0.25) expect(r.upset).not.toBeNull();
              }
            }
          }
        }
      });
    }
  }

  it("is deterministic, changes with 'Chửi Nữa Đi', and never mutates its input", () => {
    const m = Object.freeze(base({ scoreA: 12, scoreB: 10, predictedWinProbA: 0.2 }));
    const again = buildMatchRoast(catalog, m, 0);
    expect(buildMatchRoast(catalog, m, 0)).toEqual(again);
    const next = buildMatchRoast(catalog, m, 1);
    expect(next.A?.text).not.toBe(again.A?.text);
    expect(next.B?.text).not.toBe(again.B?.text);
    expect(m.scoreA).toBe(12);
  });

  it("describes a 15-0 bagel and a 12-10 win-by-2 without hard-coded wrong facts", () => {
    const bagel = buildMatchRoast(catalog, base({ scoreA: 15, scoreB: 0, formatTarget: 15 }), 0);
    expect(bagel.A?.event).toBe("bagel_winner");
    expect(bagel.B?.event).toBe("bagel_loser");
    for (let v = 0; v < 12; v++) {
      const r = buildMatchRoast(catalog, base({ scoreA: 15, scoreB: 0, formatTarget: 15 }), v);
      expect(r.A!.text).not.toMatch(/11–0/);
      expect(r.B!.text).not.toMatch(/0–11/);
      const close = buildMatchRoast(catalog, base({ scoreA: 12, scoreB: 10 }), v);
      expect(close.A!.text).not.toMatch(/một điểm|11–10/i);
    }
  });

  it("falls back to score-based lines, never an upset, when no pre-match probability was saved", () => {
    const r = buildMatchRoast(catalog, base({ scoreA: 11, scoreB: 10, predictedWinProbA: null }), 0);
    expect(r.upset).toBeNull();
    expect(r.A?.event).toBe("close_win");
    expect(r.B?.event).toBe("close_loss");
  });

  it("uses the saved pre-match probability, not post-match ratings, for the upset call", () => {
    // Post-match deltas look 'normal'; only the saved probability decides.
    const upset = buildMatchRoast(catalog, base({ predictedWinProbA: 0.1 }), 0);
    expect(upset.upset).not.toBeNull();
    const notUpset = buildMatchRoast(catalog, base({ predictedWinProbA: 0.5 }), 0);
    expect(notUpset.upset).toBeNull();
    const bWinsAsFavourite = buildMatchRoast(catalog, base({ scoreA: 5, scoreB: 11, predictedWinProbA: 0.1 }), 0);
    expect(bWinsAsFavourite.upset).toBeNull();
  });

  it("gives the player's own rating line from the stored precise delta", () => {
    const gain = buildMatchRoast(catalog, base(), 0, "a2");
    expect(gain.rating?.event).toBe("rating_gain_large");
    expect(gain.rating?.delta).toBe(0.05);
    expect(buildMatchRoast(catalog, base(), 0, "a1").rating?.event).toBe("rating_gain_small");
    expect(buildMatchRoast(catalog, base(), 0, "b2").rating?.event).toBe("rating_drop_large");
    expect(buildMatchRoast(catalog, base(), 0, "b1").rating?.event).toBe("rating_drop_small");
    expect(buildMatchRoast(catalog, base(), 0).rating).toBeNull();
    expect(buildMatchRoast(catalog, base({ rated: false }), 0, "a1").rating).toBeNull();
    const zero = base({ teamA: [{ id: "a1", name: "Ann", delta: 0 }, { id: "a2", name: "Bao", delta: 0.05 }] });
    expect(buildMatchRoast(catalog, zero, 0, "a1").rating).toBeNull();
    // A real but tiny change is a (small) gain or drop, and is displayed as such.
    const tiny = base({ teamA: [{ id: "a1", name: "Ann", delta: 0.0004 }, { id: "a2", name: "Bao", delta: 0.05 }] });
    expect(buildMatchRoast(catalog, tiny, 0, "a1").rating?.event).toBe("rating_gain_small");
  });
});

describe("tiny rating changes are never shown as an exact zero", () => {
  it("formats <0.01 with its sign, and normal values with two decimals", () => {
    expect(formatCincoDeltaPrecise(0.004)).toBe("+<0.01");
    expect(formatCincoDeltaPrecise(-0.004)).toBe("−<0.01");
    expect(formatCincoDeltaPrecise(0)).toBe("0.00");
    expect(formatCincoDeltaPrecise(0.034)).toBe("+0.03");
    expect(formatCincoDeltaPrecise(-0.0451)).toBe("−0.05");
    expect(formatCincoDeltaPrecise(null)).toBe("—");
    expect(displaysAsZero(0.004)).toBe(true);
  });
});

describe("share text", () => {
  it("keeps names, scores and rating changes exact and adds the jokes after them", () => {
    const m = base({ scoreA: 11, scoreB: 10, predictedWinProbA: 0.2 });
    const lines = buildMatchRoast(catalog, m, 0);
    const text = buildShareText(m, lines, "Oct 28, 2026, 1:55 PM");
    expect(text).toContain("Ann & Bao 11–10 Cuong & Dung");
    expect(text).toContain("Ann +0.03");
    expect(text).toContain("Dung −0.05");
    expect(text).toContain("to 11");
    expect(text).toContain(lines.A!.text);
    expect(text).toContain(lines.upset!.text);
    expect(text.indexOf("11–10")).toBeLessThan(text.indexOf(lines.A!.text));
  });

  it("omits rating changes for unrated matches", () => {
    const m = base({ rated: false });
    expect(buildShareText(m, buildMatchRoast(catalog, m, 0), "when")).not.toMatch(/[+−]\d/);
  });
});

describe("balanceTeams", () => {
  const p = (id: string, rating: number) => ({ id, rating });
  it("pairs the strongest with the weakest", () => {
    expect(balanceTeams([p("a", 4.5), p("b", 4.2), p("c", 3.0), p("d", 2.9)])).toEqual(["a", "d", "b", "c"]);
  });
  it("keeps the current arrangement when it is already the best (and on ties)", () => {
    expect(balanceTeams([p("a", 4), p("b", 3), p("c", 3.5), p("d", 3.5)])).toEqual(["a", "b", "c", "d"]);
    expect(balanceTeams([p("a", 3), p("b", 3), p("c", 3), p("d", 3)])).toEqual(["a", "b", "c", "d"]);
  });
  it("never produces a worse split than the input and always returns the same four players", () => {
    const gap = (ids: string[], r: Record<string, number>) => Math.abs((r[ids[0]] + r[ids[1]] - r[ids[2]] - r[ids[3]]) / 2);
    for (let i = 0; i < 200; i++) {
      const r: Record<string, number> = { a: 2 + ((i * 7) % 40) / 10, b: 2 + ((i * 13) % 40) / 10, c: 2 + ((i * 17) % 40) / 10, d: 2 + ((i * 29) % 40) / 10 };
      const out = balanceTeams([p("a", r.a), p("b", r.b), p("c", r.c), p("d", r.d)]);
      expect([...out].sort()).toEqual(["a", "b", "c", "d"]);
      expect(gap(out, r)).toBeLessThanOrEqual(gap(["a", "b", "c", "d"], r) + 1e-12);
    }
  });
});

describe("predictor lines follow game win probability, not point share", () => {
  it("honours the selected target and rule", () => {
    // Same point share, three different game probabilities, three different classifications possible.
    const share = 0.58;
    const p11w1 = gameWinProbability(share, 11, 1);
    const p21w2 = gameWinProbability(share, 21, 2);
    expect(p21w2).toBeGreaterThan(p11w1);
  });
});
