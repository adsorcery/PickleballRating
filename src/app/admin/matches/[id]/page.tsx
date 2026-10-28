import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminNav } from "@/components/admin/admin-nav";
import { T, TPlain } from "@/components/t";
import { AuditTrail } from "@/components/admin/audit-trail";
import { MatchForm } from "@/components/admin/match-form";
import { VoidPanel } from "@/components/admin/void-panel";
import { MatchCard } from "@/components/public/match-card";
import { Badge } from "@/components/ui/badge";
import { requireAdminPage } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { getMatchForEdit, listPlayerDirectory } from "@/lib/queries";
import { parseRatingConfig } from "@/lib/rating/config";
import { listAudit } from "@/lib/services/audit";
import { epochToLocalInput } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Match" };

export default async function AdminMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdminPage();
  const { id } = await params;
  const db = getDb();
  const found = getMatchForEdit(db, id);
  if (!found) notFound();
  const { row, item } = found;
  const tz = parseRatingConfig(row.configSnapshot).timezone;

  const participants = new Set([...item.teamA, ...item.teamB].map((p) => p.id));
  const players = listPlayerDirectory(db)
    .filter((p) => p.active || participants.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, rating: p.rating, provisional: p.provisional }));
  const audit = listAudit(db, "match", id);
  const editable = row.status !== "void";

  return (
    <div className="space-y-6">
      <AdminNav email={admin.email} />
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold">Match</h1>
        <Badge variant={row.status === "confirmed" ? "success" : row.status === "draft" ? "warning" : "destructive"} className="whitespace-normal">
          {row.status === "confirmed" ? (
            <TPlain k="match.confirmed" plain="confirmed" />
          ) : row.status === "draft" ? (
            <TPlain k="match.pending" plain="draft" />
          ) : (
            <TPlain k="match.void" plain="void" />
          )}
        </Badge>
        <Link href="/admin" className="ml-auto text-sm font-semibold text-primary hover:underline">
          Back to overview
        </Link>
      </header>
      <MatchCard match={item} timezone={tz} />
      {editable ? (
        <>
          <h2 className="text-lg font-bold">{row.status === "draft" ? "Edit draft" : <T k="match.edit" en="Correct result" />}</h2>
          {row.status === "confirmed" && (
            <p className="text-sm text-muted-foreground">
              Corrections replay every confirmed match in order using each match&apos;s stored settings (algorithm {row.algorithmVersion}). A reason is required.
            </p>
          )}
          <MatchForm
            mode={row.status === "draft" ? "draft" : "correct"}
            players={players}
            matchId={row.id}
            expectedUpdatedAt={row.updatedAt.getTime()}
            initial={{
              teamA: [item.teamA[0]?.id ?? null, item.teamA[1]?.id ?? null],
              teamB: [item.teamB[0]?.id ?? null, item.teamB[1]?.id ?? null],
              playedAtLocal: epochToLocalInput(row.playedAt.getTime(), tz),
              formatTarget: row.formatTarget as 11 | 15 | 21,
              winBy: row.winBy as 1 | 2,
              scoreA: String(row.scoreA),
              scoreB: String(row.scoreB),
              rated: row.rated,
              notes: row.notes ?? "",
            }}
          />
          <VoidPanel matchId={row.id} expectedUpdatedAt={row.updatedAt.getTime()} isDraft={row.status === "draft"} />
        </>
      ) : (
        <p className="rounded-xl bg-muted p-4 text-sm">This match is void and no longer affects ratings.</p>
      )}
      <AuditTrail rows={audit} timezone={tz} />
    </div>
  );
}
