import { eq } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { DEFAULT_WIN_BY, type WinBy } from "@/lib/rating/config";

export function getPreferredWinBy(ex: Executor, userId: string): WinBy {
  const row = ex.select({ v: users.preferredWinBy }).from(users).where(eq(users.id, userId)).get();
  return row?.v === 1 || row?.v === 2 ? row.v : DEFAULT_WIN_BY;
}

export function setPreferredWinBy(ex: Executor, userId: string, winBy: WinBy) {
  ex.update(users).set({ preferredWinBy: winBy }).where(eq(users.id, userId)).run();
}
