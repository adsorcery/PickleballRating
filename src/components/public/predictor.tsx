"use client";

import { useMemo, useState } from "react";
import { MotionConfig, motion } from "motion/react";
import { ArrowLeftRight } from "lucide-react";
import { PlayerPicker, type PickerPlayer } from "@/components/ui/player-picker";
import { WinBySelector } from "@/components/ui/win-by-selector";
import { DEFAULT_WIN_BY, winByLabel, type WinBy } from "@/lib/rating/config";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { predictMatch } from "@/lib/rating/predictor";
import { formatCincoRating } from "@/lib/format";
import { cn, formatPercent, formatProbability } from "@/lib/utils";

const TARGETS = [11, 15, 21] as const;
type Target = (typeof TARGETS)[number];

export function Predictor({ players, beta }: { players: PickerPlayer[]; beta: number }) {
  const [sel, setSel] = useState<(string | null)[]>([null, null, null, null]);
  const [target, setTarget] = useState<Target>(11);
  const [winBy, setWinBy] = useState<WinBy>(DEFAULT_WIN_BY);

  const set = (i: number, id: string | null) => setSel((s) => s.map((v, j) => (j === i ? id : v)));
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const picked = sel.map((id) => (id ? byId.get(id) ?? null : null));
  const ready = picked.every(Boolean);

  const prediction = useMemo(() => {
    if (!ready) return null;
    const r = picked.map((p) => p!.rating) as [number, number, number, number];
    return predictMatch(r, target, { beta }, winBy);
  }, [ready, picked, target, beta, winBy]);

  const teamNames = (a: number, b: number) => `${picked[a]?.name ?? "—"} & ${picked[b]?.name ?? "—"}`;
  const anyProvisional = picked.some((p) => p?.provisional);

  return (
    <MotionConfig reducedMotion="user">
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card className="space-y-5">
          <div>
            <CardTitle>Pick four players</CardTitle>
            <CardDescription>Search by name. Each player can only be on one team.</CardDescription>
          </div>
          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-extrabold uppercase tracking-wide text-primary">Team A</legend>
            <PlayerPicker label="Player 1" players={players} value={sel[0]} onChange={(id) => set(0, id)} excludeIds={sel} />
            <PlayerPicker label="Player 2" players={players} value={sel[1]} onChange={(id) => set(1, id)} excludeIds={sel} />
          </fieldset>
          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSel(([a, b, c, d]) => [c, d, a, b])}
              aria-label="Swap Team A and Team B"
            >
              <ArrowLeftRight className="size-4" aria-hidden /> Swap teams
            </Button>
          </div>
          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-extrabold uppercase tracking-wide text-primary">Team B</legend>
            <PlayerPicker label="Player 3" players={players} value={sel[2]} onChange={(id) => set(2, id)} excludeIds={sel} />
            <PlayerPicker label="Player 4" players={players} value={sel[3]} onChange={(id) => set(3, id)} excludeIds={sel} />
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">Game format (play to)</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Game format">
              {TARGETS.map((t) => (
                <label
                  key={t}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center justify-center rounded-lg border text-base font-bold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                    target === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
                  )}
                >
                  <input type="radio" name="format" value={t} checked={target === t} onChange={() => setTarget(t)} className="sr-only" />
                  {t}
                </label>
              ))}
            </div>
          </fieldset>
          <WinBySelector value={winBy} onChange={setWinBy} />
        </Card>

        <Card className="space-y-5" aria-live="polite">
          <CardTitle>Matchup estimate</CardTitle>
          {!prediction ? (
            <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
              Choose all four players to see the estimate.
            </p>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{teamNames(0, 1)}</p>
                    <p className="tabular text-4xl font-extrabold text-primary" data-testid="win-a" data-value={prediction.winProbA}>
                      {formatProbability(prediction.winProbA)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{teamNames(2, 3)}</p>
                    <p className="tabular text-4xl font-extrabold" data-testid="win-b" data-value={prediction.winProbB}>
                      {formatProbability(prediction.winProbB)}
                    </p>
                  </div>
                </div>
                <div
                  className="flex h-6 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={`Team A ${formatProbability(prediction.winProbA)} to win, Team B ${formatProbability(prediction.winProbB)}`}
                >
                  <motion.div
                    className="h-full bg-primary"
                    initial={false}
                    animate={{ width: `${prediction.winProbA * 100}%` }}
                    transition={{ type: "spring", stiffness: 140, damping: 22 }}
                  />
                  <div className="h-full flex-1 bg-accent" />
                </div>
                <p className="text-xs text-muted-foreground">Chance to win a game to {target} ({winByLabel(winBy)}).</p>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-muted p-3">
                  <dt className="text-xs font-semibold text-muted-foreground">Team A average</dt>
                  <dd className="tabular text-lg font-bold">{formatCincoRating(prediction.teamARating)}</dd>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <dt className="text-xs font-semibold text-muted-foreground">Team B average</dt>
                  <dd className="tabular text-lg font-bold">{formatCincoRating(prediction.teamBRating)}</dd>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <dt className="text-xs font-semibold text-muted-foreground">Expected point share A</dt>
                  <dd className="tabular text-lg font-bold">{formatPercent(prediction.pointShareA)}</dd>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <dt className="text-xs font-semibold text-muted-foreground">Expected point share B</dt>
                  <dd className="tabular text-lg font-bold">{formatPercent(1 - prediction.pointShareA)}</dd>
                </div>
              </dl>
              {anyProvisional && <Badge variant="warning">Includes provisional ratings — treat as a rough guess</Badge>}
            </>
          )}
          <div className="space-y-2 rounded-xl border border-border p-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Point share is not win probability.</strong> Point share is the share of
              rallies a team is expected to win. A team that wins 55% of points wins a game far more often than 55%.
            </p>
            <p>
              Win probability assumes every rally is independent and won with that point share. With Win by 1 it is the chance of reaching the target first; with Win by 2 the winner must also lead by two. It is a simplified model, still
              uncalibrated against our group&apos;s results, so treat it as a guide, not a prediction.
            </p>
          </div>
        </Card>
      </div>
    </MotionConfig>
  );
}
