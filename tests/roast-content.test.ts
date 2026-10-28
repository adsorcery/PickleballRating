import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import events from "@/i18n/vi-roast.events.json";
import ui from "@/i18n/vi-roast.ui.json";
import { en } from "@/i18n/en";
import { enExtra, viExtra } from "@/i18n/vi-roast.extra";
import { translate, translatePlain } from "@/i18n/t";
import { ROAST_EVENTS, type RoastCatalog, type TranslationKey } from "@/i18n/types";
import { EVENT_EMOJI } from "@/lib/roast/classify-event";
import { eligibleLines } from "@/lib/roast/pick-message";

const catalog: RoastCatalog = { ui: { ...viExtra, ...(ui as Record<string, string>) }, events: events as RoastCatalog["events"] };

describe("provided content libraries", () => {
  it("has the advertised sizes", () => {
    expect(Object.keys(ui)).toHaveLength(107);
    expect(Object.keys(events)).toHaveLength(27);
    const all = Object.values(events).flat();
    expect(all).toHaveLength(255);
    expect(new Set(all).size).toBe(255);
  });

  it("covers all 27 event categories from the specification with at least one line each", () => {
    expect(Object.keys(events).sort()).toEqual([...ROAST_EVENTS].sort());
    for (const [bucket, lines] of Object.entries(events)) {
      expect(lines.length, bucket).toBeGreaterThanOrEqual(1);
      expect(lines.every((l) => typeof l === "string" && l.trim().length > 0), bucket).toBe(true);
    }
    for (const e of ROAST_EVENTS) expect(EVENT_EMOJI[e], e).toBeTruthy();
  });

  it("every UI string is real text: no raw keys, placeholders or empties", () => {
    for (const [key, value] of Object.entries(ui)) {
      expect(typeof value, key).toBe("string");
      expect(value.trim().length, key).toBeGreaterThan(0);
      expect(value, key).not.toMatch(/^[a-z]+\.[A-Za-z]+$/);
      expect(value, key).not.toMatch(/\{\{|\}\}|\{[a-z]+\}|%s|undefined|null/);
    }
  });

  it("the English catalog covers every provided key and every extra key", () => {
    for (const key of Object.keys(ui)) expect(en[key as TranslationKey], key).toBeTruthy();
    for (const key of Object.keys(viExtra)) expect(enExtra[key as keyof typeof enExtra], key).toBeTruthy();
  });

  it("contains the acknowledgement and way-back strings the spec quotes", () => {
    expect(ui["common.optIn"]).toContain("Tôi trên 18 tuổi và muốn bật chế độ cà khịa");
    expect(ui["common.reset"]).toBe("Trở Về Người Tử Tế");
    expect(ui["common.roastAgain"]).toBe("Chửi Nữa Đi");
    expect(ui["common.funny"]).toContain("Mất Nết 18+");
  });

  it("keeps Vietnamese diacritics intact (NFC, no mojibake)", () => {
    for (const s of [...Object.values(ui), ...Object.values(events).flat()]) {
      expect(s).toBe(s.normalize("NFC"));
      expect(s).not.toMatch(/\uFFFD|Ã|á»|Æ°/);
    }
  });

  it("every bucket still has usable lines for every score situation (accuracy guards leave a pool)", () => {
    const cases: [keyof typeof events, number, number][] = [
      ["bagel_winner", 15, 0], ["bagel_winner", 21, 0], ["bagel_loser", 0, 21], ["bagel_loser", 0, 15],
      ["close_win", 12, 10], ["close_win", 11, 9], ["close_win", 22, 20], ["close_loss", 10, 12], ["close_loss", 9, 11],
      ["blowout_win", 21, 4], ["blowout_loss", 4, 21], ["expected_win", 11, 7],
    ];
    for (const [bucket, a, b] of cases) {
      expect(eligibleLines(events[bucket], { scoreFor: a, scoreAgainst: b }).length, `${bucket} ${a}-${b}`).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("translate() fallback", () => {
  it("returns English in English mode and before the catalog has loaded", () => {
    expect(translate("en", catalog, "nav.leaderboard")).toBe("Leaderboard");
    expect(translate("vi-roast", null, "nav.leaderboard")).toBe("Leaderboard");
  });

  it("returns the Vietnamese text in funny mode", () => {
    expect(translate("vi-roast", catalog, "nav.leaderboard")).toBe(ui["nav.leaderboard"]);
  });

  it("falls back to English for a missing, empty or non-string value, and never returns a raw key", () => {
    const partial: RoastCatalog = { ui: { "nav.leaderboard": "", "nav.players": undefined } as never, events: catalog.events };
    expect(translate("vi-roast", partial, "nav.leaderboard")).toBe("Leaderboard");
    expect(translate("vi-roast", partial, "nav.players")).toBe("Players");
    expect(translate("vi-roast", partial, "nav.admin")).toBe("Admin");
    for (const key of Object.keys(en) as TranslationKey[]) {
      const out = translate("vi-roast", { ui: {}, events: catalog.events }, key);
      expect(out).toBe(en[key]);
      expect(out).not.toBe(key);
    }
    expect(translate("vi-roast", catalog, "totally.unknown" as TranslationKey)).toBe("");
  });

  it("supports an English override so one key can serve differently worded English labels", () => {
    expect(translate("en", catalog, "nav.admin", "Overview")).toBe("Overview");
    expect(translate("vi-roast", catalog, "nav.admin", "Overview")).toBe(ui["nav.admin"]);
  });

  it("adds the plain English companion for admin actions", () => {
    expect(translatePlain("vi-roast", catalog, "match.void", "Void match")).toBe(`${ui["match.void"]} (Void match)`);
    expect(translatePlain("en", catalog, "match.void", "Void match")).toBe("Void match");
  });
});

describe("guardrails on the provided jokes", () => {
  // Whole-word matching with Unicode letter boundaries, so "ngay" (right away) does not trip "gay".
  const words = (...list: string[]) => new RegExp(`(?<![\\p{L}])(?:${list.join("|")})(?![\\p{L}])`, "iu");
  const banned = [
    words("người (bắc|nam|trung|tàu|mỹ|hàn|nhật|ấn|thái)", "da đen", "da trắng"),
    words("gay", "les", "bê đê", "đồng tính", "chuyển giới"),
    words("phật giáo", "thiên chúa", "hồi giáo", "công giáo", "nhà thờ", "chùa"),
    words("khuyết tật", "tàn tật", "câm", "điếc", "mù", "què", "tự kỷ", "thần kinh", "khùng", "điên"),
    words("béo", "mập", "gầy", "lùn", "xấu xí", "già", "tuổi già"),
    words("giết", "tự tử", "chết mày", "đánh chết", "dọa"),
    words("mẹ mày", "con mẹ", "đm", "dm", "địt", "lồn", "cặc"),
  ];
  it("contains no protected-trait, threat or heavy-profanity language", () => {
    for (const s of [...Object.values(ui), ...Object.values(events).flat()]) {
      for (const re of banned) expect(s, `${re}`).not.toMatch(re);
    }
  });

  it("does not ship the jokes in any module the English bundle statically imports", () => {
    const root = path.resolve(import.meta.dirname, "../src");
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) {
          const text = fs.readFileSync(p, "utf8");
          if (/from\s+["'][^"']*vi-roast\.(events|ui)\.json["']/.test(text)) importers.push(path.relative(root, p));
          if (/import\(["'][^"']*vi-roast\.(events|ui)\.json["']\)/.test(text)) importers.push(`${path.relative(root, p)} (dynamic)`);
        }
      }
    };
    walk(root);
    // Only the lazy loader may reference the JSON at runtime (type-only imports are erased).
    const runtime = importers.filter((f) => !f.endsWith("types.ts"));
    expect(runtime).toEqual(["i18n/catalog.ts (dynamic)"]);
  });
});
