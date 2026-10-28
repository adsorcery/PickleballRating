import { and, eq, sql } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { matches, matchPlayers, players, ratingHistory } from "@/lib/db/schema";
import { parseRatingConfig, type GameTarget, type WinBy } from "@/lib/rating/config";
import { replay, type ReplayMatch, type ReplayMatchResult, type ReplayPlayer, type ReplayResult } from "@/lib/rating/replay";

export interface ReplayInputs {
  players: ReplayPlayer[];
  matches: ReplayMatch[];
}

export interface ReplayOverrides {
  initialRatings?: Map<string, number>;
  /** Replace (or, with null, remove) a stored confirmed match. */
  matchOverrides?: Map<string, ReplayMatch | null>;
  extraMatches?: ReplayMatch[];
}

/** Loads immutable initial ratings and every confirmed match with its stored config snapshot. */
export function loadReplayInputs(ex: Executor): ReplayInputs {
  const playerRows = ex.select({ id: players.id, initial: players.initialCincoRating }).from(players).all();
  const matchRows = ex.select().from(matches).where(eq(matches.status, "confirmed")).all();
  const confirmedIds = new Set(matchRows.map((m) => m.id));
  const slotRows = ex
    .select()
    .from(matchPlayers)
    .all()
    .filter((s) => confirmedIds.has(s.matchId));
  const slots = new Map<string, { A: string[]; B: string[] }>();
  for (const s of slotRows.sort((a, b) => a.position - b.position)) {
    const entry = slots.get(s.matchId) ?? { A: [], B: [] };
    entry[s.team].push(s.playerId);
    slots.set(s.matchId, entry);
  }
  const replayMatches: ReplayMatch[] = matchRows.map((m) => {
    const s = slots.get(m.id);
    if (!s || s.A.length !== 2 || s.B.length !== 2) throw new Error(`Match ${m.id} does not have two players per team`);
    return {
      id: m.id,
      playedAt: m.playedAt.getTime(),
      createdAt: m.createdAt.getTime(),
      formatTarget: m.formatTarget as GameTarget,
      winBy: m.winBy as WinBy,
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      rated: m.rated,
      config: parseRatingConfig(m.configSnapshot),
      teamA: [s.A[0], s.A[1]],
      teamB: [s.B[0], s.B[1]],
    };
  });
  return { players: playerRows.map((p) => ({ id: p.id, initialRating: p.initial })), matches: replayMatches };
}

export function applyOverrides(inputs: ReplayInputs, overrides: ReplayOverrides = {}): ReplayInputs {
  const ratings = overrides.initialRatings;
  const matchOverrides = overrides.matchOverrides;
  const baseMatches: ReplayMatch[] = [];
  for (const m of inputs.matches) {
    if (matchOverrides?.has(m.id)) {
      const replacement = matchOverrides.get(m.id);
      if (replacement) baseMatches.push(replacement);
    } else {
      baseMatches.push(m);
    }
  }
  return {
    players: inputs.players.map((p) => (ratings?.has(p.id) ? { ...p, initialRating: ratings.get(p.id)! } : p)),
    matches: [...baseMatches, ...(overrides.extraMatches ?? [])],
  };
}

const EPS = 1e-12;

/** Matches whose stored outcome differs between two replays (by pre/post rating). */
export function changedMatchIds(a: ReplayResult, b: ReplayResult): string[] {
  const before = new Map(a.results.map((r) => [r.matchId, r]));
  const out: string[] = [];
  for (const r of b.results) {
    const prev = before.get(r.matchId);
    if (!prev || r.pre.some((v, i) => Math.abs(v - prev.pre[i]) > EPS) || r.post.some((v, i) => Math.abs(v - prev.post[i]) > EPS)) {
      out.push(r.matchId);
    }
  }
  return out;
}

export interface RebuildSummary {
  results: ReplayMatchResult[];
  changedMatchIds: string[];
  playersUpdated: number;
}

