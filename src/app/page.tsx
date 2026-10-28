import { LeaderboardView } from "@/components/public/leaderboard-view";
import { getTimezone } from "@/lib/app-config";
import { getDb } from "@/lib/db/client";
import { getLeaderboard, getRecentMatches } from "@/lib/queries";
import { formatDateTime } from "@/lib/time";

export const dynamic = "force-dynamic";

export default function LeaderboardPage() {
  const db = getDb();
  const rows = getLeaderboard(db);
  const tz = getTimezone(db);
  const recent = getRecentMatches(db, 6).map((match) => ({ match, whenLabel: formatDateTime(match.playedAt, tz) }));
  return <LeaderboardView rows={rows} recent={recent} />;
}
