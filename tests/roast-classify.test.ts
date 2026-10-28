import { describe, expect, it } from "vitest";
import events from "@/i18n/vi-roast.events.json";
import {
  classifyChemistry,
  classifyPlayerStatus,
  classifyPrediction,
  classifyRating,
  classifyResult,
  classifyStreak,
  currentStreak,
} from "@/lib/roast/classify-event";
import { teamRoast, preWinProbFor, playerRatingEvent } from "@/lib/roast/match-events";
import { eligibleLines, hashString, isLineAccurate, matchSeed, pickMessage, predictionSeed } from "@/lib/roast/pick-message";
import { gameWinProbability } from "@/lib/rating";

describe("classifyPrediction (spec thresholds)", () => {
  it.each([
    [1, "prediction_heavy_favorite"], [0.85, "prediction_heavy_favorite"], [0.8499, "prediction_favorite"],
    [0.6, "prediction_favorite"], [0.5999, "prediction_even"], [0.5, "prediction_even"], [0.4001, "prediction_even"],
    [0.4, "prediction_underdog"], [0.15001, "prediction_underdog"], [0.15, "prediction_longshot"], [0, "prediction_longshot"],
  ])("pWin %f -> %s", (p, event) => expect(classifyPrediction(p)).toBe(event));

  it("describes the two teams of one matchup consistently, never as two favourites", () => {
    for (let p = 0.01; p < 1; p += 0.01) {
      const a = classifyPrediction(p);
      const b = classifyPrediction(1 - p);
      const fav = (e: string) => e === "prediction_heavy_favorite" || e === "prediction_favorite";
      expect(fav(a) && fav(b)).toBe(false);
    }
  });

  it("is driven by game win probability, not point share, and honours target and win-by rule", () => {
    // Same point share (0.55), but the game probability, and so the event, depends on the format.
    const share = 0.55;
    expect(classifyPrediction(share)).toBe("prediction_even");
    expect(classifyPrediction(gameWinProbability(share, 21, 2))).toBe("prediction_favorite");
    expect(gameWinProbability(share, 21, 2)).toBeGreaterThan(gameWinProbability(share, 21, 1));
    expect(gameWinProbability(share, 11, 1)).toBeLessThan(gameWinProbability(share, 21, 1));
  });
});

describe("classifyResult", () => {
  const r = (scoreFor: number, scoreAgainst: number, target = 11, preWinProb: number | null = 0.6) =>
    classifyResult({ scoreFor, scoreAgainst, target, preWinProb });

  it("bagels for every target, both sides", () => {
    for (const t of [11, 15, 21]) {
      expect(r(t, 0, t).result).toBe("bagel_winner");
      expect(r(0, t, t).result).toBe("bagel_loser");
    }
  });

  it("close games: win by 1 (11-10), win by 2 (11-9, 12-10, 14-12), and 15/21", () => {
    expect(r(11, 10).result).toBe("close_win");
    expect(r(10, 11).result).toBe("close_loss");
    expect(r(11, 9).result).toBe("close_win");
    expect(r(14, 12).result).toBe("close_win");
    expect(r(12, 14).result).toBe("close_loss");
    expect(r(15, 14, 15).result).toBe("close_win");
    expect(r(22, 20, 21).result).toBe("close_win");
    expect(r(21, 19, 21).result).toBe("close_win");
  });

  it("blowouts: loser/winner <= 0.4, not a bagel", () => {
    expect(r(11, 4).result).toBe("blowout_win"); // 0.364
    expect(r(4, 11).result).toBe("blowout_loss");
    expect(r(11, 5, 11, 0.7).result).toBe("expected_win"); // 0.4545 is not a blowout
    expect(r(21, 8, 21).result).toBe("blowout_win"); // 0.381
    expect(r(21, 9, 21, 0.3).result).toBeNull(); // 0.43, underdog winner: no accurate generic line
    expect(r(15, 6, 15).result).toBe("blowout_win"); // exactly 0.4
  });

  it("only calls a plain win 'expected' when the saved prediction says the winner was favoured", () => {
    expect(r(11, 6, 11, 0.7).result).toBe("expected_win");
    expect(r(11, 6, 11, 0.5).result).toBe("expected_win");
    expect(r(11, 6, 11, 0.45).result).toBeNull();
    expect(r(11, 6, 11, 0.2).result).toBeNull();
    expect(r(11, 6, 11, null).result).toBeNull();
    expect(r(6, 11, 11, 0.7).result).toBeNull(); // losers have no generic bucket
  });

  it("flags an upset only from a saved pre-match win probability <= 0.25, for the winner only", () => {
    expect(r(11, 6, 11, 0.25).upset).toBe(true);
    expect(r(11, 6, 11, 0.2501).upset).toBe(false);
    expect(r(11, 6, 11, 0.05).upset).toBe(true);
    expect(r(6, 11, 11, 0.05).upset).toBe(false); // the loser of an upset-looking game is not an upset winner
    expect(r(11, 6, 11, null).upset).toBe(false); // never claim an upset without saved metadata
    expect(r(11, 10, 11, null).result).toBe("close_win"); // falls back to score-based
  });

  it("is symmetric: exactly one side is the winner", () => {
    for (const [a, b] of [[11, 3], [12, 10], [11, 0], [11, 10]]) {
      expect(r(a, b).won).toBe(true);
      expect(r(b, a).won).toBe(false);
    }
  });
});

