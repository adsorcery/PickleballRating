"use client";

import Link from "next/link";
import { useState } from "react";
import { RoastAgainButton, RoastAgainCaption } from "@/components/roast/roast-controls";
import { RoastLine, useRoastEvents } from "@/components/roast/roast-line";
import { MatchCardView } from "@/components/public/match-card-view";
import { RatingChart } from "@/components/public/rating-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { useT } from "@/i18n/use-locale";
import { formatCincoRating } from "@/lib/format";
import type { MatchListItem, PlayerProfile } from "@/lib/queries";
import { classifyPlayerStatus, classifyStreak } from "@/lib/roast/classify-event";

export interface PlayerProfileViewProps {
  profile: Omit<PlayerProfile, "recent">;
  recent: { match: MatchListItem; whenLabel: string }[];
  timezone: string;
}

export function PlayerProfileView({ profile: p, recent, timezone }: PlayerProfileViewProps) {
  const t = useT();
  const roast = useRoastEvents() !== null;
  const [variant, setVariant] = useState(0);
  const confidence = Math.min(1, p.ratedGames / p.provisionalGames);
  const streakEvent = classifyStreak(p.streak);
  const statusEvent = classifyPlayerStatus({ games: p.games, provisional: p.provisional });
  const hasRoastLines = roast && (streakEvent || statusEvent);

  const tiles: [string, string][] = [
    [t("player.currentRating"), formatCincoRating(p.currentRating)],
    [t("player.initialRating"), formatCincoRating(p.initialRating)],
    [roast ? `${t("leaderboard.wins")} / ${t("leaderboard.losses")}` : "Record", `${p.wins}–${p.losses}`],
    [t("stats.games"), String(p.games)],
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-4">
        {p.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-16 rounded-full border border-border object-cover" />
        )}
        <div className="min-w-0">
          {roast && (
            <p className="text-xs font-extrabold uppercase tracking-wide text-primary" lang="vi">
              {t("player.profile")}
            </p>
          )}
          {/* The official name is shown exactly as entered, in every mode. */}
          <h1 className="break-words text-3xl font-extrabold tracking-tight">{p.name}</h1>
          <div className="mt-1 flex flex-wrap gap-2">
            {p.rank && <Badge variant="accent">{roast ? `${t("leaderboard.rank")} #${p.rank}` : `Rank #${p.rank}`}</Badge>}
            {!p.active && <Badge>{t("player.inactive")}</Badge>}
            {p.provisional && (
              <Badge variant="warning" className="whitespace-normal">
                {t("leaderboard.provisional")}
              </Badge>
            )}
            {roast && streakEvent && p.streak && (
              <Badge variant="muted">
                {streakEvent === "win_streak" ? "🔥" : "🧊"} {t("leaderboard.streak")} {p.streak.length}
              </Badge>
            )}
          </div>
        </div>
      </header>

      <section aria-label="Ratings" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(([label, value]) => (
          <Card key={label} className="p-4 sm:p-4">
            <p className="text-xs font-semibold text-muted-foreground">{label}</p>
            <p className="tabular text-2xl font-extrabold">{value}</p>
          </Card>
        ))}
      </section>

      {hasRoastLines && (
        <Card className="space-y-2 bg-accent/30">
          {streakEvent && <RoastLine event={streakEvent} seed={`profile|${p.id}`} variant={variant} />}
          {statusEvent && <RoastLine event={statusEvent} seed={`profile|${p.id}`} variant={variant} />}
          <div className="flex flex-wrap items-center gap-2">
            <RoastAgainButton onClick={() => setVariant((v) => v + 1)} />
            <RoastAgainCaption variant={variant} seed={`profile|${p.id}|again`} />
          </div>
        </Card>
      )}

      <Card className="space-y-2">
        <CardTitle>{t("stats.confidence")}</CardTitle>
        <div
          className="h-3 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={p.provisionalGames}
          aria-valuenow={Math.min(p.ratedGames, p.provisionalGames)}
          aria-label="Rated games toward an established rating"
        >
          <div className="h-full bg-primary" style={{ width: `${confidence * 100}%` }} />
        </div>
        <CardDescription>
          {roast
            ? `${p.provisional ? t("leaderboard.provisional") : t("player.active")} · ${p.ratedGames}/${p.provisionalGames}`
            : p.provisional
              ? `Provisional: ${p.ratedGames} of ${p.provisionalGames} rated games. The starting rating is an estimate, so this rating moves faster until more games are played.`
              : `Established: ${p.ratedGames} rated games.`}
          {p.duprRating != null &&
            (roast
              ? ` · ${t("player.dupr")}: ${p.duprRating.toFixed(2)} (${t("player.duprNote")})`
              : ` Reference DUPR: ${p.duprRating.toFixed(2)} (shown for reference only; it is not used in Cinco).`)}
        </CardDescription>
      </Card>

      <Card className="space-y-3">
        <CardTitle>{t("stats.ratingHistory")}</CardTitle>
        {p.history.length < 2 ? (
          <CardDescription>{roast ? t("stats.noGames") : "The chart appears after this player's first rated game."}</CardDescription>
        ) : (
          <RatingChart points={p.history.map((h) => ({ t: h.playedAt, rating: h.rating }))} timezone={timezone} />
        )}
      </Card>

      {p.partners.length > 0 && (
        <Card className="space-y-3">
          <CardTitle>{t("player.partners")}</CardTitle>
          <ul className="divide-y divide-border">
            {p.partners.map((s) => (
              <li key={s.id} className="py-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/players/${s.id}`} className="min-w-0 truncate font-semibold hover:underline">
                    {s.name}
                  </Link>
                  <span className="tabular shrink-0 text-muted-foreground">
                    {roast ? `${s.games}× · ${s.wins}–${s.games - s.wins}` : `${s.games} ${s.games === 1 ? "game" : "games"} · ${s.wins}–${s.games - s.wins}`}
                  </span>
                </div>
                {s.chemistry && <RoastLine event={s.chemistry} seed={`chem|${p.id}|${s.id}`} variant={variant} className="mt-1 text-xs" />}
              </li>
            ))}
          </ul>
          {p.distinctOpponents != null && (
            <CardDescription>
              {roast
                ? `${t("player.opponents")}: ${p.distinctOpponents}/${p.possibleOpponents}`
                : `Has faced ${p.distinctOpponents} different opponents (of ${p.possibleOpponents} other active players).`}
            </CardDescription>
          )}
        </Card>
      )}

      <section className="space-y-3" aria-labelledby="recent-games">
        <h2 id="recent-games" className="text-lg font-bold">
          {t("player.recent")}
        </h2>
        {recent.length === 0 ? (
          <div className="space-y-2 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
            <p>{roast ? t("stats.noGames") : "No confirmed games yet."}</p>
            <RoastLine event="no_matches" seed={`profile|${p.id}|empty`} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {recent.map(({ match, whenLabel }) => (
              <MatchCardView key={match.id} match={match} whenLabel={whenLabel} perspectivePlayerId={p.id} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
