import { localDayKey } from "@/lib/time";
import { DISPLAY_RATING_RANGE, type GameTarget, type RatingConfig } from "./config";
import { computeMatchUpdate, effectiveK, type Four } from "./engine";
import { gameWinProbability } from "./predictor";
import { validateScore } from "./validation";

export interface ReplayPlayer {
  id: string;
  /** Immutable opening rating. */
  initialRating: number;
}

export interface ReplayMatch {
  id: string;
  playedAt: number;
  createdAt: number;
  formatTarget: GameTarget;
  scoreA: number;
  scoreB: number;
  rated: boolean;
  /** Snapshot stored with the match; replay never substitutes the current configuration. */
  config: RatingConfig;
  teamA: readonly [string, string];
  teamB: readonly [string, string];
}

export interface ReplayMatchResult {
  matchId: string;
  rated: boolean;
  /** [A1, A2, B1, B2] */
  playerIds: Four<string>;
  pre: Four<number>;
  delta: Four<number>;
  post: Four<number>;
  weights: Four<number>;
  /** Eligible games in the trailing window before this match, per player. */
  priorGames: Four<number>;
  kEff: number;
  /** Earlier rated games of the same four players on the same local day. */
  priorSameSetGames: number;
  expectedShareA: number;
  winProbA: number;
  teamDelta: number;
  capped: boolean;
}

export interface ReplayResult {
  /** In canonical order. */
  results: ReplayMatchResult[];
  finalRatings: Map<string, number>;
  /** Rated games per player over all time. */
  ratedGames: Map<string, number>;
  outOfRange: { playerId: string; rating: number }[];
}

export class ReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplayError";
  }
}

/** Canonical ordering: (played_at, created_at, match_id). */
export function canonicalCompare(a: Pick<ReplayMatch, "playedAt" | "createdAt" | "id">, b: Pick<ReplayMatch, "playedAt" | "createdAt" | "id">): number {
  return a.playedAt - b.playedAt || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Order-independent key for the four players, ignoring team assignment and positions. */
export function matchupKey(ids: readonly string[]): string {
  return [...ids].sort().join("|");
}

const DAY_MS = 86_400_000;

/**
 * Deterministic full replay from immutable initial ratings over all confirmed matches,
 * each processed with its own stored configuration.
 */
export function replay(players: readonly ReplayPlayer[], matches: readonly ReplayMatch[]): ReplayResult {
  const ratings = new Map<string, number>(players.map((p) => [p.id, p.initialRating]));
  const history = new Map<string, number[]>();
  const ratedGames = new Map<string, number>(players.map((p) => [p.id, 0]));
  const sameSetCounts = new Map<string, number>();
  const results: ReplayMatchResult[] = [];

  for (const match of [...matches].sort(canonicalCompare)) {
    const ids = [match.teamA[0], match.teamA[1], match.teamB[0], match.teamB[1]] as const as Four<string>;
    if (new Set(ids).size !== 4) throw new ReplayError(`Match ${match.id} does not have four distinct players`);
    for (const id of ids) if (!ratings.has(id)) throw new ReplayError(`Match ${match.id} references unknown player ${id}`);
    const check = validateScore(match.scoreA, match.scoreB, match.formatTarget);
    if (!check.valid) throw new ReplayError(`Match ${match.id} has an invalid score: ${check.reason}`);

    const config = match.config;
    const pre = ids.map((id) => ratings.get(id)!) as unknown as Four<number>;
    const cutoff = match.playedAt - config.trailingWindowDays * DAY_MS;
    const priorGames = ids.map((id) => (history.get(id) ?? []).filter((t) => t >= cutoff).length) as unknown as Four<number>;

    const setKey = `${localDayKey(match.playedAt, config.timezone)}#${matchupKey(ids)}`;
    const priorSameSetGames = sameSetCounts.get(setKey) ?? 0;
    const kEff = effectiveK(priorSameSetGames, config);

    const update = computeMatchUpdate({ ratings: pre, priorGames, scoreA: match.scoreA, scoreB: match.scoreB, kEff, config });
    const winProbA = gameWinProbability(update.expectedShareA, match.formatTarget);

    const delta: Four<number> = match.rated ? update.deltas : [0, 0, 0, 0];
    const post = pre.map((r, i) => r + delta[i]) as unknown as Four<number>;

    if (match.rated) {
      ids.forEach((id, i) => {
        ratings.set(id, post[i]);
        const list = history.get(id) ?? [];
        list.push(match.playedAt);
        history.set(id, list);
        ratedGames.set(id, (ratedGames.get(id) ?? 0) + 1);
      });
      sameSetCounts.set(setKey, priorSameSetGames + 1);
    }

    results.push({
      matchId: match.id,
      rated: match.rated,
      playerIds: ids,
      pre,
      delta,
      post,
      weights: update.weights,
      priorGames,
      kEff,
      priorSameSetGames,
      expectedShareA: update.expectedShareA,
      winProbA,
      teamDelta: match.rated ? update.teamDelta : 0,
      capped: update.capped,
    });
  }

  const outOfRange = [...ratings.entries()]
    .filter(([, r]) => r < DISPLAY_RATING_RANGE.min || r > DISPLAY_RATING_RANGE.max)
    .map(([playerId, rating]) => ({ playerId, rating }));
  return { results, finalRatings: ratings, ratedGames, outOfRange };
}
