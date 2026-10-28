import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import type { auditLogs } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/time";

type Row = typeof auditLogs.$inferSelect;

function scoreText(v: unknown): string | null {
  if (v && typeof v === "object" && "scoreA" in v && "scoreB" in v) {
    const o = v as { scoreA: number; scoreB: number };
    return `${o.scoreA}–${o.scoreB}`;
  }
  return null;
}

export function AuditTrail({ rows, timezone }: { rows: Row[]; timezone: string }) {
  return (
    <Card className="space-y-3">
      <CardTitle>Audit trail</CardTitle>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No entries.</p>
      ) : (
        <ol className="space-y-3">
          {rows.map((r) => {
            const before = scoreText(r.beforeJson);
            const after = scoreText(r.afterJson);
            const a = r.afterJson as { timeChanged?: boolean; affectedMatches?: number } | null;
            const b = r.beforeJson as { playedAt?: number } | null;
            return (
              <li key={r.id} className="rounded-xl bg-muted p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="default">{r.action}</Badge>
                  <time className="text-xs text-muted-foreground">{formatDateTime(r.createdAt.getTime(), timezone)}</time>
                  {a?.timeChanged && <Badge variant="warning">Match time changed{b?.playedAt ? ` (was ${formatDateTime(b.playedAt, timezone)})` : ""}</Badge>}
                </div>
                {before && after && before !== after && (
                  <p className="mt-1">
                    Score {before} → {after}
                  </p>
                )}
                {a?.affectedMatches != null && <p className="text-xs text-muted-foreground">{a.affectedMatches} match result(s) recalculated</p>}
                {r.reason && <p className="mt-1">Reason: {r.reason}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
