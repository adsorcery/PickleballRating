import { desc, eq, lte } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { auditLogs, ratingConfigVersions } from "@/lib/db/schema";
import { DEFAULT_RATING_CONFIG, ratingConfigSchema, type RatingConfig } from "@/lib/rating/config";

export interface StoredConfig {
  version: number;
  effectiveAt: Date;
  config: RatingConfig;
}

type Row = typeof ratingConfigVersions.$inferSelect;

function rowToConfig(row: Row): StoredConfig {
  return {
    version: row.version,
    effectiveAt: row.effectiveAt,
    config: ratingConfigSchema.parse({
      algorithmVersion: row.algorithmVersion,
      beta: row.beta,
      k: row.k,
      maximumTeamDelta: row.maximumTeamDelta,
      weightTiers: row.weights,
      trailingWindowDays: row.trailingWindowDays,
      provisionalGames: row.provisionalGames,
      matchupDiscount: row.matchupDiscount,
      timezone: row.timezone,
    }),
  };
}

function insertVersion(db: Executor, version: number, config: RatingConfig, createdBy: string | null, now: Date) {
  db.insert(ratingConfigVersions)
    .values({
      version,
      algorithmVersion: config.algorithmVersion,
      beta: config.beta,
      k: config.k,
      maximumTeamDelta: config.maximumTeamDelta,
      weights: config.weightTiers,
      matchupDiscount: config.matchupDiscount,
      trailingWindowDays: config.trailingWindowDays,
      provisionalGames: config.provisionalGames,
      timezone: config.timezone,
      effectiveAt: now,
      createdBy,
    })
    .run();
}

/** Inserts version 1 from defaults (using the supplied timezone) when no config exists yet. */
export function ensureDefaultConfig(db: Executor, timezone: string, now = new Date()) {
  const existing = db.select({ id: ratingConfigVersions.id }).from(ratingConfigVersions).limit(1).get();
  if (existing) return;
  insertVersion(db, 1, { ...DEFAULT_RATING_CONFIG, timezone }, null, now);
}

export function getActiveConfig(db: Executor, now = new Date()): StoredConfig {
  const row = db
    .select()
    .from(ratingConfigVersions)
    .where(lte(ratingConfigVersions.effectiveAt, now))
    .orderBy(desc(ratingConfigVersions.version))
    .limit(1)
    .get();
  if (!row) return { version: 0, effectiveAt: new Date(0), config: DEFAULT_RATING_CONFIG };
  return rowToConfig(row);
}

export function listConfigVersions(db: Executor): StoredConfig[] {
  return db.select().from(ratingConfigVersions).orderBy(desc(ratingConfigVersions.version)).all().map(rowToConfig);
}

/** Publishes a new version. Existing matches keep their stored snapshot, so history is untouched. */
export function publishConfig(
  db: Executor,
  actorId: string,
  config: RatingConfig,
  reason: string,
  now = new Date(),
): StoredConfig {
  return db.transaction(
    (tx) => {
      const latest = tx
        .select({ version: ratingConfigVersions.version })
        .from(ratingConfigVersions)
        .orderBy(desc(ratingConfigVersions.version))
        .limit(1)
        .get();
      const version = (latest?.version ?? 0) + 1;
      const before = latest ? rowToConfig(tx.select().from(ratingConfigVersions).where(eq(ratingConfigVersions.version, latest.version)).get()!) : null;
      insertVersion(tx, version, config, actorId, now);
      tx.insert(auditLogs)
        .values({
          actorId,
          entityType: "rating_config",
          entityId: String(version),
          action: "publish",
          beforeJson: before?.config ?? null,
          afterJson: config,
          reason,
          createdAt: now,
        })
        .run();
      return { version, effectiveAt: now, config };
    },
    { behavior: "immediate" },
  );
}
