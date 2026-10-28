import { and, asc, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { matches, matchPlayers, players, ratingHistory } from "@/lib/db/schema";
import type { GameTarget, WinBy } from "@/lib/rating/config";
import { classifyChemistry, currentStreak, type Streak } from "@/lib/roast/classify-event";
import { preWinProbFor } from "@/lib/roast/match-events";
import { getActiveConfig } from "@/lib/services/config";

export interface MatchSide {
  id: string;
  name: string;
  delta: number | null;
}

export interface MatchListItem {
  id: string;
  playedAt: number;
  formatTarget: GameTarget;
  winBy: WinBy;
  scoreA: number;
  scoreB: number;
  rated: boolean;
  status: "draft" | "confirmed" | "void";
  teamA: MatchSide[];
  teamB: MatchSide[];
  predictedWinProbA: number | null;
}

export interface LeaderboardRow {
  id: string;
  name: string;
  rating: number;
  initialRating: number;
  games: number;
  ratedGames: number;
  wins: number;
  losses: number;
  provisional: boolean;
  trend7: number | null;
  trend30: number | null;
  /** Current run of consecutive confirmed wins or losses (newest first); display only from 3 up. */
  streak: Streak | null;
}

const DAY = 86_400_000;

function winExpr() {
  return sql<number>`sum(case when (${matchPlayers.team} = 'A' and ${matches.scoreA} > ${matches.scoreB}) or (${matchPlayers.team} = 'B' and ${matches.scoreB} > ${matches.scoreA}) then 1 else 0 end)`;
}

export function getLeaderboard(ex: Executor, now = Date.now()): LeaderboardRow[] {
  const { config } = getActiveConfig(ex, new Date(now));
  const stats = new Map(
    ex
      .select({
        playerId: matchPlayers.playerId,
        games: sql<number>`count(*)`,
        rated: sql<number>`sum(case when ${matches.rated} then 1 else 0 end)`,
        wins: winExpr(),
      })
      .from(matchPlayers)
      .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
      .where(eq(matches.status, "confirmed"))
      .groupBy(matchPlayers.playerId)
      .all()
      .map((r) => [r.playerId, r]),
  );
  const trend = (days: number) =>
    new Map(
      ex
        .select({ playerId: ratingHistory.playerId, delta: sql<number>`sum(${ratingHistory.delta})` })
        .from(ratingHistory)
        .where(gte(ratingHistory.playedAt, new Date(now - days * DAY)))
        .groupBy(ratingHistory.playerId)
        .all()
        .map((r) => [r.playerId, r.delta]),
    );
  const t7 = trend(7);
  const t30 = trend(30);
  const outcomes = new Map<string, boolean[]>();
  for (const r of ex
    .select({ playerId: matchPlayers.playerId, team: matchPlayers.team, a: matches.scoreA, b: matches.scoreB })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(eq(matches.status, "confirmed"))
    .orderBy(desc(matches.playedAt), desc(matches.id))
    .all()) {
    const list = outcomes.get(r.playerId) ?? [];
    list.push(r.team === "A" ? r.a > r.b : r.b > r.a);
    outcomes.set(r.playerId, list);
  }

  return ex
    .select()
    .from(players)
    .where(eq(players.active, true))
    .all()
    .map((p) => {
      const s = stats.get(p.id);
      const games = s?.games ?? 0;
      const wins = s?.wins ?? 0;
      const ratedGames = s?.rated ?? 0;
      return {
        id: p.id,
        name: p.displayName,
        rating: p.currentCincoRating,
        initialRating: p.initialCincoRating,
        games,
        ratedGames,
        wins,
        losses: games - wins,
        provisional: ratedGames < config.provisionalGames,
        trend7: t7.get(p.id) ?? null,
        trend30: t30.get(p.id) ?? null,
        streak: currentStreak(outcomes.get(p.id) ?? []),
      };
    })
    .sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name));
}

