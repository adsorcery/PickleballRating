import { PlayerDirectory } from "@/components/public/player-directory";
import { getDb } from "@/lib/db/client";
import { listPlayerDirectory } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Players" };

export default function PlayersPage() {
  const rows = listPlayerDirectory(getDb());
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight">Players</h1>
      <PlayerDirectory rows={rows} />
    </div>
  );
}
