/**
 * Deterministic phrase selection: no randomness, no network, no AI. The same inputs always give the
 * same line (so a reload is stable and SSR/CSR never disagree); "Chửi Nữa Đi" just bumps `variant`.
 */

/** FNV-1a, 32-bit. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface LineContext {
  /** Score of the team being described and of its opponents, when the line is about a result. */
  scoreFor?: number;
  scoreAgainst?: number;
}

const LITERAL_SCORE = /(\d+)\s*[–-]\s*(\d+)/;
/** Lines that open by claiming a one-point game ("Thắng một điểm…", "Một điểm định đoạt…"). */
const ONE_POINT_OPENER = /^(thắng|thua|một)\s+(một\s+)?điểm\b/i;

/**
 * A few provided lines state a fact about the game (a literal score, "one point"). They stay
 * unchanged, but are only eligible when the fact is true for the result being described.
 */
export function isLineAccurate(line: string, ctx: LineContext = {}): boolean {
  const score = LITERAL_SCORE.exec(line);
  if (score) {
    if (ctx.scoreFor === undefined || ctx.scoreAgainst === undefined) return false;
    if (Number(score[1]) !== ctx.scoreFor || Number(score[2]) !== ctx.scoreAgainst) return false;
  }
  if (ONE_POINT_OPENER.test(line)) {
    if (ctx.scoreFor === undefined || ctx.scoreAgainst === undefined) return false;
    if (Math.abs(ctx.scoreFor - ctx.scoreAgainst) !== 1) return false;
  }
  return true;
}

export function eligibleLines(lines: readonly string[], ctx: LineContext = {}): string[] {
  return lines.filter((l) => isLineAccurate(l, ctx));
}

/**
 * The starting line comes from hash(seed); each `variant` moves to the next line in the pool and wraps,
 * so consecutive clicks never repeat until every eligible line has been shown.
 */
export function pickMessage(lines: readonly string[], seed: string, variant = 0, ctx: LineContext = {}): string | null {
  const pool = eligibleLines(lines, ctx);
  if (pool.length === 0) return null;
  const start = hashString(seed) % pool.length;
  const index = (((start + variant) % pool.length) + pool.length) % pool.length;
  return pool[index];
}

/** Canonical seed for a stored match. */
/** `slot` is a team ("A"/"B") or a callout ("U" for the upset line). */
export const matchSeed = (matchId: string, slot: "A" | "B" | "U") => `${matchId}|${slot}`;

/**
 * Canonical seed for a prediction that has no saved id: both teams (order-independent inside a team),
 * the target, the win-by rule and the team being described.
 */
export function predictionSeed(input: { teamA: readonly string[]; teamB: readonly string[]; target: number; winBy: number; team: "A" | "B" }): string {
  const side = (ids: readonly string[]) => [...ids].sort().join("+");
  return `${side(input.teamA)}|${side(input.teamB)}|${input.target}|${input.winBy}|${input.team}`;
}
