import { and, asc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Db, Executor } from "@/lib/db/client";
import { matches, matchPlayers, players } from "@/lib/db/schema";
import { parseCsv } from "@/lib/csv";
import { ServiceError } from "@/lib/result";
import { replay } from "@/lib/rating/replay";
import { applyOverrides, changedMatchIds, loadReplayInputs, rebuildRatings } from "./replay-store";
import { writeAudit } from "./audit";

export const MAX_RATING = 10;

const optionalNumber = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.coerce.number().finite().min(0).max(MAX_RATING).nullable(),
);

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => {
    try {
      const u = new URL(v);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  }, "Avatar must be an http(s) URL");

const optionalText = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().optional());

export const displayNameSchema = z.string().trim().min(1, "Name is required").max(60);

export const createPlayerSchema = z.object({
  displayName: displayNameSchema,
  initialRating: z.coerce.number({ error: "Initial Cinco Point is required" }).finite().min(0).max(MAX_RATING),
  duprRating: optionalNumber,
  avatarUrl: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), httpUrl.nullable().optional()),
  notes: optionalText(500),
});
export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;

export const updatePlayerSchema = z.object({
  playerId: z.string().min(1),
  displayName: displayNameSchema,
  duprRating: optionalNumber,
  avatarUrl: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), httpUrl.nullable().optional()),
  notes: optionalText(500),
  expectedUpdatedAt: z.number().int(),
});

function nameTaken(ex: Executor, name: string, exceptId?: string): boolean {
  const row = ex
    .select({ id: players.id })
    .from(players)
    .where(sql`lower(${players.displayName}) = lower(${name})`)
    .get();
  return !!row && row.id !== exceptId;
}

export function createPlayer(db: Db, actorId: string, raw: CreatePlayerInput, now = new Date()): string {
  const input = createPlayerSchema.parse(raw);
  return db.transaction(
    (tx) => {
      if (nameTaken(tx, input.displayName)) {
        throw new ServiceError("A player with this name already exists.", "duplicate", { displayName: ["Name already in use"] });
      }
      const id = randomUUID();
      tx.insert(players)
        .values({
          id,
          displayName: input.displayName,
          initialCincoRating: input.initialRating,
          currentCincoRating: input.initialRating,
          duprRating: input.duprRating ?? null,
          avatarUrl: input.avatarUrl ?? null,
          notes: input.notes ?? null,
          active: true,
          createdAt: now,
          updatedAt: now,
        })
        .run();
      writeAudit(tx, { actorId, entityType: "player", entityId: id, action: "create", after: { ...input }, now });
      return id;
    },
    { behavior: "immediate" },
  );
}

export function updatePlayer(db: Db, actorId: string, raw: z.input<typeof updatePlayerSchema>, now = new Date()) {
  const input = updatePlayerSchema.parse(raw);
  db.transaction(
    (tx) => {
      const before = tx.select().from(players).where(eq(players.id, input.playerId)).get();
      if (!before) throw new ServiceError("Player not found.", "not_found");
      if (before.updatedAt.getTime() !== input.expectedUpdatedAt) {
        throw new ServiceError("This player was changed by someone else. Reload and try again.", "conflict");
      }
      if (nameTaken(tx, input.displayName, before.id)) {
        throw new ServiceError("A player with this name already exists.", "duplicate", { displayName: ["Name already in use"] });
      }
      const patch = {
        displayName: input.displayName,
        duprRating: input.duprRating ?? null,
        avatarUrl: input.avatarUrl ?? null,
        notes: input.notes ?? null,
        updatedAt: now,
      };
      tx.update(players).set(patch).where(eq(players.id, before.id)).run();
      writeAudit(tx, {
        actorId,
        entityType: "player",
        entityId: before.id,
        action: "update",
        before: { displayName: before.displayName, duprRating: before.duprRating, avatarUrl: before.avatarUrl, notes: before.notes },
        after: patch,
        now,
      });
    },
    { behavior: "immediate" },
  );
}

export function setPlayerActive(db: Db, actorId: string, playerId: string, active: boolean, now = new Date()) {
  db.transaction(
    (tx) => {
      const before = tx.select().from(players).where(eq(players.id, playerId)).get();
      if (!before) throw new ServiceError("Player not found.", "not_found");
      if (before.active === active) return;
      tx.update(players).set({ active, updatedAt: now }).where(eq(players.id, playerId)).run();
      writeAudit(tx, { actorId, entityType: "player", entityId: playerId, action: active ? "activate" : "deactivate", before: { active: before.active }, after: { active }, now });
    },
    { behavior: "immediate" },
  );
}

