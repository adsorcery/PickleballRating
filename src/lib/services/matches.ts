import { and, between, eq, ne, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Db, Executor } from "@/lib/db/client";
import { matches, matchPlayers, players, predictionSnapshots } from "@/lib/db/schema";
import { parseRatingConfig, type GameTarget, type RatingConfig } from "@/lib/rating/config";
import { predictMatch } from "@/lib/rating/predictor";
import { replay, type ReplayMatch, type ReplayMatchResult } from "@/lib/rating/replay";
import { validateScore } from "@/lib/rating/validation";
import { ServiceError } from "@/lib/result";
import { epochToLocalInput, localInputToEpoch } from "@/lib/time";
import { writeAudit } from "./audit";
import { getActiveConfig } from "./config";
import { applyOverrides, changedMatchIds, loadReplayInputs, rebuildRatings } from "./replay-store";

const playerId = z.string().min(1).max(100);

export const matchInputSchema = z.object({
  teamA: z.tuple([playerId, playerId]),
  teamB: z.tuple([playerId, playerId]),
  playedAtLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a valid date and time"),
  formatTarget: z.union([z.literal(11), z.literal(15), z.literal(21)]),
  scoreA: z.number().int().min(0).max(99),
  scoreB: z.number().int().min(0).max(99),
  rated: z.boolean(),
  notes: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(500).nullish()),
  idempotencyKey: z.string().min(8).max(100),
});
export type MatchInput = z.infer<typeof matchInputSchema>;

const DUPLICATE_WINDOW_MS = 6 * 3600 * 1000;
const MAX_FUTURE_MS = 24 * 3600 * 1000;

type MatchRow = typeof matches.$inferSelect;

export interface PreviewPlayer {
  id: string;
  name: string;
  team: "A" | "B";
  pre: number;
  delta: number;
  post: number;
  weight: number;
  priorGames: number;
  provisional: boolean;
  outOfRange: boolean;
}

export interface DuplicateInfo {
  matchId: string;
  playedAt: number;
  scoreA: number;
  scoreB: number;
}

export interface MatchPreview {
  playedAt: number;
  timezone: string;
  formatTarget: GameTarget;
  rated: boolean;
  prediction: { teamARating: number; teamBRating: number; pointShareA: number; winProbA: number; winProbB: number };
  players: PreviewPlayer[];
  repeat: { priorSameSetGames: number; kEff: number; baseK: number; discounted: boolean; freeGames: number };
  teamDelta: number;
  teamDeltaCapped: boolean;
  maximumTeamDelta: number;
  laterMatchesAffected: number;
  duplicates: DuplicateInfo[];
  timeChangedFrom: number | null;
}

function fieldError(field: string, message: string): never {
  throw new ServiceError(message, "validation", { [field]: [message] });
}

interface Prepared {
  ids: [string, string, string, string];
  playedAt: number;
  names: Map<string, string>;
}

function prepare(
  ex: Executor,
  input: MatchInput,
  opts: { timezone: string; requireValidScore: boolean; allowInactive?: Set<string>; now: Date },
): Prepared {
  const ids = [...input.teamA, ...input.teamB] as [string, string, string, string];
  if (new Set(ids).size !== 4) fieldError("players", "Choose four different players.");
  const rows = ex.select().from(players).all().filter((p) => ids.includes(p.id));
  if (rows.length !== 4) fieldError("players", "One or more selected players do not exist.");
  for (const p of rows) {
    if (!p.active && !opts.allowInactive?.has(p.id)) fieldError("players", `${p.displayName} is inactive.`);
  }
  const playedAt = localInputToEpoch(input.playedAtLocal, opts.timezone);
  if (playedAt === null) fieldError("playedAtLocal", "Enter a valid date and time.");
  if (playedAt > opts.now.getTime() + MAX_FUTURE_MS) fieldError("playedAtLocal", "Match time cannot be in the future.");
  if (opts.requireValidScore) {
    const v = validateScore(input.scoreA, input.scoreB, input.formatTarget);
    if (!v.valid) fieldError("scoreA", v.reason);
  }
  return { ids, playedAt, names: new Map(rows.map((p) => [p.id, p.displayName])) };
}

