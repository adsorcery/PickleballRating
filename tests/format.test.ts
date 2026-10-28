import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { createUser } from "@/lib/auth/auth";
import { matchPlayers, players, ratingHistory } from "@/lib/db/schema";
import { displaysAsZero, formatCincoDelta, formatCincoRating } from "@/lib/format";
import { getLeaderboard, getPlayerProfile } from "@/lib/queries";
import { DEFAULT_RATING_CONFIG, gameWinProbability, predictMatch, replay } from "@/lib/rating";
import { confirmNewMatch } from "@/lib/services/matches";
import { createPlayer } from "@/lib/services/players";
import { loadReplayInputs } from "@/lib/services/replay-store";
import { memoryDb } from "./helpers/db";

describe("formatCincoRating", () => {
  it.each([
    [3.229473, "3.23"],
    [3.224999, "3.22"],
    [3.225, "3.23"],
    [1.005, "1.01"],
    [3.2, "3.20"],
    [3, "3.00"],
    [4.999, "5.00"],
    [0, "0.00"],
    [6.1049, "6.10"],
    [-1.234, "-1.23"],
    [-0.001, "0.00"],
  ])("%s -> %s", (value, expected) => {
    expect(formatCincoRating(value)).toBe(expected);
  });

  it("handles missing and non-finite values", () => {
    expect(formatCincoRating(null)).toBe("—");
    expect(formatCincoRating(undefined)).toBe("—");
    expect(formatCincoRating(Number.NaN)).toBe("—");
    expect(formatCincoRating(Infinity)).toBe("—");
  });

  it("is presentation-only: the numeric value is untouched", () => {
    const stored = 3.229473;
    expect(formatCincoRating(stored)).toBe("3.23");
    expect(stored).toBe(3.229473);
    expect(stored * 2).toBeCloseTo(6.458946, 12);
  });
});

describe("formatCincoDelta", () => {
  it("shows a sign and exactly 2 decimals, never a signed zero", () => {
    expect(formatCincoDelta(0.034)).toBe("+0.03");
    expect(formatCincoDelta(-0.0451)).toBe("−0.05");
    expect(formatCincoDelta(0.08)).toBe("+0.08");
    expect(formatCincoDelta(0.004)).toBe("0.00");
    expect(formatCincoDelta(-0.004)).toBe("0.00");
    expect(formatCincoDelta(0)).toBe("0.00");
    expect(formatCincoDelta(null)).toBe("—");
    expect(displaysAsZero(0.004)).toBe(true);
    expect(displaysAsZero(0.006)).toBe(false);
  });
});

describe("calculations keep full precision", () => {
  it("predictions use the unrounded ratings, not the displayed ones", () => {
    const raw = predictMatch([3.229473, 3.5, 3.1, 3.4], 11, DEFAULT_RATING_CONFIG);
    const rounded = predictMatch([3.23, 3.5, 3.1, 3.4], 11, DEFAULT_RATING_CONFIG);
    expect(raw.winProbA).not.toBe(rounded.winProbA);
    expect(raw.winProbA).toBe(gameWinProbability(raw.pointShareA, 11));
  });

  describe("stored data", () => {
    let db: Db;
    let ids: string[];

    beforeEach(async () => {
      ({ db } = await memoryDb("UTC"));
      const actor = createUser(db, { email: "a@b.co", passwordHash: "x" });
      ids = [3.1, 3.25, 3.4, 3.65].map((r, i) =>
        createPlayer(db, actor, { displayName: `F${i}`, initialRating: r, duprRating: null, avatarUrl: null, notes: null }),
      );
      for (let i = 0; i < 3; i++) {
        confirmNewMatch(db, actor, {
          teamA: [ids[0], ids[1]], teamB: [ids[2], ids[3]], playedAtLocal: `2026-03-0${i + 1}T10:00`, formatTarget: 11,
          scoreA: 11, scoreB: 3 + i * 2, rated: true, notes: null, idempotencyKey: `format-test-${i}`,
        }, { now: new Date("2026-06-01T00:00:00Z") });
      }
    });

    it("keeps full-precision values in SQLite and displays them at 2 decimals everywhere", () => {
      const rows = db.select().from(players).all();
      expect(rows.some((p) => String(p.currentCincoRating).replace(/^\d+\./, "").length > 2)).toBe(true);

      const board = getLeaderboard(db);
      for (const row of board) {
        const stored = rows.find((p) => p.id === row.id)!.currentCincoRating;
        expect(row.rating).toBe(stored);
        expect(formatCincoRating(row.rating)).toMatch(/^\d\.\d{2}$/);
        const profile = getPlayerProfile(db, row.id)!;
        expect(profile.currentRating).toBe(stored);
        for (const point of profile.history) expect(formatCincoRating(point.rating)).toMatch(/^\d\.\d{2}$/);
      }
    });

    it("stored ratings still equal a fresh full-precision replay (nothing was rounded)", () => {
      const inputs = loadReplayInputs(db);
      const fresh = replay(inputs.players, inputs.matches);
      for (const [id, rating] of fresh.finalRatings) {
        expect(db.select().from(players).where(eq(players.id, id)).get()!.currentCincoRating).toBe(rating);
      }
      for (const r of fresh.results) {
        for (const row of db.select().from(matchPlayers).where(eq(matchPlayers.matchId, r.matchId)).all()) {
          const i = r.playerIds.indexOf(row.playerId);
          expect(row.postRating).toBe(r.post[i]);
          expect(row.deltaRating).toBe(r.delta[i]);
        }
      }
      const history = db.select().from(ratingHistory).all();
      expect(history).toHaveLength(12);
      expect(history.every((h) => h.ratingAfter === h.ratingBefore + h.delta || Math.abs(h.ratingAfter - h.ratingBefore - h.delta) < 1e-12)).toBe(true);
    });
  });
});

describe("no 3-decimal rating displays remain", () => {
  function sources(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? sources(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
    });
  }
  const files = sources(path.resolve(import.meta.dirname, "../src")).filter((f) => !f.endsWith(path.join("lib", "format.ts")));

  it("only the central formatters render ratings", () => {
    for (const f of files) {
      const text = fs.readFileSync(f, "utf8");
      expect(text, f).not.toMatch(/\bformatRating\b|\bformatDelta\b/);
    }
  });

  it("toFixed(3) is only used for the K constants in the preview text", () => {
    const offenders = files.filter((f) => /toFixed\(3\)/.test(fs.readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.basename(f))).toEqual(["match-preview.tsx"]);
    const lines = fs.readFileSync(offenders[0], "utf8").split("\n").filter((l) => l.includes("toFixed(3)"));
    expect(lines.every((l) => /kEff|baseK/.test(l))).toBe(true);
  });
});
