import Link from "next/link";
import { notFound } from "next/navigation";
import { MatchCard } from "@/components/public/match-card";
import { RatingChart } from "@/components/public/rating-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { getTimezone } from "@/lib/app-config";
import { getDb } from "@/lib/db/client";
import { getPlayerProfile } from "@/lib/queries";
import { formatCincoRating } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = getPlayerProfile(getDb(), id);
  return { title: p ? p.name : "Player" };
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const p = getPlayerProfile(db, id);
  if (!p) notFound();
  const tz = getTimezone(db);
  const confidence = Math.min(1, p.ratedGames / p.provisionalGames);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center gap-4">
        {p.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-16 rounded-full border border-border object-cover" />
        )}
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{p.name}</h1>
          <div className="mt-1 flex flex-wrap gap-2">
            {p.rank && <Badge variant="accent">Rank #{p.rank}</Badge>}
            {!p.active && <Badge>Inactive</Badge>}
            {p.provisional && <Badge variant="warning">Provisional</Badge>}
          </div>
        </div>
      </header>

      <section aria-label="Ratings" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Current Cinco", formatCincoRating(p.currentRating)],
          ["Initial Cinco", formatCincoRating(p.initialRating)],
          ["Record", `${p.wins}–${p.losses}`],
          ["Games", String(p.games)],
        ].map(([label, value]) => (
          <Card key={label} className="p-4 sm:p-4">
            <p className="text-xs font-semibold text-muted-foreground">{label}</p>
            <p className="tabular text-2xl font-extrabold">{value}</p>
          </Card>
        ))}
      </section>

      <Card className="space-y-2">
        <CardTitle>Rating confidence</CardTitle>
        <div className="h-3 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={p.provisionalGames} aria-valuenow={Math.min(p.ratedGames, p.provisionalGames)} aria-label="Rated games toward an established rating">
          <div className="h-full bg-primary" style={{ width: `${confidence * 100}%` }} />
        </div>
        <CardDescription>
          {p.provisional
            ? `Provisional: ${p.ratedGames} of ${p.provisionalGames} rated games. The starting rating is an estimate, so this rating moves faster until more games are played.`
            : `Established: ${p.ratedGames} rated games.`}
          {p.duprRating != null && ` Reference DUPR: ${p.duprRating.toFixed(2)} (shown for reference only; it is not used in Cinco).`}
        </CardDescription>
      </Card>

      <Card className="space-y-3">
        <CardTitle>Rating history</CardTitle>
        {p.history.length < 2 ? (
          <CardDescription>The chart appears after this player&apos;s first rated game.</CardDescription>
        ) : (
          <RatingChart points={p.history.map((h) => ({ t: h.playedAt, rating: h.rating }))} timezone={tz} />
        )}
      </Card>

      {p.partners.length > 0 && (
        <Card className="space-y-3">
          <CardTitle>Frequent partners</CardTitle>
          <ul className="divide-y divide-border">
            {p.partners.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <Link href={`/players/${s.id}`} className="font-semibold hover:underline">
                  {s.name}
                </Link>
                <span className="tabular text-muted-foreground">
                  {s.games} {s.games === 1 ? "game" : "games"} · {s.wins}–{s.games - s.wins}
                </span>
              </li>
            ))}
          </ul>
          {p.distinctOpponents != null && (
            <CardDescription>
              Has faced {p.distinctOpponents} different opponents (of {p.possibleOpponents} other active players).
            </CardDescription>
          )}
        </Card>
      )}

      <section className="space-y-3" aria-labelledby="recent-games">
        <h2 id="recent-games" className="text-lg font-bold">
          Recent games
        </h2>
        {p.recent.length === 0 ? (
          <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">No confirmed games yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {p.recent.map((m) => (
              <MatchCard key={m.id} match={m} timezone={tz} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