function loadSlots(ex: Executor, matchId: string) {
  const rows = ex.select().from(matchPlayers).where(eq(matchPlayers.matchId, matchId)).all();
  const a = rows.filter((r) => r.team === "A").sort((x, y) => x.position - y.position);
  const b = rows.filter((r) => r.team === "B").sort((x, y) => x.position - y.position);
  return { teamA: a.map((r) => r.playerId), teamB: b.map((r) => r.playerId) };
}

function writeSlots(tx: Executor, matchId: string, ids: readonly string[]) {
  tx.delete(matchPlayers).where(eq(matchPlayers.matchId, matchId)).run();
  const teams: ("A" | "B")[] = ["A", "A", "B", "B"];
  ids.forEach((pid, i) => {
    tx.insert(matchPlayers).values({ matchId, playerId: pid, team: teams[i], position: (i % 2) + 1 }).run();
  });
}

function setKey(ids: readonly string[]) {
  return [...ids].sort().join("|");
}

export function findDuplicates(
  ex: Executor,
  ids: readonly string[],
  scoreA: number,
  scoreB: number,
  playedAt: number,
  excludeId?: string,
): DuplicateInfo[] {
  const candidates = ex
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.status, "confirmed"),
        between(matches.playedAt, new Date(playedAt - DUPLICATE_WINDOW_MS), new Date(playedAt + DUPLICATE_WINDOW_MS)),
        excludeId ? ne(matches.id, excludeId) : sql`1 = 1`,
      ),
    )
    .all();
  const key = setKey(ids);
  const scores = [scoreA, scoreB].sort((x, y) => x - y).join("-");
  const out: DuplicateInfo[] = [];
  for (const m of candidates) {
    if ([m.scoreA, m.scoreB].sort((x, y) => x - y).join("-") !== scores) continue;
    const slots = loadSlots(ex, m.id);
    if (setKey([...slots.teamA, ...slots.teamB]) === key) {
      out.push({ matchId: m.id, playedAt: m.playedAt.getTime(), scoreA: m.scoreA, scoreB: m.scoreB });
    }
  }
  return out;
}

function configFor(ex: Executor, existing: MatchRow | undefined, now: Date): RatingConfig {
  if (existing && existing.status === "confirmed") return parseRatingConfig(existing.configSnapshot);
  return getActiveConfig(ex, now).config;
}

function toReplayMatch(id: string, prepared: Prepared, input: MatchInput, createdAt: number, config: RatingConfig): ReplayMatch {
  return {
    id,
    playedAt: prepared.playedAt,
    createdAt,
    formatTarget: input.formatTarget,
    scoreA: input.scoreA,
    scoreB: input.scoreB,
    rated: input.rated,
    config,
    teamA: [prepared.ids[0], prepared.ids[1]],
    teamB: [prepared.ids[2], prepared.ids[3]],
  };
}

