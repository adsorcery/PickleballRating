import Link from "next/link";
import { MatchCard } from "@/components/public/match-card";
import { RoastLine } from "@/components/roast/roast-line";
import { T } from "@/components/t";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getTimezone } from "@/lib/app-config";
import { getCurrentAdmin } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { listPlayerDirectory, searchMatches } from "@/lib/queries";
import { localInputToEpoch } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Matches" };

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function MatchesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const db = getDb();
  const tz = getTimezone(db);
  const q = one(sp.q).slice(0, 60);
  const playerId = one(sp.player).slice(0, 100);
  const format = Number(one(sp.format)) || undefined;
  const fromStr = DATE.test(one(sp.from)) ? one(sp.from) : "";
  const toStr = DATE.test(one(sp.to)) ? one(sp.to) : "";
  const page = Math.max(1, Math.floor(Number(one(sp.page))) || 1);

  const result = searchMatches(db, {
    q,
    playerId: playerId || undefined,
    format: format && [11, 15, 21].includes(format) ? format : undefined,
    from: fromStr ? (localInputToEpoch(`${fromStr}T00:00`, tz) ?? undefined) : undefined,
    to: toStr ? (localInputToEpoch(`${toStr}T23:59`, tz) ?? undefined) : undefined,
    page,
    pageSize: 20,
  });
  const directory = listPlayerDirectory(db);
  const isAdmin = !!(await getCurrentAdmin());
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  const linkFor = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (playerId) params.set("player", playerId);
    if (format) params.set("format", String(format));
    if (fromStr) params.set("from", fromStr);
    if (toStr) params.set("to", toStr);
    if (p > 1) params.set("page", String(p));
    const s = params.toString();
    return s ? `/matches?${s}` : "/matches";
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold tracking-tight">
        <T k="nav.history" />
      </h1>
      <Card>
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" aria-label="Filter matches">
          <div className="lg:col-span-2">
            <Label htmlFor="q">Player name</Label>
            <Input id="q" name="q" type="search" defaultValue={q} placeholder="Search…" />
          </div>
          <div>
            <Label htmlFor="player">Player</Label>
            <Select id="player" name="player" defaultValue={playerId}>
              <option value="">Anyone</option>
              {directory.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="format">Format</Label>
            <Select id="format" name="format" defaultValue={format ? String(format) : ""}>
              <option value="">Any</option>
              <option value="11">To 11</option>
              <option value="15">To 15</option>
              <option value="21">To 21</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="from">From</Label>
            <Input id="from" name="from" type="date" defaultValue={fromStr} />
          </div>
          <div>
            <Label htmlFor="to">To</Label>
            <Input id="to" name="to" type="date" defaultValue={toStr} />
          </div>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
            <Button type="submit">
              <T k="common.filter" />
            </Button>
            <Button asChild variant="outline">
              <Link href="/matches">Reset</Link>
            </Button>
          </div>
        </form>
      </Card>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {result.total} {result.total === 1 ? "match" : "matches"}
      </p>
      {result.items.length === 0 ? (
        <div className="space-y-2 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
          <p>No matches found.</p>
          <RoastLine event="no_matches" seed={`matches|${q}|${playerId}|${format ?? ""}|${fromStr}|${toStr}`} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {result.items.map((m) => (
            <div key={m.id} className="space-y-1">
              <MatchCard match={m} timezone={tz} />
              {isAdmin && (
                <Link href={`/admin/matches/${m.id}`} className="ml-1 text-xs font-semibold text-primary hover:underline">
                  Edit or void (admin)
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
      {pages > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between">
          {page > 1 ? (
            <Button asChild variant="outline">
              <Link href={linkFor(page - 1)}>
                <T k="common.back" />
              </Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-sm text-muted-foreground">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Button asChild variant="outline">
              <Link href={linkFor(page + 1)}>
                <T k="common.next" />
              </Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