function hydrateMatches(ex: Executor, rows: (typeof matches.$inferSelect)[]): MatchListItem[] {
  if (!rows.length) return [];
  const slots = ex
    .select({
      matchId: matchPlayers.matchId,
      playerId: matchPlayers.playerId,
      team: matchPlayers.team,
      position: matchPlayers.position,
      delta: matchPlayers.deltaRating,
      name: players.displayName,
    })
    .from(matchPlayers)
    .innerJoin(players, eq(players.id, matchPlayers.playerId))
    .where(inArray(matchPlayers.matchId, rows.map((r) => r.id)))
    .orderBy(asc(matchPlayers.position))
    .all();
  const byMatch = new Map<string, { A: MatchSide[]; B: MatchSide[] }>();
  for (const s of slots) {
    const entry = byMatch.get(s.matchId) ?? { A: [], B: [] };
    entry[s.team].push({ id: s.playerId, name: s.name, delta: s.delta });
    byMatch.set(s.matchId, entry);
  }
  return rows.map((m) => ({
    id: m.id,
    playedAt: m.playedAt.getTime(),
    formatTarget: m.formatTarget as GameTarget,
    winBy: m.winBy as WinBy,
    scoreA: m.scoreA,
    scoreB: m.scoreB,
    rated: m.rated,
    status: m.status,
    teamA: byMatch.get(m.id)?.A ?? [],
    teamB: byMatch.get(m.id)?.B ?? [],
    predictedWinProbA: m.predictedWinProbA,
  }));
}

export function getRecentMatches(ex: Executor, limit = 8): MatchListItem[] {
  const rows = ex
    .select()
    .from(matches)
    .where(eq(matches.status, "confirmed"))
    .orderBy(desc(matches.playedAt), desc(matches.id))
    .limit(limit)
    .all();
  return hydrateMatches(ex, rows);
}

export interface MatchSearch {
  q?: string;
  playerId?: string;
  format?: number;
  from?: number;
  to?: number;
  page?: number;
  pageSize?: number;
}

