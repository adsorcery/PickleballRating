import { MatchCardView } from "@/components/public/match-card-view";
import type { MatchListItem } from "@/lib/queries";
import { formatDateTime } from "@/lib/time";

/** Server wrapper: formats the date on the server, then hands off to the interactive card. */
export function MatchCard({ match, timezone, showDeltas = true }: { match: MatchListItem; timezone: string; showDeltas?: boolean }) {
  return <MatchCardView match={match} whenLabel={formatDateTime(match.playedAt, timezone)} showDeltas={showDeltas} />;
}