/** Read-only projection of what saving this match would do. Nothing is written. */
export function previewMatch(ex: Executor, rawInput: unknown, opts: { matchId?: string; now?: Date } = {}): MatchPreview {
  const input = matchInputSchema.parse(rawInput);
  const now = opts.now ?? new Date();
  const existing = opts.matchId ? ex.select().from(matches).where(eq(matches.id, opts.matchId)).get() : undefined;
  if (opts.matchId && !existing) throw new ServiceError("Match not found.", "not_found");
  if (existing?.status === "void") throw new ServiceError("This match has been voided.", "invalid_state");

  const config = configFor(ex, existing, now);
  const allowInactive = existing ? new Set(Object.values(loadSlots(ex, existing.id)).flat()) : undefined;
  const prepared = prepare(ex, input, { timezone: config.timezone, requireValidScore: true, allowInactive, now });

  const inputs = loadReplayInputs(ex);
  const candidateId = existing?.id ?? "__candidate__";
  const candidate = toReplayMatch(candidateId, prepared, input, existing?.createdAt.getTime() ?? now.getTime(), config);
  const isConfirmed = existing?.status === "confirmed";
  const base = replay(inputs.players, inputs.matches);
  const alt = applyOverrides(inputs, isConfirmed ? { matchOverrides: new Map([[candidateId, candidate]]) } : { extraMatches: [candidate] });
  const next = replay(alt.players, alt.matches);

  const index = next.results.findIndex((r) => r.matchId === candidateId);
  const res: ReplayMatchResult = next.results[index];
  const gamesBefore = (pid: string) =>
    next.results.slice(0, index).filter((r) => r.rated && r.playerIds.includes(pid)).length;
  const outOfRange = new Set(next.outOfRange.map((o) => o.playerId));

  const prediction = predictMatch(res.pre, input.formatTarget, config);
  const previewPlayers: PreviewPlayer[] = res.playerIds.map((id, i) => ({
    id,
    name: prepared.names.get(id)!,
    team: i < 2 ? "A" : "B",
    pre: res.pre[i],
    delta: res.delta[i],
    post: res.post[i],
    weight: res.weights[i],
    priorGames: res.priorGames[i],
    provisional: gamesBefore(id) < config.provisionalGames,
    outOfRange: res.post[i] < 2 || res.post[i] > 6 || outOfRange.has(id),
  }));

  return {
    playedAt: prepared.playedAt,
    timezone: config.timezone,
    formatTarget: input.formatTarget,
    rated: input.rated,
    prediction,
    players: previewPlayers,
    repeat: {
      priorSameSetGames: res.priorSameSetGames,
      kEff: res.kEff,
      baseK: config.k,
      discounted: res.kEff < config.k,
      freeGames: config.matchupDiscount.freeGames,
    },
    teamDelta: res.teamDelta,
    teamDeltaCapped: input.rated && res.capped,
    maximumTeamDelta: config.maximumTeamDelta,
    laterMatchesAffected: changedMatchIds(base, next).filter((id) => id !== candidateId).length,
    duplicates: findDuplicates(ex, prepared.ids, input.scoreA, input.scoreB, prepared.playedAt, existing?.id),
    timeChangedFrom: existing && existing.playedAt.getTime() !== prepared.playedAt ? existing.playedAt.getTime() : null,
  };
}

export interface SaveOutcome {
  matchId: string;
  alreadySaved: boolean;
}

interface WriteOptions {
  acknowledgeDuplicate?: boolean;
  now?: Date;
}

function recordSnapshot(tx: Executor, matchId: string, result: ReplayMatchResult, target: GameTarget, config: RatingConfig, now: Date) {
  tx.insert(predictionSnapshots)
    .values({
      matchId,
      inputJson: { playerIds: result.playerIds, ratings: result.pre, formatTarget: target, beta: config.beta, algorithmVersion: config.algorithmVersion },
      probabilityA: result.winProbA,
      createdAt: now,
    })
    .run();
}

function enforceDuplicates(tx: Executor, prepared: Prepared, input: MatchInput, ack: boolean | undefined, excludeId?: string) {
  const dups = findDuplicates(tx, prepared.ids, input.scoreA, input.scoreB, prepared.playedAt, excludeId);
  if (dups.length && !ack) {
    throw new ServiceError(
      "A confirmed match with the same four players, score, and a nearby time already exists. Confirm again to save it anyway.",
      "duplicate_suspected",
    );
  }
}

