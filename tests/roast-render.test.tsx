import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import events from "@/i18n/vi-roast.events.json";
import ui from "@/i18n/vi-roast.ui.json";
import { viExtra } from "@/i18n/vi-roast.extra";
import { LocaleContext, type LocaleContextValue } from "@/i18n/use-locale";
import type { RoastCatalog } from "@/i18n/types";
import { LeaderboardView } from "@/components/public/leaderboard-view";
import { MatchCardView } from "@/components/public/match-card-view";
import { PlayerProfileView } from "@/components/public/player-profile-view";
import { Predictor } from "@/components/public/predictor";
import { LocaleSwitcher } from "@/components/locale-switcher";
import type { LeaderboardRow, MatchListItem, PlayerProfile } from "@/lib/queries";

const catalog: RoastCatalog = { ui: { ...viExtra, ...(ui as Record<string, string>) }, events: events as RoastCatalog["events"] };
const en: LocaleContextValue = { mode: "en", catalog: null, requestRoast: () => {}, resetToEnglish: () => {} };
const roast: LocaleContextValue = { mode: "vi-roast", catalog, requestRoast: () => {}, resetToEnglish: () => {} };
const render = (ctx: LocaleContextValue, node: React.ReactElement) => renderToStaticMarkup(h(LocaleContext.Provider, { value: ctx }, node));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");

const RAW_KEY = /\b(nav|leaderboard|predictor|match|player|stats|common|app)\.[a-zA-Z0-9]+\b/;
const VIETNAMESE = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;

const match = (over: Partial<MatchListItem> = {}): MatchListItem => ({
  id: "m-legacy",
  playedAt: Date.UTC(2026, 2, 1, 18, 0),
  formatTarget: 11,
  winBy: 2,
  scoreA: 12,
  scoreB: 10,
  rated: true,
  status: "confirmed",
  predictedWinProbA: 0.62,
  teamA: [{ id: "p1", name: "Nguyễn An", delta: 0.034 }, { id: "p2", name: "Bảo", delta: 0.045 }],
  teamB: [{ id: "p3", name: "Cường", delta: -0.034 }, { id: "p4", name: "Dũng", delta: -0.045 }],
  ...over,
});

const row = (over: Partial<LeaderboardRow> = {}): LeaderboardRow => ({
  id: "p1", name: "Nguyễn An", rating: 3.229473, initialRating: 3, games: 20, ratedGames: 20, wins: 12, losses: 8,
  provisional: false, trend7: 0.0123, trend30: -0.07, streak: { type: "win", length: 4 }, ...over,
});

describe("English mode is unchanged and carries no funny content", () => {
  it("renders the existing English labels, 2-decimal ratings, and nothing Vietnamese-roast", () => {
    const html = render(en, h(LeaderboardView, { rows: [row()], recent: [{ match: match(), whenLabel: "Mar 1, 2026" }] }));
    const t = text(html);
    expect(t).toContain("Viet Cinco Leaderboard");
    expect(t).toContain("Rankings");
    expect(t).toContain("W–L");
    expect(t).toContain("3.23");
    expect(t).not.toContain("3.229");
    expect(t).toContain("To 11 · Win by 2");
    expect(t).not.toContain("Chửi Nữa Đi");
    expect(html).not.toMatch(/lang="vi"/);
    expect(t).not.toMatch(/Bảng Phong|Mõm|Gáy|ăn hành|Hàng Mới/i);
  });

  it("shows no 'Chửi Nữa Đi', copy or roast controls on a match card", () => {
    const t = text(render(en, h(MatchCardView, { match: match(), whenLabel: "Mar 1" })));
    expect(t).not.toMatch(/Chửi|Chép|Mất Nết/);
    expect(t).toContain("12");
    expect(t).toContain("+0.03");
  });

  it("the switcher offers EN and the 18+ mode, with English pressed by default", () => {
    const html = render(en, h(LocaleSwitcher));
    expect(html).toContain('aria-label="English"');
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="English"|aria-label="English"[^>]*aria-pressed="true"/);
    expect(html).toContain("18+");
  });
});

