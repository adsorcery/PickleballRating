import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase, type OpenedDatabase } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";
import { ensureDefaultConfig } from "@/lib/services/config";

export async function memoryDb(timezone = "UTC"): Promise<OpenedDatabase> {
  const opened = openDatabase(":memory:");
  await runMigrations(opened);
  ensureDefaultConfig(opened.db, timezone);
  return opened;
}

export function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "viet-cinco-"));
}
