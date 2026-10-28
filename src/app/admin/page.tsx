import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { MatchCard } from "@/components/public/match-card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getTimezone } from "@/lib/app-config";
import { requireAdminPage } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { getAdminOverview } from "@/lib/queries";
import { formatRating } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin" };

export default async function AdminHome() {
  const admin = await requireAdminPage();
  const db = getDb();
  const o = getAdminOverview(db);
  const tz = getTimezone(db);
  return (
    <div className="space-y-6">
      <AdminNav email={admin.email} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">Admin overview</h1>
        <Button asChild>
          <Link href="/admin/matches/new">Enter a match</Link>
        </Button>
      </div>

      <section className="grid grid-cols-3 gap-3" aria-label="Summary">
        {[
          ["Players", `${o.activeCount}/${o.playerCount} active`],
          ["Confirmed matches", String(o.confirmedMatches)],
          ["Drafts", String(o.drafts.length)],
        ].map(([k, v]) => (
          <Card key={k} className="p-4 sm:p-4">
            <p className="text-xs font-semibold text-muted-foreground">{k}</p>
            <p className="text-xl font-extrabold">{v}</p>
          </Card>
        ))}
      </section>

      {o.outOfRange.length > 0 && (
        <Alert variant="warning">
          <strong>Review needed:</strong> ratings outside the normal 2–6 scale (not clipped):{" "}
          {o.outOfRange.map((p) => (
            <Link key={p.id} href={`/players/${p.id}`} className="mr-2 font-semibold underline">
              {p.name} ({formatRating(p.rating)})
            </Link>
          ))}
        </Alert>
      )}

      <section className="space-y-3" aria-label="Pending drafts">
        <h2 className="text-lg font-bold">Pending drafts</h2>
        {o.drafts.length === 0 ? (
          <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">No drafts. Drafts never affect ratings.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {o.drafts.map((m) => (
              <div key={m.id} className="space-y-1">
                <MatchCard match={m} timezone={tz} showDeltas={false} />
                <Link href={`/admin/matches/${m.id}`} className="ml-1 text-sm font-semibold text-primary hover:underline">
                  Review and confirm
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3" aria-label="Recent matches">
        <h2 className="text-lg font-bold">Recent matches</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {o.recent.map((m) => (
            <div key={m.id} className="space-y-1">
              <MatchCard match={m} timezone={tz} />
              <div className="ml-1 flex items-center gap-2">
                {m.status === "void" && <Badge variant="destructive">Void</Badge>}
                <Link href={`/admin/matches/${m.id}`} className="text-sm font-semibold text-primary hover:underline">
                  {m.status === "void" ? "View audit trail" : "Correct or void"}
                </Link>
              </div>
            </div>
          ))}
          {o.recent.length === 0 && <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">No matches yet.</p>}
        </div>
      </section>
    </div>
  );
}
