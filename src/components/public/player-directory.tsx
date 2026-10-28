"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlayerDirectoryRow } from "@/lib/queries";
import { RoastLine } from "@/components/roast/roast-line";
import { useT } from "@/i18n/use-locale";
import { formatCincoRating } from "@/lib/format";

export function PlayerDirectory({ rows }: { rows: PlayerDirectoryRow[] }) {
  const t = useT();
  const [q, setQ] = useState("");
  const filtered = rows.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <Label htmlFor="player-search">{t("leaderboard.search")}</Label>
        <Input id="player-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("common.search", "Name…")} />
      </div>
      {filtered.length === 0 ? (
        <div className="space-y-2 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
          <p>No players found.</p>
          <RoastLine event="no_matches" seed={`directory|${q}`} />
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link href={`/players/${p.id}`} className="flex min-h-14 items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="mt-0.5 flex gap-1">
                    {!p.active && <Badge>{t("player.inactive")}</Badge>}
                    {p.provisional && <Badge variant="warning" className="whitespace-normal rounded-lg text-left leading-tight">{t("leaderboard.provisional")}</Badge>}
                  </span>
                </span>
                <span className="tabular text-lg font-extrabold">{formatCincoRating(p.rating)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
