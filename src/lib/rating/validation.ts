import { GAME_TARGETS } from "./config";

export type ScoreValidation = { valid: true } | { valid: false; reason: string };

/**
 * A valid completed game to `target`, win by 2, ending as soon as the rules permit:
 * either the winner has exactly `target` and the loser at most target-2, or the game went past
 * the target and the winner leads by exactly 2.
 */
export function validateScore(scoreA: number, scoreB: number, target: number): ScoreValidation {
  if (!(GAME_TARGETS as readonly number[]).includes(target)) return { valid: false, reason: "Game format must be 11, 15, or 21." };
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) return { valid: false, reason: "Scores must be whole numbers." };
  if (scoreA < 0 || scoreB < 0) return { valid: false, reason: "Scores cannot be negative." };
  if (scoreA === scoreB) return { valid: false, reason: "A game cannot end in a tie." };
  const winner = Math.max(scoreA, scoreB);
  const loser = Math.min(scoreA, scoreB);
  if (winner < target) return { valid: false, reason: `The winning team must reach at least ${target} points.` };
  if (winner === target) {
    if (loser > target - 2) return { valid: false, reason: "The winner must lead by at least 2 points." };
    return { valid: true };
  }
  if (winner - loser !== 2) {
    return {
      valid: false,
      reason: `Past ${target} the game ends as soon as a team leads by 2, so the margin must be exactly 2.`,
    };
  }
  return { valid: true };
}
