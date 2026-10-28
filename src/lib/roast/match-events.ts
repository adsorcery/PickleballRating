import type { RoastEvent } from "@/i18n/types";
import { classifyRating, classifyResult, type RatingEvent, type ResultEvent } from "./classify-event";
import type { LineContext } from "./pick-message";

export interface MatchRoastInput {
  scoreA: number;
  scoreB: number;
  formatTarget: number;
  rated: boolean;
  /** Saved pre-match game win probability of Team A; null when it was never stored. */
  predictedWinProbA: number | null;
}

export interface TeamRoast {
  team: "A" | "B";
  won: boolean;
  result: ResultEvent | null;
  upset: boolean;
  ctx: LineContext;
}

/** Pre-match win probability from the perspective of the team. Never derived from post-match ratings. */
export function preWinProbFor(team: "A" | "B", predictedWinProbA: number | null): number | null {
  if (predictedWinProbA === null || !Number.isFinite(predictedWinProbA)) return null;
  return team === "A" ? predictedWinProbA : 1 - predictedWinProbA;
}

export function teamRoast(m: MatchRoastInput, team: "A" | "B"): TeamRoast {
  const scoreFor = team === "A" ? m.scoreA : m.scoreB;
  const scoreAgainst = team === "A" ? m.scoreB : m.scoreA;
  const r = classifyResult({ scoreFor, scoreAgainst, target: m.formatTarget, preWinProb: preWinProbFor(team, m.predictedWinProbA) });
  return { team, won: r.won, result: r.result, upset: r.upset, ctx: { scoreFor, scoreAgainst } };
}

/** Rating line for one player. Unrated matches never moved a rating, so they have no line. */
export function playerRatingEvent(m: Pick<MatchRoastInput, "rated">, delta: number | null): RatingEvent | null {
  return m.rated ? classifyRating(delta) : null;
}

export type { RoastEvent };
