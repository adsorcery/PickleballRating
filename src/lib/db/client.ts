import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

export type Db = BetterSQLite3Database<typeof schema>;
/** Either the root database or a transaction handle (both expose the same query API). */
export type Executor = BaseSQLiteDatabase<"sync", Database.RunResult, typeof schema>;

export interface OpenedDatabase {
  sqlite: Database.Database;
  db: Db;
}

export function applyPragmas(sqlite: Database.Database) {
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("synchronous = NORMAL");
}

export function openDatabase(filePath: string): OpenedDatabase {
  if (filePath !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  }
  const sqlite = new Database(filePath);
  applyPragmas(sqlite);
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

const globalForDb = globalThis as unknown as { __vietCincoDb?: OpenedDatabase };

/** Lazy singleton: the process owns exactly one connection (single-instance deployment). */
export function getDatabase(): OpenedDatabase {
  if (!globalForDb.__vietCincoDb) {
    globalForDb.__vietCincoDb = openDatabase(getEnv().DATABASE_PATH);
  }
  return globalForDb.__vietCincoDb;
}

export function getDb(): Db {
  return getDatabase().db;
}

export function closeDatabase() {
  globalForDb.__vietCincoDb?.sqlite.close();
  globalForDb.__vietCincoDb = undefined;
}

export { schema };