describe("team perspective from the saved pre-match probability", () => {
  it("uses the complement for Team B and null when nothing was saved", () => {
    expect(preWinProbFor("A", 0.7)).toBe(0.7);
    expect(preWinProbFor("B", 0.7)).toBeCloseTo(0.3, 12);
    expect(preWinProbFor("A", null)).toBeNull();
    expect(preWinProbFor("B", Number.NaN)).toBeNull();
  });

  it("describes an upset only for the genuine underdog", () => {
    const m = { scoreA: 11, scoreB: 7, formatTarget: 11, rated: true, predictedWinProbA: 0.2 };
    expect(teamRoast(m, "A")).toMatchObject({ won: true, upset: true });
    expect(teamRoast(m, "B")).toMatchObject({ won: false, upset: false });
    const favWins = { ...m, predictedWinProbA: 0.9 };
    expect(teamRoast(favWins, "A").upset).toBe(false);
    expect(teamRoast(favWins, "A").result).toBe("expected_win");
    expect(teamRoast({ ...m, predictedWinProbA: null }, "A").upset).toBe(false);
  });
});

describe("classifyRating", () => {
  it("uses the precise stored delta and the 0.04 threshold", () => {
    expect(classifyRating(0.04)).toBe("rating_gain_large");
    expect(classifyRating(0.0399)).toBe("rating_gain_small");
    expect(classifyRating(-0.04)).toBe("rating_drop_large");
    expect(classifyRating(-0.0399)).toBe("rating_drop_small");
    expect(classifyRating(0.0001)).toBe("rating_gain_small"); // displays as 0.00 but is a real gain
    expect(classifyRating(-0.0001)).toBe("rating_drop_small");
    expect(classifyRating(0)).toBeNull();
    expect(classifyRating(null)).toBeNull();
    expect(classifyRating(Number.NaN)).toBeNull();
  });

  it("never calls a negative change a gain, and unrated matches have no rating line", () => {
    for (let d = -0.1; d < 0; d += 0.001) expect(classifyRating(d)).toMatch(/drop/);
    for (let d = 0.001; d < 0.1; d += 0.001) expect(classifyRating(d)).toMatch(/gain/);
    expect(playerRatingEvent({ rated: false }, 0.08)).toBeNull();
    expect(playerRatingEvent({ rated: true }, 0.08)).toBe("rating_gain_large");
  });
});

describe("streaks, chemistry, player status", () => {
  it("needs three consecutive results, newest first", () => {
    expect(currentStreak([])).toBeNull();
    expect(classifyStreak(currentStreak([true, true]))).toBeNull();
    expect(classifyStreak(currentStreak([true, true, true, false]))).toBe("win_streak");
    expect(classifyStreak(currentStreak([false, false, false, false, true]))).toBe("loss_streak");
    expect(classifyStreak(currentStreak([true, false, true, true, true]))).toBeNull();
    expect(currentStreak([true, true, false])).toEqual({ type: "win", length: 2 });
  });

  it("claims chemistry only after 8 shared matches and a clear opponent-adjusted gap", () => {
    expect(classifyChemistry({ games: 7, wins: 7, expectedWins: 3 })).toBeNull();
    expect(classifyChemistry({ games: 8, wins: 7, expectedWins: 4 })).toBe("partner_chemistry_good");
    expect(classifyChemistry({ games: 8, wins: 1, expectedWins: 4 })).toBe("partner_chemistry_bad");
    expect(classifyChemistry({ games: 10, wins: 6, expectedWins: 5.5 })).toBeNull();
    // Winning a lot against weak opponents is not chemistry when that was expected.
    expect(classifyChemistry({ games: 10, wins: 9, expectedWins: 8.8 })).toBeNull();
  });

  it("flags new and provisional players from existing stats only", () => {
    expect(classifyPlayerStatus({ games: 0, provisional: true })).toBe("new_player");
    expect(classifyPlayerStatus({ games: 4, provisional: true })).toBe("provisional");
    expect(classifyPlayerStatus({ games: 40, provisional: false })).toBeNull();
  });
});

