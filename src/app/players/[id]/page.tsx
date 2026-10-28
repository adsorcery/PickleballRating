import { notFound } from "next/navigation";
import { PlayerProfileView } from "@/components/public/player-profile-view";
import { getTimezone } from "@/lib/app-config";
import { getDb } from "@/lib/db/client";
import { getPlayerProfile } from "@/lib/queries";
import { formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getPlayerProfile(getDb(), id);
  return { title: p ? p.name : "Player" };
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const profile = getPlayerProfile(db, id);
  if (!profile) notFound();
  const tz = getTimezone(db);
  const { recent, ...rest } = profile;
  return (
    <PlayerProfileView
      profile={rest}
      recent={recent.map((match) => ({ match, whenLabel: formatDateTime(match.playedAt, tz) }))}
      timezone={tz}
    />
  );
}
