import path from "node:path";
import { createUser, countUsers } from "@/lib/auth/auth";
import { hashPassword } from "@/lib/auth/password";
import { getDatabase, type OpenedDatabase } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { getEnv } from "@/lib/env";
import { ensureDefaultConfig } from "@/lib/services/config";

export function backupDirFor(databasePath: string): string {
  return path.join(path.dirname(path.resolve(databasePath)), "backups");
}

function log(msg: string, extra: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ level: "info", msg, ...extra }));
}

/** Idempotent runtime initialisation: migrations (with backup), default config, admin bootstrap. */
export async function initialize(opened: OpenedDatabase = getDatabase()) {
  const env = getEnv();
  const result = await runMigrations(opened, { backupDir: backupDirFor(env.DATABASE_PATH) });
  if (result.applied > 0) log("migrations applied", { applied: result.applied, backup: result.backupPath });

  ensureDefaultConfig(opened.db, env.APP_TIMEZONE);

  if (env.ADMIN_BOOTSTRAP_EMAIL && env.ADMIN_BOOTSTRAP_PASSWORD && countUsers(opened.db) === 0) {
    createUser(opened.db, {
      email: env.ADMIN_BOOTSTRAP_EMAIL,
      passwordHash: await hashPassword(env.ADMIN_BOOTSTRAP_PASSWORD),
    });
    log("bootstrap admin created", { email: env.ADMIN_BOOTSTRAP_EMAIL });
  }
}

/** Runtime-only extras (not used by CLI scripts). */
export async function startBackgroundJobs() {
  const { startBackupScheduler } = await import("@/lib/backup");
  startBackupScheduler();
}
