import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import zlib from "node:zlib";
import Database from "better-sqlite3";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { getDatabase } from "@/lib/db/client";
import { backupRuns } from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { replay } from "@/lib/rating/replay";
import { loadReplayInputs } from "@/lib/services/replay-store";
import { backupDirFor } from "@/lib/init";

export interface BackupResult {
  path: string;
  sizeBytes: number;
  offsiteStatus: "skipped" | "ok" | "failed";
  error?: string;
}

function log(level: "info" | "error", msg: string, extra: Record<string, unknown> = {}) {
  (level === "error" ? console.error : console.log)(JSON.stringify({ level, msg, ...extra }));
}

/** Consistent snapshot via SQLite's online backup API (safe while the WAL database is in use). */
export async function snapshotDatabase(sqlite: Database.Database, destination: string): Promise<void> {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  await sqlite.backup(destination);
}

function removeDbFiles(file: string) {
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${file}${suffix}`, { force: true });
}

async function gzipFile(source: string, destination: string) {
  await pipeline(fs.createReadStream(source), zlib.createGzip({ level: 9 }), fs.createWriteStream(destination));
}

async function gunzipFile(source: string, destination: string) {
  await pipeline(fs.createReadStream(source), zlib.createGunzip(), fs.createWriteStream(destination));
}

export interface VerifyReport {
  integrity: string;
  foreignKeyViolations: number;
  players: number;
  confirmedMatches: number;
  ratingsConsistent: boolean;
  mismatchedPlayers: string[];
}

/**
 * Opens a backup read-only and checks integrity, foreign keys and that stored current ratings
 * equal a fresh deterministic replay. Accepts .sqlite or .sqlite.gz.
 */
export async function verifyBackup(file: string): Promise<VerifyReport> {
  let target = file;
  let tmp: string | null = null;
  if (file.endsWith(".gz")) {
    tmp = path.join(fs.mkdtempSync(path.join(path.dirname(path.resolve(file)), ".verify-")), "restore.sqlite");
    await gunzipFile(file, tmp);
    target = tmp;
  }
  const sqlite = new Database(target, { readonly: true });
  try {
    const integrity = (sqlite.pragma("integrity_check") as { integrity_check: string }[]).map((r) => r.integrity_check).join(";");
    const fk = (sqlite.pragma("foreign_key_check") as unknown[]).length;
    const db = drizzle(sqlite, { schema });
    const inputs = loadReplayInputs(db);
    const fresh = replay(inputs.players, inputs.matches);
    const stored = new Map(db.select({ id: schema.players.id, r: schema.players.currentCincoRating }).from(schema.players).all().map((p) => [p.id, p.r]));
    const mismatched = [...fresh.finalRatings].filter(([id, r]) => Math.abs((stored.get(id) ?? NaN) - r) > 1e-9).map(([id]) => id);
    return {
      integrity,
      foreignKeyViolations: fk,
      players: inputs.players.length,
      confirmedMatches: inputs.matches.length,
      ratingsConsistent: mismatched.length === 0,
      mismatchedPlayers: mismatched,
    };
  } finally {
    sqlite.close();
    if (tmp) fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  }
}

function pruneOldBackups(dir: string, keep: number) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^viet-cinco-.*\.sqlite\.gz$/.test(f))
    .sort()
    .reverse();
  for (const f of files.slice(keep)) fs.rmSync(path.join(dir, f), { force: true });
}

async function uploadOffsite(file: string): Promise<"ok" | "skipped"> {
  const env = getEnv();
  if (!env.BACKUP_S3_BUCKET || !env.BACKUP_S3_ACCESS_KEY_ID || !env.BACKUP_S3_SECRET_ACCESS_KEY) return "skipped";
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: env.BACKUP_S3_REGION,
    endpoint: env.BACKUP_S3_ENDPOINT,
    forcePathStyle: !!env.BACKUP_S3_ENDPOINT,
    credentials: { accessKeyId: env.BACKUP_S3_ACCESS_KEY_ID, secretAccessKey: env.BACKUP_S3_SECRET_ACCESS_KEY },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: env.BACKUP_S3_BUCKET,
      Key: `${env.BACKUP_S3_PREFIX}${path.basename(file)}`,
      Body: fs.readFileSync(file),
      ContentType: "application/gzip",
    }),
  );
  return "ok";
}

let running: Promise<BackupResult> | null = null;

/** Takes a consistent snapshot, verifies it, compresses it, prunes old copies, and uploads off-host if configured. */
export function runBackupNow(kind: "manual" | "scheduled" | "cli"): Promise<BackupResult> {
  running ??= doBackup(kind).finally(() => {
    running = null;
  });
  return running;
}

async function doBackup(kind: string): Promise<BackupResult> {
  const env = getEnv();
  const { sqlite, db } = getDatabase();
  const dir = backupDirFor(env.DATABASE_PATH);
  const startedAt = new Date();
  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const raw = path.join(dir, `viet-cinco-${stamp}.sqlite`);
  const gz = `${raw}.gz`;
  const run = db.insert(backupRuns).values({ startedAt, kind }).returning({ id: backupRuns.id }).get();
  try {
    await snapshotDatabase(sqlite, raw);
    const report = await verifyBackup(raw);
    if (report.integrity !== "ok" || report.foreignKeyViolations > 0) {
      throw new Error(`Backup failed verification: ${JSON.stringify(report)}`);
    }
    await gzipFile(raw, gz);
    removeDbFiles(raw);
    pruneOldBackups(dir, env.BACKUP_RETENTION_COUNT);
    const sizeBytes = fs.statSync(gz).size;
    let offsiteStatus: BackupResult["offsiteStatus"];
    let error: string | undefined;
    try {
      offsiteStatus = await uploadOffsite(gz);
    } catch (e) {
      offsiteStatus = "failed";
      error = e instanceof Error ? e.message : String(e);
      log("error", "off-host backup upload failed", { error });
    }
    db.update(backupRuns)
      .set({ finishedAt: new Date(), localPath: gz, sizeBytes, offsiteStatus, error: error ?? null })
      .where(eq(backupRuns.id, run.id))
      .run();
    log("info", "backup complete", { file: gz, sizeBytes, offsiteStatus });
    return { path: gz, sizeBytes, offsiteStatus, error };
  } catch (e) {
    removeDbFiles(raw);
    const message = e instanceof Error ? e.message : String(e);
    db.update(backupRuns).set({ finishedAt: new Date(), error: message }).where(eq(backupRuns.id, run.id)).run();
    log("error", "backup failed", { error: message });
    throw e;
  }
}

export function latestBackupRuns(limit = 5) {
  return getDatabase().db.select().from(backupRuns).orderBy(desc(backupRuns.id)).limit(limit).all();
}

const globalForScheduler = globalThis as unknown as { __vietCincoBackupTimer?: NodeJS.Timeout };

/** Starts the in-process backup schedule (single instance owns the disk, so a cron job cannot reach it). */
export function startBackupScheduler() {
  const hours = getEnv().BACKUP_INTERVAL_HOURS;
  if (hours <= 0 || globalForScheduler.__vietCincoBackupTimer) return;
  const intervalMs = hours * 3600 * 1000;
  const tick = () => {
    runBackupNow("scheduled").catch(() => undefined);
  };
  const last = latestBackupRuns(1)[0];
  const due = !last || Date.now() - last.startedAt.getTime() >= intervalMs;
  if (due) setTimeout(tick, 60_000).unref();
  globalForScheduler.__vietCincoBackupTimer = setInterval(tick, intervalMs);
  globalForScheduler.__vietCincoBackupTimer.unref();
}
