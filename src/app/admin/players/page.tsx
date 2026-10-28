import { AdminNav } from "@/components/admin/admin-nav";
import { T } from "@/components/t";
import { CreatePlayerForm, CsvImport, PlayerEditor, type AdminPlayerRow } from "@/components/admin/player-forms";
import { requireAdminPage } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { listPlayersAlpha, countConfirmedGames } from "@/lib/services/players";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage players" };

export default async function AdminPlayersPage() {
  const admin = await requireAdminPage();
  const db = getDb();
  const rows: AdminPlayerRow[] = listPlayersAlpha(db).map((p) => ({
    id: p.id,
    displayName: p.displayName,
    initialRating: p.initialCincoRating,
    currentRating: p.currentCincoRating,
    duprRating: p.duprRating,
    avatarUrl: p.avatarUrl,
    notes: p.notes,
    active: p.active,
    updatedAt: p.updatedAt.getTime(),
    games: countConfirmedGames(db, p.id),
  }));
  return (
    <div className="space-y-6">
      <AdminNav email={admin.email} />
      <h1 className="text-2xl font-extrabold">
        <T k="nav.players" />
      </h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <CreatePlayerForm />
        <CsvImport />
      </div>
      <section className="space-y-3" aria-label="All players">
        <h2 className="text-lg font-bold">All players ({rows.length})</h2>
        {rows.length === 0 ? <p className="rounded-xl bg-muted p-4 text-sm">No players yet.</p> : rows.map((p) => <PlayerEditor key={p.id} player={p} />)}
      </section>
    </div>
  );
}
