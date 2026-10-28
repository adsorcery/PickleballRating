import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { Db } from "./client";

export const MIGRATIONS_FOLDER = path.resolve(process.cwd(), "drizzle");

interface JournalEntry {
  idx: number;
  tag: string;
  when: number;
}

export function readJournal(folder = MIGRATIONS_FOLDER): JournalEntry[] {
  const journalPath = path.join(folder, "meta", "_journal.json");
  if (!fs.existsSync(journalPath)) {
    throw new Error(`Migration journal not found at ${journalPath}`);
  }
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { entries: JournalEntry[] };
  for (const entry of journal.entries) {
    const file = path.join(folder, `${entry.tag}.sql`);
    if (!fs.existsSync(file)) {
      throw new Error(`Migration file missing for journal entry ${entry.tag}`);
    }
  }
  return journal.entries;
}

function appliedMigrationCount(sqlite: Database.Database): number {
  const table = sqlite
    .prepare("select name from sqlite_master where type = 'table' and name = '__drizzle_migrations'")
    .get();
  if (!table) return 0;
  return (sqlite.prepare("select count(*) as c from __drizzle_migrations").get() as { c: number }).c;
}

function hasUserTables(sqlite: Database.Database): boolean {
  const row = sqlite
    .prepare(
      "select count(*) as c from sqlite_master where type = 'table' and name not like 'sqlite_%' and name != '__drizzle_migrations'",
    )
    .get() as { c: number };
  return row.c > 0;
}

export interface MigrationResult {
  applied: number;
  backupPath: string | null;
}

/**
 * Validates migration files, takes a consistent online backup when there is existing data and
 * pending migrations, applies them, then verifies integrity. Runs at runtime startup because
 * Render build/pre-deploy steps cannot see the persistent disk.
 */
export async function runMigrations(
  opened: { sqlite: Database.Database; db: Db },
  options: { backupDir?: string; folder?: string; now?: () => Date } = {},
): Promise<MigrationResult> {
  const folder = options.folder ?? MIGRATIONS_FOLDER;
  const entries = readJournal(folder);
  const { sqlite, db } = opened;
  const pending = entries.length - appliedMigrationCount(sqlite);
  if (pending <= 0) return { applied: 0, backupPath: null };

  let backupPath: string | null = null;
  if (options.backupDir && hasUserTables(sqlite)) {
    fs.mkdirSync(options.backupDir, { recursive: true });
    const stamp = (options.now?.() ?? new Date()).toISOString().replace(/[:.]/g, "-");
    backupPath = path.join(options.backupDir, `pre-migrate-${stamp}.sqlite`);
    await sqlite.backup(backupPath);
  }

  migrate(db, { migrationsFolder: folder });

  const integrity = sqlite.pragma("integrity_check") as { integrity_check: string }[];
  if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
    throw new Error(`Integrity check failed after migration: ${JSON.stringify(integrity)}`);
  }
  const fkViolations = sqlite.pragma("foreign_key_check") as unknown[];
  if (fkViolations.length > 0) {
    throw new Error(`Foreign key violations after migration: ${fkViolations.length}`);
  }
  return { applied: pending, backupPath };
}
