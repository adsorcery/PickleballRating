"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ClipboardCopy } from "lucide-react";
import { RoastAgainButton, RoastAgainCaption } from "@/components/roast/roast-controls";
import { RoastText, useRoastEvents } from "@/components/roast/roast-line";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/i18n/use-locale";
import { displaysAsZero, formatCincoDelta, formatCincoDeltaPrecise } from "@/lib/format";
import type { MatchListItem, MatchSide } from "@/lib/queries";
import { buildMatchRoast, buildShareText, type MatchRoastLines, type RoastedLine } from "@/lib/roast/lines";
import { cn } from "@/lib/utils";

function TeamRow({
  players,
  score,
  won,
  showDeltas,
  line,
}: {
  players: MatchSide[];
  score: number;
  won: boolean;
  showDeltas: boolean;
  line: RoastedLine | null;
}) {
  return (
    <div>
      <div className={cn("flex items-center justify-between gap-3 rounded-lg px-3 py-2", won ? "bg-muted" : "")}>
        <ul className={cn("min-w-0 flex-1 text-sm", won && "font-bold")}>
          {players.map((p) => (
            <li key={p.id} className="flex items-baseline gap-2">
              <Link href={`/players/${p.id}`} className="min-w-0 truncate hover:underline">
                {p.name}
              </Link>
              {showDeltas && p.delta != null && !displaysAsZero(p.delta) && (
                <span className={cn("tabular shrink-0 text-xs font-semibold", p.delta > 0 ? "text-emerald-700" : "text-red-700")}>{formatCincoDelta(p.delta)}</span>
              )}
            </li>
          ))}
        </ul>
        <span className={cn("tabular shrink-0 text-2xl", won ? "font-extrabold" : "font-semibold text-muted-foreground")}>
          {score}
          <span className="sr-only">{won ? " (winner)" : ""}</span>
        </span>
      </div>
      {line && <RoastText event={line.event} text={line.text} className="px-3 pt-1 text-xs" />}
    </div>
  );
}

export interface MatchCardViewProps {
  match: MatchListItem;
  /** Formatted on the server so server and client markup always agree. */
  whenLabel: string;
  showDeltas?: boolean;
  /** On a player's profile: describe that player's side and rating change instead of both teams. */
  perspectivePlayerId?: string;
}

export function MatchCardView({ match, whenLabel, showDeltas = true, perspectivePlayerId }: MatchCardViewProps) {
  const t = useT();
  const events = useRoastEvents();
  const [variant, setVariant] = useState(0);
  const [copied, setCopied] = useState(false);
  const aWon = match.scoreA > match.scoreB;

  const lines: MatchRoastLines | null = useMemo(
    () => (events ? buildMatchRoast(events, match, variant, perspectivePlayerId) : null),
    [events, match, variant, perspectivePlayerId],
  );

  const myTeam = perspectivePlayerId ? (match.teamA.some((p) => p.id === perspectivePlayerId) ? "A" : "B") : null;
  const lineFor = (team: "A" | "B") => (lines && (!myTeam || myTeam === team) ? lines[team] : null);

  async function copy() {
    if (!lines) return;
    try {
      await navigator.clipboard.writeText(buildShareText(match, lines, whenLabel));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked (insecure context); nothing is lost, the card is still on screen.
    }
  }

  const winByKey = match.winBy === 1 ? "predictor.winByOne" : "predictor.winByTwo";
  const formatLabel = `${t("predictor.gameTo", "To")} ${match.formatTarget} · ${t(winByKey, `Win by ${match.winBy}`)}`;

  return (
    <article className="min-w-0 rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <time dateTime={new Date(match.playedAt).toISOString()}>{whenLabel}</time>
        <Badge className="max-w-full whitespace-normal">{formatLabel}</Badge>
        {!match.rated && <Badge variant="warning">Unrated</Badge>}
      </div>
      <div className="space-y-1">
        <TeamRow players={match.teamA} score={match.scoreA} won={aWon} showDeltas={showDeltas} line={lineFor("A")} />
        <TeamRow players={match.teamB} score={match.scoreB} won={!aWon} showDeltas={showDeltas} line={lineFor("B")} />
      </div>
      {lines?.upset && <RoastText event="upset_win" text={lines.upset.text} className="mt-2 rounded-lg bg-accent/40 px-3 py-1.5 text-xs font-semibold text-foreground" />}
      {lines?.rating && (
        <RoastText
          event={lines.rating.event}
          text={`${formatCincoDeltaPrecise(lines.rating.delta)} — ${lines.rating.text}`}
          className="mt-2 px-3 text-xs"
        />
      )}
      {events && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <RoastAgainButton onClick={() => setVariant((v) => v + 1)} />
          <button
            type="button"
            onClick={copy}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted"
          >
            <ClipboardCopy className="size-4" aria-hidden />
            <span lang="vi">{copied ? t("common.copied") : t("common.copy")}</span>
          </button>
          <RoastAgainCaption variant={variant} seed={`${match.id}|again`} />
        </div>
      )}
    </article>
  );
}
