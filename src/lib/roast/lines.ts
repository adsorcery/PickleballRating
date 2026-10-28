import type { EventCatalog, RoastEvent } from "@/i18n/types";
import { formatCincoDeltaPrecise } from "@/lib/format";
import { classifyRating } from "./classify-event";
import { playerRatingEvent, teamRoast, type MatchRoastInput } from "./match-events";
import { matchSeed, pickMessage } from "./pick-message";

export interface RoastedLine {
  event: RoastEvent;
  text: string;
}

export interface RoastMatch extends MatchRoastInput {
  id: string;
  teamA: { id: string; name: string; delta: number | null }[];
  teamB: { id: string; name: string; delta: number | null }[];
}

export interface MatchRoastLines {
  A: RoastedLine | null;
  B: RoastedLine | null;
  upset: RoastedLine | null;
  /** Only when a specific player's perspective is requested (their profile). */
  rating: (RoastedLine & { delta: number }) | null;
}

const LOCALE = "vi-roast";

function line(events: EventCatalog, event: RoastEvent, seed: string, variant: number, ctx = {}): RoastedLine | null {
  const text = pickMessage(events[event], `${seed}|${event}|${LOCALE}`, variant, ctx);
  return text ? { event, text } : null;
}

/**
 * All lines for one stored match. Derived only from the stored scores, the saved pre-match win
 * probability and the stored rating deltas; nothing is recalculated and nothing is persisted.
 * `variant` is the "Chửi Nữa Đi" counter.
 */
export function buildMatchRoast(events: EventCatalog, m: RoastMatch, variant: number, playerId?: string): MatchRoastLines {
  const a = teamRoast(m, "A");
  const b = teamRoast(m, "B");
  const result = (t: typeof a) => (t.result ? line(events, t.result, matchSeed(m.id, t.team), variant, t.ctx) : null);
  const winner = a.won ? a : b;
  const upset = winner.upset ? line(events, "upset_win", matchSeed(m.id, "U"), variant) : null;

  let rating: MatchRoastLines["rating"] = null;
  if (playerId) {
    const slot = [...m.teamA, ...m.teamB].find((p) => p.id === playerId);
    const event = slot ? playerRatingEvent(m, slot.delta) : null;
    const l = event && slot ? line(events, event, `${m.id}|${playerId}`, variant) : null;
    if (l && slot && slot.delta !== null) rating = { ...l, delta: slot.delta };
  }
  return { A: result(a), B: result(b), upset, rating };
}

/** A plain-text card for the clipboard. Scores, names and rating changes are exact; jokes are display only. */
export function buildShareText(m: RoastMatch, lines: MatchRoastLines, whenLabel: string): string {
  const names = (side: RoastMatch["teamA"]) => side.map((p) => p.name).join(" & ");
  const out = [
    "🔥 Viet Cinco",
    `${names(m.teamA)} ${m.scoreA}–${m.scoreB} ${names(m.teamB)}`,
    `${whenLabel} · to ${m.formatTarget}`,
  ];
  if (m.rated) {
    const deltas = [...m.teamA, ...m.teamB].filter((p) => classifyRating(p.delta) !== null);
    if (deltas.length) out.push(deltas.map((p) => `${p.name} ${formatCincoDeltaPrecise(p.delta)}`).join(" · "));
  }
  for (const l of [lines.A, lines.B, lines.upset]) if (l) out.push(`${l.text}`);
  return out.join("\n");
}