export function countConfirmedGames(ex: Executor, playerId: string): number {
  const row = ex
    .select({ n: sql<number>`count(*)` })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(and(eq(matchPlayers.playerId, playerId), eq(matches.status, "confirmed")))
    .get();
  return row?.n ?? 0;
}

export interface InitialRatingImpact {
  hasHistory: boolean;
  confirmedGames: number;
  affectedMatches: number;
  currentBefore: number;
  currentAfter: number;
}

/** Read-only dry run of a full replay with a different opening rating. */
export function previewInitialRatingChange(ex: Executor, playerId: string, newRating: number): InitialRatingImpact {
  const player = ex.select().from(players).where(eq(players.id, playerId)).get();
  if (!player) throw new ServiceError("Player not found.", "not_found");
  const inputs = loadReplayInputs(ex);
  const base = replay(inputs.players, inputs.matches);
  const alt = applyOverrides(inputs, { initialRatings: new Map([[playerId, newRating]]) });
  const next = replay(alt.players, alt.matches);
  const games = countConfirmedGames(ex, playerId);
  return {
    hasHistory: games > 0,
    confirmedGames: games,
    affectedMatches: changedMatchIds(base, next).length,
    currentBefore: base.finalRatings.get(playerId) ?? player.currentCincoRating,
    currentAfter: next.finalRatings.get(playerId) ?? newRating,
  };
}

export const changeInitialRatingSchema = z.object({
  playerId: z.string().min(1),
  newRating: z.coerce.number().finite().min(0).max(MAX_RATING),
  reason: z.string().trim().max(500).optional(),
  confirmReplay: z.boolean().optional(),
  expectedUpdatedAt: z.number().int(),
});

/** Changes an opening rating. With confirmed history this requires confirmation + reason and replays everything. */
export function changeInitialRating(db: Db, actorId: string, raw: z.input<typeof changeInitialRatingSchema>, now = new Date()) {
  const input = changeInitialRatingSchema.parse(raw);
  return db.transaction(
    (tx) => {
      const player = tx.select().from(players).where(eq(players.id, input.playerId)).get();
      if (!player) throw new ServiceError("Player not found.", "not_found");
      if (player.updatedAt.getTime() !== input.expectedUpdatedAt) {
        throw new ServiceError("This player was changed by someone else. Reload and try again.", "conflict");
      }
      if (player.initialCincoRating === input.newRating) throw new ServiceError("The initial rating is unchanged.", "unchanged");
      const impact = previewInitialRatingChange(tx, player.id, input.newRating);
      if (impact.hasHistory) {
        if (!input.confirmReplay) {
          throw new ServiceError(
            `This player has ${impact.confirmedGames} confirmed game(s). Changing the initial rating replays history and alters ${impact.affectedMatches} match(es). Confirm to continue.`,
            "confirmation_required",
          );
        }
        if (!input.reason || input.reason.length < 3) {
          throw new ServiceError("A reason is required.", "validation", { reason: ["Enter a reason (3+ characters)"] });
        }
      }
      tx.update(players).set({ initialCincoRating: input.newRating, updatedAt: now }).where(eq(players.id, player.id)).run();
      if (!impact.hasHistory) {
        tx.update(players).set({ currentCincoRating: input.newRating }).where(eq(players.id, player.id)).run();
      }
      const rebuilt = rebuildRatings(tx);
      writeAudit(tx, {
        actorId,
        entityType: "player",
        entityId: player.id,
        action: "change_initial_rating",
        before: { initialRating: player.initialCincoRating, currentRating: player.currentCincoRating },
        after: { initialRating: input.newRating, affectedMatches: rebuilt.changedMatchIds.length },
        reason: input.reason ?? null,
        now,
      });
      return { ...impact, affectedMatches: rebuilt.changedMatchIds.length };
    },
    { behavior: "immediate" },
  );
}

// ---------- CSV import ----------

export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 256 * 1024;

export type ImportRowStatus = "ok" | "invalid" | "duplicate_existing" | "duplicate_in_file";

export interface ImportRow {
  line: number;
  displayName: string;
  initialRating: number | null;
  duprRating: number | null;
  notes: string | null;
  status: ImportRowStatus;
  message?: string;
}

export interface ImportPreview {
  rows: ImportRow[];
  counts: Record<ImportRowStatus, number>;
  fatal?: string;
}

const HEADER_ALIASES: Record<string, string> = {
  display_name: "displayName",
  name: "displayName",
  displayname: "displayName",
  initial_cinco_rating: "initialRating",
  initial_rating: "initialRating",
  initial: "initialRating",
  cinco: "initialRating",
  dupr_rating: "duprRating",
  dupr: "duprRating",
  notes: "notes",
};