/** Saves a confirmed match and updates all ratings atomically. Idempotent on `idempotencyKey`. */
export function confirmNewMatch(db: Db, actorId: string, rawInput: unknown, opts: WriteOptions = {}): SaveOutcome {
  const input = matchInputSchema.parse(rawInput);
  const now = opts.now ?? new Date();
  return db.transaction(
    (tx) => {
      const dup = tx.select({ id: matches.id }).from(matches).where(eq(matches.idempotencyKey, input.idempotencyKey)).get();
      if (dup) return { matchId: dup.id, alreadySaved: true };

      const config = getActiveConfig(tx, now).config;
      const prepared = prepare(tx, input, { timezone: config.timezone, requireValidScore: true, now });
      enforceDuplicates(tx, prepared, input, opts.acknowledgeDuplicate);

      const id = randomUUID();
      tx.insert(matches)
        .values({
          id,
          playedAt: new Date(prepared.playedAt),
          createdAt: now,
          updatedAt: now,
          formatTarget: input.formatTarget,
          scoreA: input.scoreA,
          scoreB: input.scoreB,
          status: "confirmed",
          rated: input.rated,
          algorithmVersion: config.algorithmVersion,
          configSnapshot: config,
          enteredBy: actorId,
          confirmedAt: now,
          idempotencyKey: input.idempotencyKey,
          notes: input.notes ?? null,
        })
        .run();
      writeSlots(tx, id, prepared.ids);
      const rebuilt = rebuildRatings(tx);
      const result = rebuilt.results.find((r) => r.matchId === id)!;
      recordSnapshot(tx, id, result, input.formatTarget, config, now);
      writeAudit(tx, {
        actorId,
        entityType: "match",
        entityId: id,
        action: "confirm",
        after: { ...input, playedAt: prepared.playedAt, ratingChanges: result.delta, affectedLaterMatches: rebuilt.changedMatchIds.length - 1 },
        now,
      });
      return { matchId: id, alreadySaved: false };
    },
    { behavior: "immediate" },
  );
}

function draftPrepare(tx: Executor, input: MatchInput, now: Date, existing?: MatchRow) {
  const config = getActiveConfig(tx, now).config;
  const allowInactive = existing ? new Set(Object.values(loadSlots(tx, existing.id)).flat()) : undefined;
  return { config, prepared: prepare(tx, input, { timezone: config.timezone, requireValidScore: false, allowInactive, now }) };
}

/** Drafts are stored but excluded from ratings, history, and public pages. */
export function saveDraft(db: Db, actorId: string, rawInput: unknown, opts: { matchId?: string; expectedUpdatedAt?: number; now?: Date } = {}): SaveOutcome {
  const input = matchInputSchema.parse(rawInput);
  const now = opts.now ?? new Date();
  return db.transaction(
    (tx) => {
      if (opts.matchId) {
        const existing = tx.select().from(matches).where(eq(matches.id, opts.matchId)).get();
        if (!existing) throw new ServiceError("Draft not found.", "not_found");
        if (existing.status !== "draft") throw new ServiceError("Only drafts can be edited this way.", "invalid_state");
        if (opts.expectedUpdatedAt !== undefined && existing.updatedAt.getTime() !== opts.expectedUpdatedAt) {
          throw new ServiceError("This draft was changed elsewhere. Reload and try again.", "conflict");
        }
        const { config, prepared } = draftPrepare(tx, input, now, existing);
        tx.update(matches)
          .set({
            playedAt: new Date(prepared.playedAt),
            updatedAt: now,
            formatTarget: input.formatTarget,
            scoreA: input.scoreA,
            scoreB: input.scoreB,
            rated: input.rated,
            algorithmVersion: config.algorithmVersion,
            configSnapshot: config,
            notes: input.notes ?? null,
          })
          .where(eq(matches.id, existing.id))
          .run();
        writeSlots(tx, existing.id, prepared.ids);
        writeAudit(tx, { actorId, entityType: "match", entityId: existing.id, action: "draft_update", after: input, now });
        return { matchId: existing.id, alreadySaved: false };
      }

      const dup = tx.select({ id: matches.id }).from(matches).where(eq(matches.idempotencyKey, input.idempotencyKey)).get();
      if (dup) return { matchId: dup.id, alreadySaved: true };
      const { config, prepared } = draftPrepare(tx, input, now);
      const id = randomUUID();
      tx.insert(matches)
        .values({
          id,
          playedAt: new Date(prepared.playedAt),
          createdAt: now,
          updatedAt: now,
          formatTarget: input.formatTarget,
          scoreA: input.scoreA,
          scoreB: input.scoreB,
          status: "draft",
          rated: input.rated,
          algorithmVersion: config.algorithmVersion,
          configSnapshot: config,
          enteredBy: actorId,
          idempotencyKey: input.idempotencyKey,
          notes: input.notes ?? null,
        })
        .run();
      writeSlots(tx, id, prepared.ids);
      writeAudit(tx, { actorId, entityType: "match", entityId: id, action: "draft_create", after: input, now });
      return { matchId: id, alreadySaved: false };
    },
    { behavior: "immediate" },
  );
}

