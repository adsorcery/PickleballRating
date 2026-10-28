"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminAction } from "@/lib/admin-action";
import { getDb } from "@/lib/db/client";
import { ok } from "@/lib/result";
import { ratingConfigSchema } from "@/lib/rating/config";
import { setPreferredWinBy } from "@/lib/services/preferences";
import { publishConfig } from "@/lib/services/config";
import {
  confirmDraft,
  confirmNewMatch,
  correctMatch,
  matchInputSchema,
  previewMatch,
  reasonSchema,
  saveDraft,
  voidMatch,
  type MatchPreview,
} from "@/lib/services/matches";
import {
  changeInitialRating,
  changeInitialRatingSchema,
  createPlayer,
  createPlayerSchema,
  importRosterCsv,
  previewInitialRatingChange,
  previewRosterCsv,
  setPlayerActive,
  updatePlayer,
  updatePlayerSchema,
  MAX_IMPORT_BYTES,
  type ImportPreview,
  type InitialRatingImpact,
} from "@/lib/services/players";
import type { ActionResult } from "@/lib/result";
import { runBackupNow } from "@/lib/backup";

function refresh() {
  revalidatePath("/", "layout");
}

// ---------- players ----------

export async function createPlayerAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return adminAction(createPlayerSchema, input, (admin, data) => {
    const id = createPlayer(getDb(), admin.id, data);
    refresh();
    return ok({ id });
  });
}

export async function updatePlayerAction(input: unknown): Promise<ActionResult> {
  return adminAction(updatePlayerSchema, input, (admin, data) => {
    updatePlayer(getDb(), admin.id, data);
    refresh();
    return ok(undefined);
  });
}

export async function setPlayerActiveAction(input: unknown): Promise<ActionResult> {
  return adminAction(z.object({ playerId: z.string().min(1), active: z.boolean() }), input, (admin, data) => {
    setPlayerActive(getDb(), admin.id, data.playerId, data.active);
    refresh();
    return ok(undefined);
  });
}

export async function previewInitialRatingAction(input: unknown): Promise<ActionResult<InitialRatingImpact>> {
  return adminAction(z.object({ playerId: z.string().min(1), newRating: z.number().finite().min(0).max(10) }), input, (_admin, data) =>
    ok(previewInitialRatingChange(getDb(), data.playerId, data.newRating)),
  );
}

export async function changeInitialRatingAction(input: unknown): Promise<ActionResult<{ affectedMatches: number }>> {
  return adminAction(changeInitialRatingSchema, input, (admin, data) => {
    const r = changeInitialRating(getDb(), admin.id, data);
    refresh();
    return ok({ affectedMatches: r.affectedMatches });
  });
}

const csvSchema = z.object({ text: z.string().max(MAX_IMPORT_BYTES + 1) });

export async function previewCsvAction(input: unknown): Promise<ActionResult<ImportPreview>> {
  return adminAction(csvSchema, input, (_admin, data) => ok(previewRosterCsv(getDb(), data.text)));
}

export async function importCsvAction(input: unknown): Promise<ActionResult<{ imported: number; skipped: number }>> {
  return adminAction(csvSchema, input, (admin, data) => {
    const r = importRosterCsv(getDb(), admin.id, data.text);
    refresh();
    return ok(r);
  });
}

// ---------- matches ----------

export async function previewMatchAction(input: unknown): Promise<ActionResult<MatchPreview>> {
  const schema = z.object({ match: matchInputSchema, matchId: z.string().optional() });
  return adminAction(schema, input, (_admin, data) => ok(previewMatch(getDb(), data.match, { matchId: data.matchId })));
}

export async function confirmMatchAction(input: unknown): Promise<ActionResult<{ matchId: string; alreadySaved: boolean }>> {
  const schema = z.object({ match: matchInputSchema, acknowledgeDuplicate: z.boolean().optional() });
  return adminAction(schema, input, (admin, data) => {
    const r = confirmNewMatch(getDb(), admin.id, data.match, { acknowledgeDuplicate: data.acknowledgeDuplicate });
    refresh();
    return ok(r);
  });
}

export async function saveDraftAction(input: unknown): Promise<ActionResult<{ matchId: string; alreadySaved: boolean }>> {
  const schema = z.object({ match: matchInputSchema, matchId: z.string().optional(), expectedUpdatedAt: z.number().int().optional() });
  return adminAction(schema, input, (admin, data) => {
    const r = saveDraft(getDb(), admin.id, data.match, { matchId: data.matchId, expectedUpdatedAt: data.expectedUpdatedAt });
    refresh();
    return ok(r);
  });
}

export async function confirmDraftAction(input: unknown): Promise<ActionResult<{ matchId: string; alreadySaved: boolean }>> {
  const schema = z.object({
    matchId: z.string().min(1),
    match: matchInputSchema,
    expectedUpdatedAt: z.number().int(),
    acknowledgeDuplicate: z.boolean().optional(),
  });
  return adminAction(schema, input, (admin, data) => {
    const r = confirmDraft(getDb(), admin.id, data.matchId, data.match, {
      expectedUpdatedAt: data.expectedUpdatedAt,
      acknowledgeDuplicate: data.acknowledgeDuplicate,
    });
    refresh();
    return ok(r);
  });
}

export async function correctMatchAction(input: unknown): Promise<ActionResult<{ affectedMatches: number }>> {
  const schema = z.object({
    matchId: z.string().min(1),
    match: matchInputSchema,
    reason: reasonSchema,
    expectedUpdatedAt: z.number().int(),
    acknowledgeDuplicate: z.boolean().optional(),
  });
  return adminAction(schema, input, (admin, data) => {
    const r = correctMatch(getDb(), admin.id, data.matchId, data.match, {
      reason: data.reason,
      expectedUpdatedAt: data.expectedUpdatedAt,
      acknowledgeDuplicate: data.acknowledgeDuplicate,
    });
    refresh();
    return ok(r);
  });
}

export async function voidMatchAction(input: unknown): Promise<ActionResult<{ affectedMatches: number }>> {
  const schema = z.object({ matchId: z.string().min(1), reason: reasonSchema, expectedUpdatedAt: z.number().int() });
  return adminAction(schema, input, (admin, data) => {
    const r = voidMatch(getDb(), admin.id, data.matchId, { reason: data.reason, expectedUpdatedAt: data.expectedUpdatedAt });
    refresh();
    return ok(r);
  });
}

export async function setPreferredWinByAction(input: unknown): Promise<ActionResult> {
  return adminAction(z.object({ winBy: z.union([z.literal(1), z.literal(2)]) }), input, (admin, data) => {
    setPreferredWinBy(getDb(), admin.id, data.winBy);
    return ok(undefined);
  });
}

// ---------- settings ----------

export async function publishConfigAction(input: unknown): Promise<ActionResult<{ version: number }>> {
  const schema = z.object({ config: ratingConfigSchema, reason: reasonSchema });
  return adminAction(schema, input, (admin, data) => {
    const r = publishConfig(getDb(), admin.id, data.config, data.reason);
    refresh();
    return ok({ version: r.version });
  });
}

export async function runBackupAction(): Promise<ActionResult<{ offsite: string }>> {
  return adminAction(z.undefined(), undefined, async () => {
    const r = await runBackupNow("manual");
    refresh();
    return ok({ offsite: r.offsiteStatus });
  });
}
