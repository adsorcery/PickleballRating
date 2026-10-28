"use client";

import Link from "next/link";
import { Swords } from "lucide-react";
import { RoastLine } from "@/components/roast/roast-line";
import { MatchCardView } from "@/components/public/match-card-view";
import { Trend } from "@/components/public/trend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, Table, TR } from "@/components/ui/table";
import { useIsRoast, useT } from "@/i18n/use-locale";
import { formatCincoRating } from "@/lib/format";
import type { LeaderboardRow, MatchListItem } from "@/lib/queries";
import { classifyStreak } from "@/lib/roast/classify-event";

export interface LeaderboardViewProps {
  rows: LeaderboardRow[];
  recent: { match: MatchListItem; whenLabel: string }[];
}

export function LeaderboardView({ rows, recent }: LeaderboardViewProps) {
  const t = useT();
  const roast = useIsRoast();
  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 rounded-3xl bg-primary p-6 text-primary-foreground sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t("leaderboard.title")}</h1>
          <p className="mt-1 max-w-prose text-primary-foreground/85">{t("leaderboard.subtitle")}</p>
        </div>
        <Button asChild variant="accent" size="lg" className="h-auto min-h-12 shrink-0 whitespace-normal py-2 text-center">
          <Link href="/predict">
            <Swords className="size-5 shrink-0" aria-hidden /> {t("predictor.title")}
          </Link>
        </Button>
      </section>

      <section aria-labelledby="lb-title">
        <Card className="p-0 sm:p-0">
          <div className="p-4 pb-2 sm:p-6 sm:pb-2">
            <CardTitle id="lb-title">{t("nav.stats")}</CardTitle>
            <CardDescription>{t("leaderboard.description")}</CardDescription>
          </div>
          {rows.length === 0 ? (
            <div className="space-y-2 p-6 text-sm text-muted-foreground">
              <p>{t("leaderboard.noData")}</p>
              <RoastLine event="no_matches" seed="leaderboard|empty" />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="whitespace-normal">{t("leaderboard.rank")}</TH>
                  <TH className="whitespace-normal">{t("leaderboard.player")}</TH>
                  <TH className="whitespace-normal text-right">{t("leaderboard.rating")}</TH>
                  <TH className="hidden whitespace-normal text-right sm:table-cell">{roast ? `${t("leaderboard.change")} · ${t("leaderboard.trend7")}` : t("leaderboard.trend7")}</TH>
                  <TH className="whitespace-normal text-right">{roast ? `${t("leaderboard.change")} · ${t("leaderboard.trend30")}` : t("leaderboard.trend30")}</TH>
                  <TH className="hidden whitespace-normal text-right sm:table-cell">{roast ? `${t("leaderboard.wins")} / ${t("leaderboard.losses")}` : "W–L"}</TH>
                  {roast && <TH className="hidden whitespace-normal text-right md:table-cell">{t("leaderboard.streak")}</TH>}
                </TR>
              </THead>
              <TBody>
                {rows.map((p, i) => {
                  const streakEvent = classifyStreak(p.streak);
                  return (
                    <TR key={p.id}>
                      <TD className="tabular w-10 font-bold text-muted-foreground">{i + 1}</TD>
                      <TD>
                        <Link href={`/players/${p.id}`} className="font-semibold hover:underline">
                          {p.name}
                        </Link>
                        {p.provisional && (
                          <Badge
                            variant="warning"
                            className={roast ? "mt-1 block w-fit max-w-full whitespace-normal rounded-lg text-left leading-tight" : "ml-2 whitespace-normal"}
                          >
                            {t("leaderboard.provisional")}
                          </Badge>
                        )}
                        <span className="tabular block text-xs text-muted-foreground sm:hidden">
                          {p.wins}–{p.losses}
                          {roast && streakEvent && p.streak && (
                            <span className="ml-2 font-semibold">
                              {streakEvent === "win_streak" ? "🔥" : "🧊"} {p.streak.length}
                            </span>
                          )}
                        </span>
                      </TD>
                      <TD className="tabular text-right text-base font-extrabold">{formatCincoRating(p.rating)}</TD>
                      <TD className="hidden text-right sm:table-cell">
                        <Trend value={p.trend7} />
                      </TD>
                      <TD className="text-right">
                        <Trend value={p.trend30} />
                      </TD>
                      <TD className="tabular hidden text-right sm:table-cell">
                        {p.wins}–{p.losses}
                      </TD>
                      {roast && (
                        <TD className="tabular hidden text-right md:table-cell">
                          {streakEvent && p.streak ? (
                            <span title={streakEvent === "win_streak" ? `${p.streak.length}W` : `${p.streak.length}L`}>
                              {streakEvent === "win_streak" ? "🔥" : "🧊"} {p.streak.length}
                              <span className="sr-only">{streakEvent === "win_streak" ? " wins in a row" : " losses in a row"}</span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TD>
                      )}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      </section>

      <section aria-labelledby="recent-title" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="recent-title" className="text-lg font-bold">
            {t("nav.history", "Recent results")}
          </h2>
          <Link href="/matches" className="text-right text-sm font-semibold text-primary hover:underline">
            {t("nav.matches", "All matches")}
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="space-y-2 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
            <p>No confirmed matches yet.</p>
            <RoastLine event="no_matches" seed="recent|empty" />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {recent.map(({ match, whenLabel }) => (
              <MatchCardView key={match.id} match={match} whenLabel={whenLabel} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