/** Promotes a draft (optionally with edits) to a confirmed match using the active configuration. */
export function confirmDraft(
  db: Db,
  actorId: string,
  matchId: string,
  rawInput: unknown,
  opts: WriteOptions & { expectedUpdatedAt: number },
): SaveOutcome {
  const input = matchInputSchema.parse(rawInput);
  const now = opts.now ?? new Date();
  return db.transaction(
    (tx) => {
      const existing = tx.select().from(matches).where(eq(matches.id, matchId)).get();
      if (!existing) throw new ServiceError("Draft not found.", "not_found");
      if (existing.status === "confirmed") return { matchId, alreadySaved: true };
      if (existing.status !== "draft") throw new ServiceError("This match has been voided.", "invalid_state");
      if (existing.updatedAt.getTime() !== opts.expectedUpdatedAt) {
        throw new ServiceError("This draft was changed elsewhere. Reload and try again.", "conflict");
      }
      const config = getActiveConfig(tx, now).config;
      const allowInactive = new Set(Object.values(loadSlots(tx, matchId)).flat());
      const prepared = prepare(tx, input, { timezone: config.timezone, requireValidScore: true, allowInactive, now });
      enforceDuplicates(tx, prepared, input, opts.acknowledgeDuplicate, matchId);
      tx.update(matches)
        .set({
          playedAt: new Date(prepared.playedAt),
          updatedAt: now,
          formatTarget: input.formatTarget,
          scoreA: input.scoreA,
          scoreB: input.scoreB,
          rated: input.rated,
          status: "confirmed",
          algorithmVersion: config.algorithmVersion,
          configSnapshot: config,
          confirmedAt: now,
          enteredBy: actorId,
          notes: input.notes ?? null,
        })
        .where(eq(matches.id, matchId))
        .run();
      writeSlots(tx, matchId, prepared.ids);
      const rebuilt = rebuildRatings(tx);
      const result = rebuilt.results.find((r) => r.matchId === matchId)!;
      recordSnapshot(tx, matchId, result, input.formatTarget, config, now);
      writeAudit(tx, {
        actorId,
        entityType: "match",
        entityId: matchId,
        action: "confirm",
        after: { ...input, playedAt: prepared.playedAt, ratingChanges: result.delta, affectedLaterMatches: rebuilt.changedMatchIds.length - 1 },
        now,
      });
      return { matchId, alreadySaved: false };
    },
    { behavior: "immediate" },
  );
}

export const reasonSchema = z.string().trim().min(3, "Enter a reason (3+ characters)").max(500);

function describeMatch(ex: Executor, m: MatchRow) {
  const slots = loadSlots(ex, m.id);
  return {
    playedAt: m.playedAt.getTime(),
    playedAtLocal: epochToLocalInput(m.playedAt.getTime(), parseRatingConfig(m.configSnapshot).timezone),
    formatTarget: m.formatTarget,
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    rated: m.rated,
    status: m.status,
    notes: m.notes,
    teamA: slots.teamA,
    teamB: slots.teamB,
  };
}