/**
 * Replays everything and writes only the rows whose values changed. Must run inside the same
 * write transaction as the change that triggered it.
 */
export function rebuildRatings(tx: Executor): RebuildSummary {
  const inputs = loadReplayInputs(tx);
  const result = replay(inputs.players, inputs.matches);
  const playedAt = new Map(inputs.matches.map((m) => [m.id, m.playedAt]));
  const changed = new Set<string>();

  const existingSlots = new Map<string, typeof matchPlayers.$inferSelect>();
  for (const row of tx.select().from(matchPlayers).all()) existingSlots.set(`${row.matchId}|${row.playerId}`, row);
  const existingHistory = new Map<string, typeof ratingHistory.$inferSelect>();
  for (const row of tx.select().from(ratingHistory).all()) existingHistory.set(`${row.matchId}|${row.playerId}`, row);
  const existingMatches = new Map(tx.select().from(matches).where(eq(matches.status, "confirmed")).all().map((m) => [m.id, m]));

  const desiredHistory = new Set<string>();
  for (const r of result.results) {
    const when = playedAt.get(r.matchId)!;
    r.playerIds.forEach((playerId, i) => {
      const key = `${r.matchId}|${playerId}`;
      const slot = existingSlots.get(key);
      if (!slot) throw new Error(`Missing match_players row for ${key}`);
      if (slot.preRating !== r.pre[i] || slot.deltaRating !== r.delta[i] || slot.postRating !== r.post[i]) {
        tx.update(matchPlayers)
          .set({ preRating: r.pre[i], deltaRating: r.delta[i], postRating: r.post[i] })
          .where(and(eq(matchPlayers.matchId, r.matchId), eq(matchPlayers.playerId, playerId)))
          .run();
        changed.add(r.matchId);
      }
      if (r.rated) {
        desiredHistory.add(key);
        const h = existingHistory.get(key);
        if (!h) {
          tx.insert(ratingHistory)
            .values({ playerId, matchId: r.matchId, ratingBefore: r.pre[i], ratingAfter: r.post[i], delta: r.delta[i], playedAt: new Date(when) })
            .run();
        } else if (h.ratingBefore !== r.pre[i] || h.ratingAfter !== r.post[i] || h.delta !== r.delta[i] || h.playedAt.getTime() !== when) {
          tx.update(ratingHistory)
            .set({ ratingBefore: r.pre[i], ratingAfter: r.post[i], delta: r.delta[i], playedAt: new Date(when) })
            .where(eq(ratingHistory.id, h.id))
            .run();
        }
      }
    });
    const m = existingMatches.get(r.matchId);
    if (m && (m.predictedPointShareA !== r.expectedShareA || m.predictedWinProbA !== r.winProbA)) {
      tx.update(matches).set({ predictedPointShareA: r.expectedShareA, predictedWinProbA: r.winProbA }).where(eq(matches.id, r.matchId)).run();
    }
  }

  for (const [key, h] of existingHistory) {
    if (!desiredHistory.has(key)) tx.delete(ratingHistory).where(eq(ratingHistory.id, h.id)).run();
  }

  tx.update(matchPlayers)
    .set({ preRating: null, deltaRating: null, postRating: null })
    .where(
      and(
        sql`${matchPlayers.matchId} in (select id from matches where status != 'confirmed')`,
        sql`(${matchPlayers.preRating} is not null or ${matchPlayers.deltaRating} is not null or ${matchPlayers.postRating} is not null)`,
      ),
    )
    .run();

  let playersUpdated = 0;
  const current = new Map(tx.select({ id: players.id, r: players.currentCincoRating }).from(players).all().map((p) => [p.id, p.r]));
  for (const [id, rating] of result.finalRatings) {
    if (current.get(id) !== rating) {
      tx.update(players).set({ currentCincoRating: rating }).where(eq(players.id, id)).run();
      playersUpdated++;
    }
  }
  return { results: result.results, changedMatchIds: [...changed], playersUpdated };
}