describe("pickMessage", () => {
  const lines = events.close_win;

  it("is stable: the same seed always gives the same line", () => {
    const a = pickMessage(lines, matchSeed("m1", "A"), 0, { scoreFor: 12, scoreAgainst: 10 });
    for (let i = 0; i < 20; i++) expect(pickMessage(lines, matchSeed("m1", "A"), 0, { scoreFor: 12, scoreAgainst: 10 })).toBe(a);
  });

  it("cycles through every eligible line without an immediate repeat, then wraps", () => {
    const ctx = { scoreFor: 12, scoreAgainst: 10 };
    const pool = eligibleLines(lines, ctx);
    const seen: string[] = [];
    for (let v = 0; v < pool.length; v++) seen.push(pickMessage(lines, "seed", v, ctx)!);
    expect(new Set(seen).size).toBe(pool.length);
    for (let v = 1; v < seen.length; v++) expect(seen[v]).not.toBe(seen[v - 1]);
    expect(pickMessage(lines, "seed", pool.length, ctx)).toBe(seen[0]);
    expect(pickMessage(lines, "seed", -1, ctx)).toBe(seen[pool.length - 1]);
  });

  it("different matches start at different lines", () => {
    const starts = new Set(Array.from({ length: 40 }, (_, i) => pickMessage(events.expected_win, `m${i}|A`, 0)));
    expect(starts.size).toBeGreaterThan(3);
  });

  it("returns null rather than a wrong line when nothing is eligible", () => {
    expect(pickMessage([], "s")).toBeNull();
    expect(pickMessage(["11–0 là tỉ số gì vậy"], "s", 0, { scoreFor: 15, scoreAgainst: 0 })).toBeNull();
  });

  it("hash and seeds are deterministic and order-independent where they should be", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
    const a = predictionSeed({ teamA: ["p2", "p1"], teamB: ["p4", "p3"], target: 11, winBy: 1, team: "A" });
    const b = predictionSeed({ teamA: ["p1", "p2"], teamB: ["p3", "p4"], target: 11, winBy: 1, team: "A" });
    expect(a).toBe(b);
    expect(predictionSeed({ teamA: ["p1", "p2"], teamB: ["p3", "p4"], target: 15, winBy: 1, team: "A" })).not.toBe(b);
    expect(predictionSeed({ teamA: ["p1", "p2"], teamB: ["p3", "p4"], target: 11, winBy: 2, team: "A" })).not.toBe(b);
  });
});

describe("accuracy guards on literal facts in provided lines", () => {
  it("only shows a hard-coded score when it matches the described result", () => {
    expect(isLineAccurate("11–0! Thôi tha người ta", { scoreFor: 11, scoreAgainst: 0 })).toBe(true);
    expect(isLineAccurate("11–0! Thôi tha người ta", { scoreFor: 15, scoreAgainst: 0 })).toBe(false);
    expect(isLineAccurate("0–11. Không sao", { scoreFor: 0, scoreAgainst: 11 })).toBe(true);
    expect(isLineAccurate("0–11. Không sao", { scoreFor: 0, scoreAgainst: 21 })).toBe(false);
    expect(isLineAccurate("11–10 mà ăn mừng", { scoreFor: 11, scoreAgainst: 10 })).toBe(true);
    expect(isLineAccurate("11–10 mà ăn mừng", { scoreFor: 12, scoreAgainst: 10 })).toBe(false);
    expect(isLineAccurate("11–10 mà ăn mừng")).toBe(false);
  });

  it("only claims a one-point game when the margin is one", () => {
    expect(isLineAccurate("Thua một điểm, nhưng", { scoreFor: 10, scoreAgainst: 11 })).toBe(true);
    expect(isLineAccurate("Thua một điểm, nhưng", { scoreFor: 10, scoreAgainst: 12 })).toBe(false);
    expect(isLineAccurate("Thắng một điểm cũng là thắng", { scoreFor: 12, scoreAgainst: 10 })).toBe(false);
    expect(isLineAccurate("Một điểm định đoạt số phận", { scoreFor: 11, scoreAgainst: 10 })).toBe(true);
    // Not an opener: a joke about a consolation point is fine for any score.
    expect(isLineAccurate("Ai cho bên thua một điểm an ủi trong tưởng tượng đi.", { scoreFor: 0, scoreAgainst: 15 })).toBe(true);
  });

  it("a 15-0 or 21-0 bagel never shows an '11–0' line, and a 12-10 win never says 'one point'", () => {
    for (const t of [15, 21]) {
      for (const l of eligibleLines(events.bagel_winner, { scoreFor: t, scoreAgainst: 0 })) expect(l).not.toMatch(/11–0/);
      for (const l of eligibleLines(events.bagel_loser, { scoreFor: 0, scoreAgainst: t })) expect(l).not.toMatch(/0–11/);
    }
    for (const l of eligibleLines(events.close_win, { scoreFor: 12, scoreAgainst: 10 })) expect(l).not.toMatch(/một điểm|11–10/i);
    for (const l of eligibleLines(events.close_loss, { scoreFor: 10, scoreAgainst: 12 })) expect(l).not.toMatch(/^thua một điểm/i);
  });
});