/** Corrects a confirmed match and replays every later match. Requires a reason; detects concurrent edits. */
export function correctMatch(
  db: Db,
  actorId: string,
  matchId: string,
  rawInput: unknown,
  opts: WriteOptions & { reason: string; expectedUpdatedAt: number },
) {
  const input = matchInputSchema.parse(rawInput);
  const reason = reasonSchema.parse(opts.reason);
  const now = opts.now ?? new Date();
  return db.transaction(
    (tx) => {
      const existing = tx.select().from(matches).where(eq(matches.id, matchId)).get();
      if (!existing) throw new ServiceError("Match not found.", "not_found");
      if (existing.status !== "confirmed") throw new ServiceError("Only confirmed matches can be corrected.", "invalid_state");
      if (existing.updatedAt.getTime() !== opts.expectedUpdatedAt) {
        throw new ServiceError("This match was changed elsewhere. Reload and try again.", "conflict");
      }
      const config = parseRatingConfig(existing.configSnapshot);
      const allowInactive = new Set(Object.values(loadSlots(tx, matchId)).flat());
      const prepared = prepare(tx, input, { timezone: config.timezone, requireValidScore: true, allowInactive, now });
      enforceDuplicates(tx, prepared, input, opts.acknowledgeDuplicate, matchId);
      const before = describeMatch(tx, existing);

      tx.update(matches)
        .set({
          playedAt: new Date(prepared.playedAt),
          updatedAt: now,
          formatTarget: input.formatTarget,
          scoreA: input.scoreA,
          scoreB: input.scoreB,
          rated: input.rated,
          notes: input.notes ?? null,
        })
        .where(eq(matches.id, matchId))
        .run();
      writeSlots(tx, matchId, prepared.ids);
      const rebuilt = rebuildRatings(tx);
      const updated = tx.select().from(matches).where(eq(matches.id, matchId)).get()!;
      writeAudit(tx, {
        actorId,
        entityType: "match",
        entityId: matchId,
        action: "correct",
        before,
        after: { ...describeMatch(tx, updated), timeChanged: before.playedAt !== prepared.playedAt, affectedMatches: rebuilt.changedMatchIds.length },
        reason,
        now,
      });
      return { affectedMatches: rebuilt.changedMatchIds.length };
    },
    { behavior: "immediate" },
  );
}

/** Voids a confirmed match (or discards a draft) and replays history without it. */
export function voidMatch(db: Db, actorId: string, matchId: string, opts: { reason: string; expectedUpdatedAt: number; now?: Date }) {
  const reason = reasonSchema.parse(opts.reason);
  const now = opts.now ?? new Date();
  return db.transaction(
    (tx) => {
      const existing = tx.select().from(matches).where(eq(matches.id, matchId)).get();
      if (!existing) throw new ServiceError("Match not found.", "not_found");
      if (existing.status === "void") throw new ServiceError("This match is already void.", "invalid_state");
      if (existing.updatedAt.getTime() !== opts.expectedUpdatedAt) {
        throw new ServiceError("This match was changed elsewhere. Reload and try again.", "conflict");
      }
      const before = describeMatch(tx, existing);
      tx.update(matches).set({ status: "void", updatedAt: now }).where(eq(matches.id, matchId)).run();
      const rebuilt = rebuildRatings(tx);
      writeAudit(tx, {
        actorId,
        entityType: "match",
        entityId: matchId,
        action: existing.status === "draft" ? "discard" : "void",
        before,
        after: { status: "void", affectedMatches: rebuilt.changedMatchIds.length },
        reason,
        now,
      });
      return { affectedMatches: rebuilt.changedMatchIds.length };
    },
    { behavior: "immediate" },
  );
}
