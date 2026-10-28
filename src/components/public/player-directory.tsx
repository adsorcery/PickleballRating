"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlayerDirectoryRow } from "@/lib/queries";
import { formatRating } from "@/lib/utils";

export function PlayerDirectory({ rows }: { rows: PlayerDirectoryRow[] }) {
  const [q, setQ] = useState("");
  const filtered = rows.filter((r) => r.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="space-y-4">
      <div className="max-w-sm">
        <Label htmlFor="player-search">Search players</Label>
        <Input id="player-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name…" />
      </div>
      {filtered.length === 0 ? (
        <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">No players found.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <li key={p.id}>
              <Link href={`/players/${p.id}`} className="flex min-h-14 items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.name}</span>
                  <span className="mt-0.5 flex gap-1">
                    {!p.active && <Badge>Inactive</Badge>}
                    {p.provisional && <Badge variant="warning">Provisional</Badge>}
                  </span>
                </span>
                <span className="tabular text-lg font-extrabold">{formatRating(p.rating)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
