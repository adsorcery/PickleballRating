import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { MatchListItem, MatchSide } from "@/lib/queries";
import { formatDateTime } from "@/lib/time";
import { cn, formatDelta } from "@/lib/utils";

function TeamRow({ players, score, won, showDeltas }: { players: MatchSide[]; score: number; won: boolean; showDeltas: boolean }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-lg px-3 py-2", won ? "bg-muted" : "")}>
      <ul className={cn("min-w-0 flex-1 text-sm", won && "font-bold")}>
        {players.map((p) => (
          <li key={p.id} className="flex items-baseline gap-2">
            <Link href={`/players/${p.id}`} className="min-w-0 truncate hover:underline">
              {p.name}
            </Link>
            {showDeltas && p.delta != null && p.delta !== 0 && (
              <span className={cn("tabular shrink-0 text-xs font-semibold", p.delta > 0 ? "text-emerald-700" : "text-red-700")}>{formatDelta(p.delta)}</span>
            )}
          </li>
        ))}
      </ul>
      <span className={cn("tabular shrink-0 text-2xl", won ? "font-extrabold" : "font-semibold text-muted-foreground")}>
        {score}
        <span className="sr-only">{won ? " (winner)" : ""}</span>
      </span>
    </div>
  );
}

export function MatchCard({ match, timezone, showDeltas = true }: { match: MatchListItem; timezone: string; showDeltas?: boolean }) {
  const aWon = match.scoreA > match.scoreB;
  return (
    <article className="min-w-0 rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <time dateTime={new Date(match.playedAt).toISOString()}>{formatDateTime(match.playedAt, timezone)}</time>
        <Badge>To {match.formatTarget}</Badge>
        {!match.rated && <Badge variant="warning">Unrated</Badge>}
      </div>
      <div className="space-y-1">
        <TeamRow players={match.teamA} score={match.scoreA} won={aWon} showDeltas={showDeltas} />
        <TeamRow players={match.teamB} score={match.scoreB} won={!aWon} showDeltas={showDeltas} />
      </div>
    </article>
  );
}