export function searchMatches(ex: Executor, s: MatchSearch): { items: MatchListItem[]; total: number; page: number; pageSize: number } {
  const pageSize = Math.min(Math.max(s.pageSize ?? 20, 1), 100);
  const page = Math.max(s.page ?? 1, 1);
  const where: SQL[] = [eq(matches.status, "confirmed")];
  if (s.format) where.push(eq(matches.formatTarget, s.format));
  if (s.from !== undefined) where.push(gte(matches.playedAt, new Date(s.from)));
  if (s.to !== undefined) where.push(lte(matches.playedAt, new Date(s.to)));
  if (s.playerId) where.push(sql`${matches.id} in (select match_id from match_players where player_id = ${s.playerId})`);
  if (s.q?.trim()) {
    const like = `%${s.q.trim().toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    where.push(
      sql`${matches.id} in (select mp.match_id from match_players mp join players p on p.id = mp.player_id where lower(p.display_name) like ${like} escape '\\')`,
    );
  }
  const cond = and(...where);
  const total = ex.select({ n: sql<number>`count(*)` }).from(matches).where(cond).get()?.n ?? 0;
  const rows = ex
    .select()
    .from(matches)
    .where(cond)
    .orderBy(desc(matches.playedAt), desc(matches.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();
  return { items: hydrateMatches(ex, rows), total, page, pageSize };
}

export interface SelectablePlayer {
  id: string;
  name: string;
  rating: number;
  provisional: boolean;
}

export function listSelectablePlayers(ex: Executor): SelectablePlayer[] {
  const lb = getLeaderboard(ex);
  return lb.map((p) => ({ id: p.id, name: p.name, rating: p.rating, provisional: p.provisional })).sort((a, b) => a.name.localeCompare(b.name));
}

export interface PlayerDirectoryRow {
  id: string;
  name: string;
  rating: number;
  active: boolean;
  provisional: boolean;
  games: number;
}

export function listPlayerDirectory(ex: Executor): PlayerDirectoryRow[] {
  const lb = new Map(getLeaderboard(ex).map((p) => [p.id, p]));
  const { config } = getActiveConfig(ex);
  const counts = new Map(
    ex
      .select({ id: matchPlayers.playerId, n: sql<number>`count(*)` })
      .from(matchPlayers)
      .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
      .where(and(eq(matches.status, "confirmed"), eq(matches.rated, true)))
      .groupBy(matchPlayers.playerId)
      .all()
      .map((r) => [r.id, r.n]),
  );
  return ex
    .select()
    .from(players)
    .all()
    .map((p) => {
      const n = counts.get(p.id) ?? 0;
      return {
        id: p.id,
        name: p.displayName,
        rating: lb.get(p.id)?.rating ?? p.currentCincoRating,
        active: p.active,
        provisional: n < config.provisionalGames,
        games: n,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface PartnerStat {
  id: string;
  name: string;
  games: number;
  wins: number;
  /** Shared games that have a saved pre-match probability, with the wins that probability expected. */
  adjustedGames: number;
  adjustedWins: number;
  expectedWins: number;
  chemistry: "partner_chemistry_good" | "partner_chemistry_bad" | null;
}

export interface PlayerProfile {
  id: string;
  name: string;
  active: boolean;
  initialRating: number;
  currentRating: number;
  duprRating: number | null;
  avatarUrl: string | null;
  games: number;
  ratedGames: number;
  wins: number;
  losses: number;
  provisional: boolean;
  provisionalGames: number;
  streak: Streak | null;
  history: { playedAt: number; rating: number; matchId: string | null }[];
  recent: (MatchListItem & { myTeam: "A" | "B"; delta: number | null })[];
  partners: PartnerStat[];
  distinctOpponents: number | null;
  possibleOpponents: number;
  rank: number | null;
}

const MIN_GAMES_FOR_DIVERSITY = 5;

export function getPlayerProfile(ex: Executor, id: string): PlayerProfile | null {
  const p = ex.select().from(players).where(eq(players.id, id)).get();
  if (!p) return null;
  const { config } = getActiveConfig(ex);

  const mine = ex
    .select({ match: matches, team: matchPlayers.team, delta: matchPlayers.deltaRating })
    .from(matchPlayers)
    .innerJoin(matches, eq(matches.id, matchPlayers.matchId))
    .where(and(eq(matchPlayers.playerId, id), eq(matches.status, "confirmed")))
    .orderBy(desc(matches.playedAt), desc(matches.id))
    .all();

  const won = (m: (typeof mine)[number]) => (m.team === "A" ? m.match.scoreA > m.match.scoreB : m.match.scoreB > m.match.scoreA);
  const wins = mine.filter(won).length;
  const ratedGames = mine.filter((m) => m.match.rated).length;

  const history = ex
    .select()
    .from(ratingHistory)
    .where(eq(ratingHistory.playerId, id))
    .orderBy(asc(ratingHistory.playedAt), asc(ratingHistory.id))
    .all();
  // Back-filled games can predate the player record, so anchor the opening rating before the first game.
  const openingAt = history.length ? Math.min(p.createdAt.getTime(), history[0].playedAt.getTime() - 3_600_000) : p.createdAt.getTime();
  const chart = [
    { playedAt: openingAt, rating: p.initialCincoRating, matchId: null as string | null },
    ...history.map((h) => ({ playedAt: h.playedAt.getTime(), rating: h.ratingAfter, matchId: h.matchId as string | null })),
  ];

  const recentRows = mine.slice(0, 10);
  const recentItems = hydrateMatches(ex, recentRows.map((r) => r.match));
  const recent = recentItems.map((item, i) => ({ ...item, myTeam: recentRows[i].team, delta: recentRows[i].delta }));

  const matchIds = mine.map((m) => m.match.id);
  const partners = new Map<string, PartnerStat>();
  const opponents = new Set<string>();
  if (matchIds.length) {
    const others = ex
      .select({ matchId: matchPlayers.matchId, playerId: matchPlayers.playerId, team: matchPlayers.team, name: players.displayName })
      .from(matchPlayers)
      .innerJoin(players, eq(players.id, matchPlayers.playerId))
      .where(inArray(matchPlayers.matchId, matchIds))
      .all();
    const myMatch = new Map(mine.map((m) => [m.match.id, m]));
    for (const o of others) {
      if (o.playerId === id) continue;
      const m = myMatch.get(o.matchId)!;
      if (o.team === m.team) {
        const s = partners.get(o.playerId) ?? { id: o.playerId, name: o.name, games: 0, wins: 0, adjustedGames: 0, adjustedWins: 0, expectedWins: 0, chemistry: null };
        s.games++;
        const didWin = won(m);
        if (didWin) s.wins++;
        const pre = preWinProbFor(m.team, m.match.predictedWinProbA);
        if (pre !== null) {
          s.adjustedGames++;
          s.expectedWins += pre;
          if (didWin) s.adjustedWins++;
        }
        partners.set(o.playerId, s);
      } else {
        opponents.add(o.playerId);
      }
    }
  }

  const possibleOpponents = ex.select({ n: sql<number>`count(*)` }).from(players).where(eq(players.active, true)).get()!.n - 1;
  const board = getLeaderboard(ex);
  const rankIndex = board.findIndex((r) => r.id === id);

  return {
    id: p.id,
    name: p.displayName,
    active: p.active,
    initialRating: p.initialCincoRating,
    currentRating: p.currentCincoRating,
    duprRating: p.duprRating,
    avatarUrl: p.avatarUrl,
    games: mine.length,
    ratedGames,
    wins,
    losses: mine.length - wins,
    provisional: ratedGames < config.provisionalGames,
    provisionalGames: config.provisionalGames,
    history: chart,
    recent,
    streak: currentStreak(mine.map(won)),
    partners: [...partners.values()]
      .map((s) => ({ ...s, chemistry: classifyChemistry({ games: s.adjustedGames, wins: s.adjustedWins, expectedWins: s.expectedWins }) }))
      .sort((a, b) => b.games - a.games || a.name.localeCompare(b.name)).slice(0, 5),
    distinctOpponents: mine.length >= MIN_GAMES_FOR_DIVERSITY ? opponents.size : null,
    possibleOpponents: Math.max(possibleOpponents, 0),
    rank: p.active && rankIndex >= 0 ? rankIndex + 1 : null,
  };
}

export interface AdminOverview {
  playerCount: number;
  activeCount: number;
  confirmedMatches: number;
  drafts: MatchListItem[];
  recent: MatchListItem[];
  outOfRange: { id: string; name: string; rating: number }[];
}

export function getAdminOverview(ex: Executor): AdminOverview {
  const all = ex.select().from(players).all();
  const confirmed = ex.select({ n: sql<number>`count(*)` }).from(matches).where(eq(matches.status, "confirmed")).get()!.n;
  const drafts = hydrateMatches(ex, ex.select().from(matches).where(eq(matches.status, "draft")).orderBy(desc(matches.updatedAt)).all());
  const recent = hydrateMatches(
    ex,
    ex
      .select()
      .from(matches)
      .where(inArray(matches.status, ["confirmed", "void"]))
      .orderBy(desc(matches.playedAt), desc(matches.id))
      .limit(15)
      .all(),
  );
  return {
    playerCount: all.length,
    activeCount: all.filter((p) => p.active).length,
    confirmedMatches: confirmed,
    drafts,
    recent,
    outOfRange: all
      .filter((p) => p.currentCincoRating < 2 || p.currentCincoRating > 6)
      .map((p) => ({ id: p.id, name: p.displayName, rating: p.currentCincoRating })),
  };
}

export function getMatchForEdit(ex: Executor, id: string) {
  const row = ex.select().from(matches).where(eq(matches.id, id)).get();
  if (!row) return null;
  const item = hydrateMatches(ex, [row])[0];
  return { row, item };
}
