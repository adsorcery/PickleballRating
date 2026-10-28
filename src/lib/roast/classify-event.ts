import type { RoastEvent } from "@/i18n/types";

/*
 * Pure functions that turn facts the app already has (scores, saved pre-match win probability,
 * stored rating deltas, results history) into event keys. Nothing here recalculates a rating or a
 * probability, and nothing reads the database.
 */

// ---------- predictions ----------

export type PredictionEvent =
  | "prediction_heavy_favorite"
  | "prediction_favorite"
  | "prediction_even"
  | "prediction_underdog"
  | "prediction_longshot";

/** `pWin` is the game win probability (honouring target and win-by rule) of the team being described. */
export function classifyPrediction(pWin: number): PredictionEvent {
  if (pWin >= 0.85) return "prediction_heavy_favorite";
  if (pWin >= 0.6) return "prediction_favorite";
  if (pWin > 0.4) return "prediction_even";
  if (pWin > 0.15) return "prediction_underdog";
  return "prediction_longshot";
}

export const UPSET_MAX_PRE_WIN_PROB = 0.25;

// ---------- results ----------

export type ResultEvent =
  | "bagel_winner"
  | "bagel_loser"
  | "close_win"
  | "close_loss"
  | "blowout_win"
  | "blowout_loss"
  | "expected_win";

export interface ResultFacts {
  /** Final score of the team being described, and of its opponents. */
  scoreFor: number;
  scoreAgainst: number;
  target: number;
  /** The saved pre-match game win probability of the team being described, or null if unavailable. */
  preWinProb: number | null;
}

export interface ResultClassification {
  won: boolean;
  /** The score-based headline, or null when no line can be said accurately. */
  result: ResultEvent | null;
  /** A separate callout; only ever true when a saved pre-match probability exists. */
  upset: boolean;
}

export function classifyResult(f: ResultFacts): ResultClassification {
  const won = f.scoreFor > f.scoreAgainst;
  const winnerScore = Math.max(f.scoreFor, f.scoreAgainst);
  const loserScore = Math.min(f.scoreFor, f.scoreAgainst);
  const margin = winnerScore - loserScore;
  const upset = won && f.preWinProb !== null && f.preWinProb <= UPSET_MAX_PRE_WIN_PROB;

  let result: ResultEvent | null = null;
  if (winnerScore === loserScore) {
    result = null;
  } else if (loserScore === 0) {
    result = won ? "bagel_winner" : "bagel_loser";
  } else if (loserScore >= f.target - 2 && margin <= 2) {
    // "Close" = loser within two of the target and a margin of at most two. This also covers
    // extended win-by-2 scores such as 14-12 to 11.
    result = won ? "close_win" : "close_loss";
  } else if (loserScore / winnerScore <= 0.4) {
    result = won ? "blowout_win" : "blowout_loss";
  } else if (won && f.preWinProb !== null && f.preWinProb >= 0.5) {
    // A plain win is only called "expected" when the saved prediction says the winner was favoured.
    // Without that, or when the winner was a mild underdog, no generic line can be said accurately.
    result = "expected_win";
  }
  return { won, result, upset };
}

// ---------- rating change ----------

export const LARGE_RATING_CHANGE = 0.04;

export type RatingEvent = "rating_gain_small" | "rating_gain_large" | "rating_drop_small" | "rating_drop_large";

/** Uses the stored precise delta, never the rounded display value. Exactly zero has no event. */
export function classifyRating(delta: number | null | undefined): RatingEvent | null {
  if (delta == null || !Number.isFinite(delta) || delta === 0) return null;
  const large = Math.abs(delta) >= LARGE_RATING_CHANGE;
  if (delta > 0) return large ? "rating_gain_large" : "rating_gain_small";
  return large ? "rating_drop_large" : "rating_drop_small";
}

// ---------- streaks ----------

export const MIN_STREAK = 3;

export interface Streak {
  type: "win" | "loss";
  length: number;
}

/** `outcomes` is newest first (true = win), already restricted to confirmed, non-void matches. */
export function currentStreak(outcomes: readonly boolean[]): Streak | null {
  if (outcomes.length === 0) return null;
  const first = outcomes[0];
  let length = 0;
  while (length < outcomes.length && outcomes[length] === first) length++;
  return { type: first ? "win" : "loss", length };
}

export function classifyStreak(streak: Streak | null): "win_streak" | "loss_streak" | null {
  if (!streak || streak.length < MIN_STREAK) return null;
  return streak.type === "win" ? "win_streak" : "loss_streak";
}

// ---------- partner chemistry ----------

export const MIN_SHARED_MATCHES_FOR_CHEMISTRY = 8;
export const CHEMISTRY_MARGIN = 0.15;

/**
 * Compares the pair's actual wins with the wins the saved pre-match probabilities expected
 * (opponent-adjusted). Needs at least 8 shared matches that have a saved probability.
 */
export function classifyChemistry(sample: { games: number; wins: number; expectedWins: number }): "partner_chemistry_good" | "partner_chemistry_bad" | null {
  if (sample.games < MIN_SHARED_MATCHES_FOR_CHEMISTRY) return null;
  const residual = (sample.wins - sample.expectedWins) / sample.games;
  if (residual >= CHEMISTRY_MARGIN) return "partner_chemistry_good";
  if (residual <= -CHEMISTRY_MARGIN) return "partner_chemistry_bad";
  return null;
}

// ---------- players ----------

export function classifyPlayerStatus(p: { games: number; provisional: boolean }): "new_player" | "provisional" | null {
  if (p.games === 0) return "new_player";
  return p.provisional ? "provisional" : null;
}

// ---------- presentation helpers ----------

export const EVENT_EMOJI: Partial<Record<RoastEvent, string>> = {
  bagel_winner: "🥯",
  bagel_loser: "🥯",
  close_win: "😮‍💨",
  close_loss: "😬",
  blowout_win: "💥",
  blowout_loss: "💀",
  expected_win: "✅",
  upset_win: "⚡",
  rating_gain_small: "📈",
  rating_gain_large: "🚀",
  rating_drop_small: "📉",
  rating_drop_large: "🪂",
  win_streak: "🔥",
  loss_streak: "🧊",
  new_player: "🐣",
  provisional: "🧪",
  balanced_match: "⚖️",
  partner_chemistry_good: "🤝",
  partner_chemistry_bad: "🧭",
  prediction_heavy_favorite: "👑",
  prediction_favorite: "😏",
  prediction_even: "🤷",
  prediction_underdog: "🥶",
  prediction_longshot: "🙏",
  no_matches: "🏟️",
  error_safe: "🛠️",
  roast_again: "🔥",
};