export function previewRosterCsv(ex: Executor, text: string): ImportPreview {
  const empty = { ok: 0, invalid: 0, duplicate_existing: 0, duplicate_in_file: 0 };
  if (text.length > MAX_IMPORT_BYTES) return { rows: [], counts: empty, fatal: "CSV is too large (256 KB max)." };
  let table: string[][];
  try {
    table = parseCsv(text);
  } catch (e) {
    return { rows: [], counts: empty, fatal: (e as Error).message };
  }
  if (table.length < 2) return { rows: [], counts: empty, fatal: "CSV needs a header row and at least one player." };
  if (table.length - 1 > MAX_IMPORT_ROWS) return { rows: [], counts: empty, fatal: `Too many rows (max ${MAX_IMPORT_ROWS}).` };

  const header = table[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase().replace(/\s+/g, "_")] ?? "");
  if (!header.includes("displayName") || !header.includes("initialRating")) {
    return { rows: [], counts: empty, fatal: "Header must include display_name and initial_cinco_rating columns." };
  }
  const existing = new Set(ex.select({ n: players.displayName }).from(players).all().map((p) => p.n.trim().toLowerCase()));
  const seen = new Set<string>();
  const counts = { ...empty };
  const rows: ImportRow[] = table.slice(1).map((cells, idx) => {
    const get = (key: string) => {
      const i = header.indexOf(key);
      return i >= 0 ? (cells[i] ?? "").trim() : "";
    };
    const row: ImportRow = {
      line: idx + 2,
      displayName: get("displayName"),
      initialRating: null,
      duprRating: null,
      notes: get("notes") || null,
      status: "ok",
    };
    const name = displayNameSchema.safeParse(row.displayName);
    const rating = z.coerce.number().finite().min(0).max(MAX_RATING).safeParse(get("initialRating") === "" ? Number.NaN : get("initialRating"));
    const dupr = get("duprRating");
    const duprParsed = dupr === "" ? null : z.coerce.number().finite().min(0).max(MAX_RATING).safeParse(dupr);
    if (!name.success) {
      row.status = "invalid";
      row.message = "Name is required (max 60 characters).";
    } else if (!rating.success) {
      row.status = "invalid";
      row.message = `Initial Cinco Point must be a number between 0 and ${MAX_RATING}.`;
    } else if (duprParsed && !duprParsed.success) {
      row.status = "invalid";
      row.message = "DUPR must be a number.";
    } else if (row.notes && row.notes.length > 500) {
      row.status = "invalid";
      row.message = "Notes are too long (500 max).";
    } else {
      row.initialRating = rating.data;
      row.duprRating = duprParsed && duprParsed.success ? duprParsed.data : null;
      const key = name.data.toLowerCase();
      if (existing.has(key)) {
        row.status = "duplicate_existing";
        row.message = "A player with this name already exists.";
      } else if (seen.has(key)) {
        row.status = "duplicate_in_file";
        row.message = "Name appears earlier in this file.";
      }
      seen.add(key);
    }
    counts[row.status]++;
    return row;
  });
  return { rows, counts };
}

/** Imports every valid, non-duplicate row in one transaction; others are skipped and reported. */
export function importRosterCsv(db: Db, actorId: string, text: string, now = new Date()) {
  return db.transaction(
    (tx) => {
      const preview = previewRosterCsv(tx, text);
      if (preview.fatal) throw new ServiceError(preview.fatal, "validation");
      const ok = preview.rows.filter((r) => r.status === "ok");
      for (const r of ok) {
        const id = randomUUID();
        tx.insert(players)
          .values({
            id,
            displayName: r.displayName,
            initialCincoRating: r.initialRating!,
            currentCincoRating: r.initialRating!,
            duprRating: r.duprRating,
            notes: r.notes,
            active: true,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        writeAudit(tx, { actorId, entityType: "player", entityId: id, action: "import", after: r, now });
      }
      writeAudit(tx, {
        actorId,
        entityType: "players_import",
        entityId: now.toISOString(),
        action: "import",
        after: { imported: ok.length, skipped: preview.rows.length - ok.length },
        now,
      });
      return { imported: ok.length, skipped: preview.rows.length - ok.length };
    },
    { behavior: "immediate" },
  );
}

export function listPlayersAlpha(ex: Executor) {
  return ex.select().from(players).orderBy(asc(sql`lower(${players.displayName})`)).all();
}
