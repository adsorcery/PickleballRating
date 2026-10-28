import Link from "next/link";
import { Swords } from "lucide-react";
import { MatchCard } from "@/components/public/match-card";
import { Trend } from "@/components/public/trend";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { TBody, TD, TH, THead, Table, TR } from "@/components/ui/table";
import { getTimezone } from "@/lib/app-config";
import { getDb } from "@/lib/db/client";
import { getLeaderboard, getRecentMatches } from "@/lib/queries";
import { formatCincoRating } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function LeaderboardPage() {
  const db = getDb();
  const rows = getLeaderboard(db);
  const recent = getRecentMatches(db, 6);
  const tz = getTimezone(db);

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 rounded-3xl bg-primary p-6 text-primary-foreground sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Viet Cinco Leaderboard</h1>
          <p className="mt-1 max-w-prose text-primary-foreground/85">
            Doubles Cinco Points for our pickleball group, updated after every confirmed game.
          </p>
        </div>
        <Button asChild variant="accent" size="lg" className="shrink-0">
          <Link href="/predict">
            <Swords className="size-5" aria-hidden /> Predict a Match
          </Link>
        </Button>
      </section>

      <section aria-labelledby="lb-title">
        <Card className="p-0 sm:p-0">
          <div className="p-4 pb-2 sm:p-6 sm:pb-2">
            <CardTitle id="lb-title">Rankings</CardTitle>
            <CardDescription>
              Sorted by current Cinco Point. Provisional players have fewer than 15 rated games, so their ratings move faster.
            </CardDescription>
          </div>
          {rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No players yet. An admin can add players from the admin area.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>#</TH>
                  <TH>Player</TH>
                  <TH className="text-right">Cinco</TH>
                  <TH className="hidden text-right sm:table-cell">7 days</TH>
                  <TH className="text-right">30 days</TH>
                  <TH className="hidden text-right sm:table-cell">W–L</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((p, i) => (
                  <TR key={p.id}>
                    <TD className="tabular w-10 font-bold text-muted-foreground">{i + 1}</TD>
                    <TD>
                      <Link href={`/players/${p.id}`} className="font-semibold hover:underline">
                        {p.name}
                      </Link>
                      {p.provisional && (
                        <Badge variant="warning" className="ml-2">
                          Provisional
                        </Badge>
                      )}
                      <span className="tabular block text-xs text-muted-foreground sm:hidden">
                        {p.wins}–{p.losses}
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
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
      </section>

      <section aria-labelledby="recent-title" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="recent-title" className="text-lg font-bold">
            Recent results
          </h2>
          <Link href="/matches" className="text-sm font-semibold text-primary hover:underline">
            All matches
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">No confirmed matches yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {recent.map((m) => (
              <MatchCard key={m.id} match={m} timezone={tz} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
