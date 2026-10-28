import type { RatingConfig, WeightTier } from "./config";

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

export const teamRating = (r1: number, r2: number) => (r1 + r2) / 2;

/** Team A's expected share of points: logistic in the team-average difference. */
export function expectedPointShare(teamA: number, teamB: number, beta: number): number {
  return 1 / (1 + Math.exp(-beta * (teamA - teamB)));
}

export function actualPointShare(scoreA: number, scoreB: number): number {
  const total = scoreA + scoreB;
  if (!(total > 0)) throw new RangeError("Total points must be positive");
  return scoreA / total;
}

/** Reliability weight from the number of eligible rated games in the trailing window. */
export function reliabilityWeight(games: number, tiers: readonly WeightTier[]): number {
  let weight = tiers[0].weight;
  for (const tier of tiers) if (games >= tier.minGames) weight = tier.weight;
  return weight;
}

/** `priorSameSetGames` = earlier rated games of the same four players on the same local day. */
export function effectiveK(priorSameSetGames: number, config: Pick<RatingConfig, "k" | "matchupDiscount">): number {
  return priorSameSetGames < config.matchupDiscount.freeGames ? config.k : config.k * config.matchupDiscount.multiplier;
}

export type Four<T> = readonly [T, T, T, T];

export interface MatchUpdateInput {
  /** [A1, A2, B1, B2] */
  ratings: Four<number>;
  /** Eligible rated games in the trailing window, same order. */
  priorGames: Four<number>;
  scoreA: number;
  scoreB: number;
  kEff: number;
  config: Pick<RatingConfig, "beta" | "maximumTeamDelta" | "weightTiers">;
}

export interface MatchUpdate {
  teamARating: number;
  teamBRating: number;
  expectedShareA: number;
  actualShareA: number;
  /** Team-average shift for Team A after the cap. */
  teamDelta: number;
  capped: boolean;
  weights: Four<number>;
  deltas: Four<number>;
}

export function computeMatchUpdate(input: MatchUpdateInput): MatchUpdate {
  const { ratings, priorGames, config } = input;
  const teamA = teamRating(ratings[0], ratings[1]);
  const teamB = teamRating(ratings[2], ratings[3]);
  const expectedShareA = expectedPointShare(teamA, teamB, config.beta);
  const actualShareA = actualPointShare(input.scoreA, input.scoreB);
  const raw = input.kEff * (actualShareA - expectedShareA);
  const teamDelta = clamp(raw, -config.maximumTeamDelta, config.maximumTeamDelta);

  const w = priorGames.map((g) => reliabilityWeight(g, config.weightTiers)) as unknown as Four<number>;
  const sumA = w[0] + w[1];
  const sumB = w[2] + w[3];
  const deltas: Four<number> = [
    (2 * teamDelta * w[0]) / sumA,
    (2 * teamDelta * w[1]) / sumA,
    (-2 * teamDelta * w[2]) / sumB,
    (-2 * teamDelta * w[3]) / sumB,
  ];
  return {
    teamARating: teamA,
    teamBRating: teamB,
    expectedShareA,
    actualShareA,
    teamDelta,
    capped: raw !== teamDelta,
    weights: w,
    deltas,
  };
}