describe("funny mode", () => {
  it("translates labels, keeps ratings at 2 decimals and never shows raw keys", () => {
    const html = render(roast, h(LeaderboardView, { rows: [row(), row({ id: "p2", name: "Bảo", provisional: true, streak: null })], recent: [{ match: match(), whenLabel: "Mar 1, 2026" }] }));
    const t = text(html);
    expect(t).toContain(ui["leaderboard.title"]);
    expect(t).toContain(ui["leaderboard.provisional"]);
    expect(t).toContain("3.23");
    expect(t).not.toMatch(/\b\d\.\d{3,}\b/);
    expect(t).not.toMatch(RAW_KEY);
    expect(t).toContain("Nguyễn An");
    expect(t).toContain(ui["common.roastAgain"]);
    expect(html).toContain('lang="vi"');
  });

  it("describes a historical win-by-2 match from its stored scores and keeps its rule", () => {
    const t = text(render(roast, h(MatchCardView, { match: match(), whenLabel: "Mar 1, 2026" })));
    expect(t).toContain(ui["predictor.winByTwo"]);
    expect(t).not.toContain(ui["predictor.winByOne"]);
    expect(t).toContain("12");
    expect(t).toContain("10");
    expect(t).toContain("+0.03"); // 0.034, two decimals
    expect(t).toContain("−0.05"); // -0.045 rounds half away from zero
    expect(t).toMatch(VIETNAMESE);
    expect(t).not.toMatch(RAW_KEY);
    for (const name of ["Nguyễn An", "Bảo", "Cường", "Dũng"]) expect(t).toContain(name);
  });

  it("renders the same stable lines on every render (SSR/CSR agree)", () => {
    const a = render(roast, h(MatchCardView, { match: match(), whenLabel: "x" }));
    const b = render(roast, h(MatchCardView, { match: match(), whenLabel: "x" }));
    expect(a).toBe(b);
  });

  it("an 11-10 win-by-1 result and a legacy 12-10 win-by-2 result are both described", () => {
    for (const m of [match({ id: "n1", winBy: 1, scoreA: 11, scoreB: 10 }), match({ id: "n2", winBy: 2, scoreA: 12, scoreB: 10 })]) {
      const t = text(render(roast, h(MatchCardView, { match: m, whenLabel: "x" })));
      expect(t).toMatch(VIETNAMESE);
      expect(t).not.toMatch(RAW_KEY);
    }
  });

  it("an upset is only called from a saved probability", () => {
    const withProb = text(render(roast, h(MatchCardView, { match: match({ predictedWinProbA: 0.1, id: "u1" }), whenLabel: "x" })));
    const without = text(render(roast, h(MatchCardView, { match: match({ predictedWinProbA: null, id: "u1" }), whenLabel: "x" })));
    const upsetLines: string[] = events.upset_win;
    expect(upsetLines.some((l) => withProb.includes(l))).toBe(true);
    expect(upsetLines.some((l) => without.includes(l))).toBe(false);
  });

  it("the profile keeps the official name and shows streak, status and rating lines at 2 decimals", () => {
    const profile: Omit<PlayerProfile, "recent"> = {
      id: "p1", name: "Nguyễn An", active: true, initialRating: 3, currentRating: 3.229473, duprRating: 3.4567, avatarUrl: null,
      games: 20, ratedGames: 20, wins: 12, losses: 8, provisional: false, provisionalGames: 15,
      streak: { type: "win", length: 4 }, history: [{ playedAt: 1, rating: 3, matchId: null }], partners: [
        { id: "p2", name: "Bảo", games: 9, wins: 8, adjustedGames: 9, adjustedWins: 8, expectedWins: 4.5, chemistry: "partner_chemistry_good" },
      ], distinctOpponents: 5, possibleOpponents: 7, rank: 2,
    };
    const html = render(roast, h(PlayerProfileView, { profile, recent: [{ match: match(), whenLabel: "x" }], timezone: "UTC" }));
    const t = text(html);
    expect(html).toContain("<h1");
    expect(t).toContain("Nguyễn An");
    expect(t).toContain("3.23");
    expect(t).toContain("3.00");
    expect(t).not.toMatch(/\b\d\.\d{3,}\b/);
    expect(t).not.toMatch(RAW_KEY);
    expect(events.win_streak.some((l) => t.includes(l))).toBe(true);
    expect(events.partner_chemistry_good.some((l) => t.includes(l))).toBe(true);
    expect(t).toContain("3.46"); // DUPR keeps its own 2-decimal format
  });

  it("a brand-new player gets a new-player line, never a streak", () => {
    const profile: Omit<PlayerProfile, "recent"> = {
      id: "p9", name: "Mới Toanh", active: true, initialRating: 3.5, currentRating: 3.5, duprRating: null, avatarUrl: null,
      games: 0, ratedGames: 0, wins: 0, losses: 0, provisional: true, provisionalGames: 15,
      streak: null, history: [{ playedAt: 1, rating: 3.5, matchId: null }], partners: [], distinctOpponents: null, possibleOpponents: 7, rank: 8,
    };
    const t = text(render(roast, h(PlayerProfileView, { profile, recent: [], timezone: "UTC" })));
    expect(events.new_player.some((l) => t.includes(l))).toBe(true);
    expect(events.no_matches.some((l) => t.includes(l))).toBe(true);
    for (const l of [...events.win_streak, ...events.loss_streak]) expect(t).not.toContain(l);
  });

  it("the predictor panel is empty until four players are chosen, then explains the caveat in Vietnamese", () => {
    const players = [1, 2, 3, 4].map((i) => ({ id: `p${i}`, name: `P${i}`, rating: 3 + i / 10, provisional: i === 1 }));
    const t = text(render(roast, h(Predictor, { players, beta: 2.6 })));
    expect(t).toContain(ui["predictor.teamA"]);
    expect(t).toContain(ui["predictor.winByOne"]);
    expect(t).toContain(viExtra["predictor.caveat"]);
    expect(t).toContain(ui["predictor.disclaimer"]);
    expect(t).not.toMatch(RAW_KEY);
    expect(t).not.toContain("Point share is not win probability");
    // The English version keeps its original explanation.
    const e = text(render(en, h(Predictor, { players, beta: 2.6 })));
    expect(e).toContain("Point share is not win probability");
    expect(e).toContain("Team A");
  });
});
