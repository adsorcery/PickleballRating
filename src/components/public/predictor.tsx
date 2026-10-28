"use client";

import { useMemo, useState } from "react";
import { MotionConfig, motion } from "motion/react";
import { ArrowLeftRight, Scale } from "lucide-react";
import { RoastAgainButton, RoastAgainCaption } from "@/components/roast/roast-controls";
import { RoastText, useRoastEvents } from "@/components/roast/roast-line";
import { PlayerPicker, type PickerPlayer } from "@/components/ui/player-picker";
import { WinBySelector } from "@/components/ui/win-by-selector";
import { DEFAULT_WIN_BY, winByLabel, type WinBy } from "@/lib/rating/config";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/i18n/use-locale";
import { balanceTeams } from "@/lib/balance-teams";
import { predictMatch } from "@/lib/rating/predictor";
import { classifyPrediction } from "@/lib/roast/classify-event";
import { pickMessage, predictionSeed } from "@/lib/roast/pick-message";
import { formatCincoRating } from "@/lib/format";
import { cn, formatPercent, formatProbability } from "@/lib/utils";

const TARGETS = [11, 15, 21] as const;
type Target = (typeof TARGETS)[number];

export function Predictor({ players, beta }: { players: PickerPlayer[]; beta: number }) {
  const t = useT();
  const events = useRoastEvents();
  const roast = events !== null;
  const [sel, setSel] = useState<(string | null)[]>([null, null, null, null]);
  const [target, setTarget] = useState<Target>(11);
  const [winBy, setWinBy] = useState<WinBy>(DEFAULT_WIN_BY);
  const [variant, setVariant] = useState(0);
  // The selection the balance button produced; the "balanced" line shows only while it is unchanged.
  const [balancedFor, setBalancedFor] = useState<string | null>(null);

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
  const winByText = t(winBy === 1 ? "predictor.winByOne" : "predictor.winByTwo", winByLabel(winBy));

  function balance() {
    if (!ready) return;
    const next = balanceTeams(picked.map((p) => ({ id: p!.id, rating: p!.rating })) as [never, never, never, never]);
    setSel(next);
    setBalancedFor(next.join("|"));
  }

  // Roast lines are derived from the same win probabilities the bars show (game probability for the
  // chosen target and rule), never from the point share.
  const verdict = useMemo(() => {
    if (!events || !prediction || !ready) return null;
    const ids = sel as string[];
    const seedFor = (team: "A" | "B") => predictionSeed({ teamA: ids.slice(0, 2), teamB: ids.slice(2), target, winBy, team });
    const eventA = classifyPrediction(prediction.winProbA);
    const eventB = classifyPrediction(prediction.winProbB);
    const line = (event: typeof eventA, team: "A" | "B") => pickMessage(events[event], `${seedFor(team)}|${event}|vi-roast`, variant);
    const even = eventA === "prediction_even";
    const balancedLine =
      balancedFor === ids.join("|") ? pickMessage(events.balanced_match, `${seedFor("A")}|balanced_match|vi-roast`, variant) : null;
    return {
      even,
      eventA,
      eventB,
      textA: line(eventA, "A"),
      textB: even ? null : line(eventB, "B"),
      balancedLine,
      favored: prediction.winProbA >= prediction.winProbB ? "A" : "B",
    };
  }, [events, prediction, ready, sel, target, winBy, variant, balancedFor]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card className="space-y-5">
          <div>
            <CardTitle>{t("predictor.pickPlayer", "Pick four players")}</CardTitle>
            <CardDescription>Search by name. Each player can only be on one team.</CardDescription>
          </div>
          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-extrabold uppercase tracking-wide text-primary">{t("predictor.teamA")}</legend>
            <PlayerPicker label="Player 1" players={players} value={sel[0]} onChange={(id) => set(0, id)} excludeIds={sel} />
            <PlayerPicker label="Player 2" players={players} value={sel[1]} onChange={(id) => set(1, id)} excludeIds={sel} />
          </fieldset>
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSel(([a, b, c, d]) => [c, d, a, b])}
              aria-label="Swap Team A and Team B"
              className="h-auto min-h-11 whitespace-normal py-1.5 text-center"
            >
              <ArrowLeftRight className="size-4 shrink-0" aria-hidden /> {t("predictor.swap")}
            </Button>
            {roast && (
              <Button type="button" variant="outline" size="sm" onClick={balance} disabled={!ready} className="h-auto min-h-11 whitespace-normal py-1.5 text-center">
                <Scale className="size-4 shrink-0" aria-hidden /> <span lang="vi">{t("predictor.balance")}</span>
              </Button>
            )}
          </div>
          <fieldset className="space-y-3">
            <legend className="mb-1 text-sm font-extrabold uppercase tracking-wide text-primary">{t("predictor.teamB")}</legend>
            <PlayerPicker label="Player 3" players={players} value={sel[2]} onChange={(id) => set(2, id)} excludeIds={sel} />
            <PlayerPicker label="Player 4" players={players} value={sel[3]} onChange={(id) => set(3, id)} excludeIds={sel} />
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-sm font-semibold">{t("predictor.gameTo")}</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t("predictor.gameTo")}>
              {TARGETS.map((n) => (
                <label
                  key={n}
                  className={cn(
                    "flex min-h-12 cursor-pointer items-center justify-center rounded-lg border text-base font-bold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                    target === n ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
                  )}
                >
                  <input type="radio" name="format" value={n} checked={target === n} onChange={() => setTarget(n)} className="sr-only" />
                  {n}
                </label>
              ))}
            </div>
          </fieldset>
          <WinBySelector value={winBy} onChange={setWinBy} />
        </Card>

        <Card className="space-y-5" aria-live="polite">
          <CardTitle>
            {roast && <span aria-hidden>🔮 </span>}
            {t("predictor.predict", "Matchup estimate")}
          </CardTitle>
          {!prediction ? (
            <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
              {roast ? t("predictor.subtitle") : "Choose all four players to see the estimate."}
            </p>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{teamNames(0, 1)}</p>
                    {roast && <p className="text-xs text-muted-foreground" lang="vi">{t("predictor.winChance")}</p>}
                    <p className="tabular text-4xl font-extrabold text-primary" data-testid="win-a" data-value={prediction.winProbA}>
                      {formatProbability(prediction.winProbA)}
                    </p>
                  </div>
                  <div className="min-w-0 text-right">
                    <p className="text-sm font-semibold">{teamNames(2, 3)}</p>
                    {roast && <p className="text-xs text-muted-foreground" lang="vi">{t("predictor.winChance")}</p>}
                    <p className="tabular text-4xl font-extrabold" data-testid="win-b" data-value={prediction.winProbB}>
                      {formatProbability(prediction.winProbB)}
                    </p>
                  </div>
                </div>
                <div
                  className="flex h-6 overflow-hidden rounded-full bg-muted"
                  role="img"
                  aria-label={`${teamNames(0, 1)} ${formatProbability(prediction.winProbA)} to win, ${teamNames(2, 3)} ${formatProbability(prediction.winProbB)}${roast ? ` (${t("predictor.winChance")} / ${t("predictor.loseChance")})` : ""}`}
                >
                  <motion.div
                    className="h-full bg-primary"
                    initial={false}
                    animate={{ width: `${prediction.winProbA * 100}%` }}
                    transition={{ type: "spring", stiffness: 140, damping: 22 }}
                  />
                  <div className="h-full flex-1 bg-accent" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {roast
                    ? `${t("predictor.winChance")} · ${t("predictor.gameTo")} ${target} · ${winByText}`
                    : `Chance to win a game to ${target} (${winByLabel(winBy)}).`}
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-muted p-3">
                  <dt className="text-xs font-semibold text-muted-foreground">{roast ? `${t("predictor.teamA")} · ${t("leaderboard.rating")}` : "Team A average"}</dt>
                  <dd className="tabular text-lg font-bold">{formatCincoRating(prediction.teamARating)}</dd>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <dt className="text-xs font-semibold text-muted-foreground">{roast ? `${t("predictor.teamB")} · ${t("leaderboard.rating")}` : "Team B average"}</dt>
                  <dd className="tabular text-lg font-bold">{formatCincoRating(prediction.teamBRating)}</dd>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <dt className="text-xs font-semibold text-muted-foreground">{roast ? `${t("predictor.expectedShare")} · ${t("match.teamA")}` : "Expected point share A"}</dt>
                  <dd className="tabular text-lg font-bold">{formatPercent(prediction.pointShareA)}</dd>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <dt className="text-xs font-semibold text-muted-foreground">{roast ? `${t("predictor.expectedShare")} · ${t("match.teamB")}` : "Expected point share B"}</dt>
                  <dd className="tabular text-lg font-bold">{formatPercent(1 - prediction.pointShareA)}</dd>
                </div>
              </dl>
              {anyProvisional && <Badge variant="warning" className="whitespace-normal">{roast ? t("leaderboard.provisional") : "Includes provisional ratings — treat as a rough guess"}</Badge>}

              {verdict && (
                <section aria-label="Thầy bói" className="space-y-2 rounded-xl border border-border bg-accent/30 p-3">
                  <p className="text-xs font-extrabold uppercase tracking-wide" lang="vi">
                    🔮 {t("predictor.title")}
                  </p>
                  <p className="text-sm font-bold" lang="vi">
                    {verdict.even
                      ? t("predictor.even")
                      : `${t("predictor.favored")}: ${verdict.favored === "A" ? teamNames(0, 1) : teamNames(2, 3)}`}
                  </p>
                  <div className="space-y-1.5">
                    <div>
                      {!verdict.even && <p className="text-xs font-semibold">{teamNames(0, 1)}</p>}
                      <RoastText event={verdict.eventA} text={verdict.textA} />
                    </div>
                    {verdict.textB && (
                      <div>
                        <p className="text-xs font-semibold">{teamNames(2, 3)}</p>
                        <RoastText event={verdict.eventB} text={verdict.textB} />
                      </div>
                    )}
                    <RoastText event="balanced_match" text={verdict.balancedLine} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <RoastAgainButton onClick={() => setVariant((v) => v + 1)} />
                    <RoastAgainCaption variant={variant} seed={`${sel.join("|")}|${target}|${winBy}|again`} />
                  </div>
                </section>
              )}
            </>
          )}
          <div className="space-y-2 rounded-xl border border-border p-3 text-sm text-muted-foreground">
            {roast ? (
              <>
                <p lang="vi">{t("predictor.disclaimer")}</p>
                <p lang="vi">{t("predictor.caveat")}</p>
              </>
            ) : (
              <>
                <p>
                  <strong className="text-foreground">Point share is not win probability.</strong> Point share is the share of
                  rallies a team is expected to win. A team that wins 55% of points wins a game far more often than 55%.
                </p>
                <p>
                  Win probability assumes every rally is independent and won with that point share. With Win by 1 it is the chance of
                  reaching the target first; with Win by 2 the winner must also lead by two. It is a simplified model, still
                  uncalibrated against our group&apos;s results, so treat it as a guide, not a prediction.
                </p>
              </>
            )}
          </div>
        </Card>
      </div>
    </MotionConfig>
  );
}
