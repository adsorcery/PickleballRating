import { AdminNav } from "@/components/admin/admin-nav";
import { MatchForm } from "@/components/admin/match-form";
import { getTimezone } from "@/lib/app-config";
import { requireAdminPage } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { listSelectablePlayers } from "@/lib/queries";
import { nowLocalInput } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "New match" };

export default async function NewMatchPage() {
  const admin = await requireAdminPage();
  const db = getDb();
  const players = listSelectablePlayers(db);
  const tz = getTimezone(db);
  return (
    <div className="space-y-6">
      <AdminNav email={admin.email} />
      <header>
        <h1 className="text-2xl font-extrabold">Enter a doubles match</h1>
        <p className="text-sm text-muted-foreground">Times are in {tz}. Preview the rating changes, then confirm. Nothing is saved to the ratings until you confirm.</p>
      </header>
      {players.length < 4 ? (
        <p className="rounded-xl bg-muted p-4 text-sm">Add at least four active players first.</p>
      ) : (
        <MatchForm
          mode="new"
          players={players}
          initial={{
            teamA: [null, null],
            teamB: [null, null],
            playedAtLocal: nowLocalInput(tz),
            formatTarget: 11,
            scoreA: "0",
            scoreB: "0",
            rated: true,
            notes: "",
          }}
        />
      )}
    </div>
  );
}
