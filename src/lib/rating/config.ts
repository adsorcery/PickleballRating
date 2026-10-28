import { z } from "zod";

export const ALGORITHM_VERSION = "vcpr-v1";
export const GAME_TARGETS = [11, 15, 21] as const;
export type GameTarget = (typeof GAME_TARGETS)[number];

/** Normal rating scale; stored ratings are never clipped to it. */
export const DISPLAY_RATING_RANGE = { min: 2, max: 6 } as const;

export interface WeightTier {
  /** Applies when the player has at least this many eligible rated games in the trailing window. */
  minGames: number;
  weight: number;
}

export interface RatingConfig {
  algorithmVersion: string;
  beta: number;
  k: number;
  /** Cap on the team-average shift d (not an individual cap). */
  maximumTeamDelta: number;
  weightTiers: WeightTier[];
  trailingWindowDays: number;
  /** Players with fewer total eligible games are provisional. */
  provisionalGames: number;
  matchupDiscount: { freeGames: number; multiplier: number };
  /** IANA timezone defining the "local calendar day" for the repeated-matchup rule. */
  timezone: string;
}

export const DEFAULT_RATING_CONFIG: RatingConfig = {
  algorithmVersion: ALGORITHM_VERSION,
  beta: 2.6,
  k: 0.35,
  maximumTeamDelta: 0.08,
  weightTiers: [
    { minGames: 0, weight: 1.5 },
    { minGames: 5, weight: 1.25 },
    { minGames: 15, weight: 1.0 },
    { minGames: 30, weight: 0.8 },
  ],
  trailingWindowDays: 180,
  provisionalGames: 15,
  matchupDiscount: { freeGames: 3, multiplier: 0.5 },
  timezone: "America/Los_Angeles",
};

function isValidTimezone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const ratingConfigSchema = z.object({
  algorithmVersion: z.string().min(1),
  beta: z.number().positive().max(20),
  k: z.number().positive().max(5),
  maximumTeamDelta: z.number().positive().max(1),
  weightTiers: z
    .array(z.object({ minGames: z.number().int().min(0), weight: z.number().positive().max(10) }))
    .min(1)
    .refine((tiers) => tiers[0].minGames === 0, "First weight tier must start at 0 games")
    .refine(
      (tiers) => tiers.every((t, i) => i === 0 || t.minGames > tiers[i - 1].minGames),
      "Weight tiers must have strictly increasing minimum games",
    ),
  trailingWindowDays: z.number().int().min(1).max(3650),
  provisionalGames: z.number().int().min(0).max(1000),
  matchupDiscount: z.object({
    freeGames: z.number().int().min(0).max(100),
    multiplier: z.number().min(0).max(1),
  }),
  timezone: z.string().refine(isValidTimezone, "Invalid IANA timezone"),
});

export function parseRatingConfig(value: unknown): RatingConfig {
  return ratingConfigSchema.parse(value);
}
