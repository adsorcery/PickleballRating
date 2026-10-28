import { AlertTriangle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { MatchPreview } from "@/lib/services/matches";
import { formatDateTime } from "@/lib/time";
import { displaysAsZero, formatCincoDelta, formatCincoRating } from "@/lib/format";
import { cn, formatPercent } from "@/lib/utils";

export function MatchPreviewPanel({ preview, scoreA, scoreB }: { preview: MatchPreview; scoreA: number; scoreB: number }) {
  const { prediction: p } = preview;
  const teams = [
    { label: "Team A", rows: preview.players.filter((x) => x.team === "A"), rating: p.teamARating, share: p.pointShareA, win: p.winProbA, score: scoreA },
    { label: "Team B", rows: preview.players.filter((x) => x.team === "B"), rating: p.teamBRating, share: 1 - p.pointShareA, win: p.winProbB, score: scoreB },
  ];
  return (
    <section aria-label="Match preview" className="space-y-4 rounded-2xl border-2 border-dashed border-primary p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-extrabold">Preview</h3>
        <Badge variant="warning">Projected — not saved until you confirm</Badge>
      </div>

      <p className="text-sm text-muted-foreground">
        {formatDateTime(preview.playedAt, preview.timezone)} · to {preview.formatTarget}
        {!preview.rated && " · unrated (ratings will not change)"}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {teams.map((t) => (
          <div key={t.label} className="rounded-xl bg-muted p-3 text-sm">
            <p className="font-extrabold">
              {t.label} · final score <span className="tabular">{t.score}</span>
            </p>
            <p className="tabular mt-1">Pre-match average {formatCincoRating(t.rating)}</p>
            <p className="tabular">Expected point share {formatPercent(t.share)}</p>
            <p className="tabular">Chance to win game {formatPercent(t.win)}</p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-muted-foreground">
              <th className="px-2 py-1">Player</th>
              <th className="px-2 py-1 text-right">Before</th>
              <th className="px-2 py-1 text-right">Change</th>
              <th className="px-2 py-1 text-right">After</th>
              <th className="px-2 py-1 text-right">Weight</th>
            </tr>
          </thead>
          <tbody>
            {preview.players.map((x) => (
              <tr key={x.id} className="border-t border-border">
                <td className="px-2 py-2">
                  <span className="font-semibold">{x.name}</span> <span className="text-xs text-muted-foreground">({x.team})</span>
                  {x.provisional && (
                    <Badge variant="warning" className="ml-1">
                      Provisional
                    </Badge>
                  )}
                  {x.outOfRange && (
                    <Badge variant="destructive" className="ml-1">
                      Outside 2–6
                    </Badge>
                  )}
                </td>
                <td className="tabular px-2 py-2 text-right">{formatCincoRating(x.pre)}</td>
                <td className={cn("tabular px-2 py-2 text-right font-bold", !displaysAsZero(x.delta) && (x.delta > 0 ? "text-emerald-700" : "text-red-700"))}>{formatCincoDelta(x.delta)}</td>
                <td className="tabular px-2 py-2 text-right font-bold">{formatCincoRating(x.post)}</td>
                <td className="tabular px-2 py-2 text-right" title={`${x.priorGames} rated games in the trailing window`}>
                  ×{x.weight.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-1 text-sm text-muted-foreground">
        <li>
          Team-average shift: <strong className="tabular text-foreground">{formatCincoDelta(preview.teamDelta)}</strong> (capped at ±{preview.maximumTeamDelta.toFixed(2)} per team
          average{preview.teamDeltaCapped ? " — cap applied" : ""}). Individual changes can be larger or smaller because provisional players move more; the four changes always sum to zero.
        </li>
        <li>
          Repeated-matchup rule:{" "}
          {preview.repeat.discounted
            ? `these four have already played ${preview.repeat.priorSameSetGames} rated games that day, so K is halved (${preview.repeat.kEff.toFixed(3)} instead of ${preview.repeat.baseK.toFixed(3)}).`
            : `${preview.repeat.priorSameSetGames} earlier rated game(s) with this group today; full K (${preview.repeat.kEff.toFixed(3)}) applies. Discount starts after ${preview.repeat.freeGames}.`}
        </li>
        {preview.laterMatchesAffected > 0 && (
          <li className="font-semibold text-amber-900">
            <AlertTriangle className="mr-1 inline size-4" aria-hidden />
            This match is dated before later games, so saving replays and changes {preview.laterMatchesAffected} later match result(s).
          </li>
        )}
      </ul>

      {preview.timeChangedFrom !== null && (
        <Alert variant="warning">
          Match time changes from {formatDateTime(preview.timeChangedFrom, preview.timezone)} to {formatDateTime(preview.playedAt, preview.timezone)}. This reorders history and is recorded in the audit log.
        </Alert>
      )}
      {preview.players.some((x) => x.outOfRange) && (
        <Alert variant="warning">A rating would fall outside the normal 2–6 scale. Ratings are not clipped; please review this result.</Alert>
      )}
      {preview.duplicates.length > 0 && (
        <Alert variant="warning">
          Possible duplicate: {preview.duplicates.length} confirmed match(es) with the same four players and score within 6 hours (
          {preview.duplicates.map((d) => formatDateTime(d.playedAt, preview.timezone)).join(", ")}).
        </Alert>
      )}
    </section>
  );
}
