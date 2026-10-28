import type { GameTarget, RatingConfig, WinBy } from "./config";
import { expectedPointShare, teamRating } from "./engine";

/**
 * Probability that Team A wins a game to `target` when every rally is won by A independently with
 * probability `p`. Exact finite-state dynamic program. Win by 1: first to `target`. Win by 2: must also
 * lead by two, with a closed form at deuce. This is a simplified, uncalibrated model.
 */
export function gameWinProbability(p: number, target: number, winBy: WinBy): number {
  if (!Number.isInteger(target) || target < 1) throw new RangeError("target must be a positive integer");
  if (winBy !== 1 && winBy !== 2) throw new RangeError("winBy must be 1 or 2");
  const q = 1 - p;
  if (winBy === 1) {
    const first = new Map<number, number>();
    const f = (a: number, b: number): number => {
      if (a >= target) return 1;
      if (b >= target) return 0;
      const key = a * 1000 + b;
      const cached = first.get(key);
      if (cached !== undefined) return cached;
      const value = p * f(a + 1, b) + q * f(a, b + 1);
      first.set(key, value);
      return value;
    };
    return Math.min(1, Math.max(0, f(0, 0)));
  }
  const deuce = (p * p) / (p * p + q * q);
  const memo = new Map<number, number>();

  const w = (a: number, b: number): number => {
    if (a >= target && a - b >= 2) return 1;
    if (b >= target && b - a >= 2) return 0;
    if (a >= target - 1 && b >= target - 1) {
      if (a === b) return deuce;
      return a > b ? p + q * deuce : p * deuce;
    }
    const key = a * 1000 + b;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    const value = p * w(a + 1, b) + q * w(a, b + 1);
    memo.set(key, value);
    return value;
  };

  return Math.min(1, Math.max(0, w(0, 0)));
}

export interface MatchPrediction {
  teamARating: number;
  teamBRating: number;
  /** Expected share of rallies/points won by Team A (NOT the win probability). */
  pointShareA: number;
  winProbA: number;
  winProbB: number;
  target: GameTarget;
  winBy: WinBy;
}

export function predictMatch(
  ratings: readonly [number, number, number, number],
  target: GameTarget,
  config: Pick<RatingConfig, "beta">,
  winBy: WinBy,
): MatchPrediction {
  const teamARating = teamRating(ratings[0], ratings[1]);
  const teamBRating = teamRating(ratings[2], ratings[3]);
  const pointShareA = expectedPointShare(teamARating, teamBRating, config.beta);
  const winProbA = gameWinProbability(pointShareA, target, winBy);
  return { teamARating, teamBRating, pointShareA, winProbA, winProbB: 1 - winProbA, target, winBy };
}
