import { desc, and, eq } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { auditLogs } from "@/lib/db/schema";

export interface AuditEntry {
  actorId: string | null;
  entityType: "player" | "match" | "rating_config" | "players_import";
  entityId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  now?: Date;
}

export function writeAudit(ex: Executor, e: AuditEntry) {
  ex.insert(auditLogs)
    .values({
      actorId: e.actorId,
      entityType: e.entityType,
      entityId: e.entityId,
      action: e.action,
      beforeJson: e.before ?? null,
      afterJson: e.after ?? null,
      reason: e.reason ?? null,
      createdAt: e.now ?? new Date(),
    })
    .run();
}

export function listAudit(ex: Executor, entityType: AuditEntry["entityType"], entityId: string) {
  return ex
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId)))
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .all();
}
