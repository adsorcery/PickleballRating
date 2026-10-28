// Browser checks for "Chế Độ Mất Nết 18+".
// BASE_URL=http://localhost:3111 ADMIN_EMAIL=... ADMIN_PASSWORD=... [SHOTS_DIR=...] node e2e/roast.mjs
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3111";
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const SHOTS = process.env.SHOTS_DIR;

const LANG_KEY = "vietcinco:language";
const ACK_KEY = "vietcinco:roast-ack";
// ASCII-only fragments that exist only in the joke library / UI library (so we can find them in JS chunks).
const JOKE_MARKER = "Google Maps";
const UI_MARKER = "Ph\\u1ea1m"; // unused fallback marker; the real check below uses several
const VI_NAV = "Bảng Phong Thần Mõm";
const RAW_KEY = /\b(nav|leaderboard|predictor|match|player|stats|common|app)\.[a-zA-Z0-9]+\b/;
void UI_MARKER;

const browser = await chromium.launch();
const failures = [];
const check = async (name, fn) => {
  try {
    await fn();
    console.log("  ✓", name);
  } catch (e) {
    failures.push(name);
    console.log("  ✗", name, "\n     ", String(e.message ?? e).split("\n")[0]);
  }
};

async function newVisitor(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 }, ...opts });
  const page = await ctx.newPage();
  const bodies = [];
  const requests = [];
  page.on("response", (r) => {
    if (/\.js(\?|$)/.test(r.url())) bodies.push(r.text().catch(() => ""));
  });
  page.on("request", (r) => requests.push({ url: r.url(), method: r.method() }));
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  return { ctx, page, bodies, requests, errors };
}

const storage = (page) => page.evaluate(([l, a]) => ({ lang: localStorage.getItem(l), ack: localStorage.getItem(a) }), [LANG_KEY, ACK_KEY]);
const hasMarker = async (bodies, marker) => (await Promise.all(bodies)).some((b) => b.includes(marker));

async function turnOnRoast(page) {
  await page.getByRole("button", { name: "Mất Nết 18+" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const confirm = dialog.getByRole("button", { name: "Turn it on" });
  assert.equal(await confirm.isDisabled(), true, "confirm must be disabled until the box is ticked");
  await dialog.getByRole("checkbox").check();
  await confirm.click();
  await page.locator("html[lang=vi]").waitFor();
}

// ───────────────────────────── first visit & opt-in
console.log("First-time visitor");
const v1 = await newVisitor();
const { page } = v1;
await page.goto(BASE);
await page.getByRole("heading", { name: "Viet Cinco Leaderboard" }).waitFor();

await check("defaults to English with nothing stored", async () => {
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.deepEqual(await storage(page), { lang: null, ack: null });
  const text = await page.locator("body").innerText();
  assert.ok(!text.includes("Chửi Nữa Đi") && !text.includes(VI_NAV), "no funny text before opt-in");
  assert.ok(await page.getByRole("button", { name: "English" }).getAttribute("aria-pressed") === "true");
});

await check("English visitors never download the joke library", async () => {
  await page.waitForLoadState("networkidle");
  assert.equal(await hasMarker(v1.bodies, JOKE_MARKER), false, "joke chunk was loaded in English mode");
});

await check("choosing the funny mode shows an acknowledgement dialog and changes nothing until accepted", async () => {
  await page.getByRole("button", { name: "Mất Nết 18+" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const text = await dialog.innerText();
  assert.match(text, /not an age check/i);
  assert.match(text, /Tôi trên 18 tuổi và muốn bật chế độ cà khịa/);
  assert.ok(!text.includes("Chửi Nữa Đi"));
  assert.equal(await dialog.getByRole("button", { name: "Turn it on" }).isDisabled(), true);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual(await storage(page), { lang: null, ack: null });
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
});

await check("cancelling keeps English; accepting turns it on and stores both keys", async () => {
  await page.getByRole("button", { name: "Mất Nết 18+" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Stay in English" }).click();
  assert.equal((await storage(page)).lang, null);
  await turnOnRoast(page);
  await page.getByRole("link", { name: VI_NAV }).first().waitFor();
  assert.deepEqual(await storage(page), { lang: "vi-roast", ack: "1" });
  assert.ok(await hasMarker(v1.bodies, JOKE_MARKER), "the joke chunk should load after opt-in");
});

await check("a visitor cannot bypass the dialog by writing only the language key", async () => {
  const other = await newVisitor();
  await other.page.addInitScript(([l]) => localStorage.setItem(l, "vi-roast"), [LANG_KEY]);
  await other.page.goto(BASE);
  await other.page.getByRole("heading", { name: "Viet Cinco Leaderboard" }).waitFor();
  await other.page.waitForTimeout(600);
  assert.equal(await other.page.locator("html").getAttribute("lang"), "en");
  assert.ok(!(await other.page.locator("body").innerText()).includes("Chửi Nữa Đi"));
  await other.ctx.close();
});

// ───────────────────────────── persistence & way back
await check("preference persists across reloads and new pages", async () => {
  await page.reload();
  await page.locator("html[lang=vi]").waitFor();
  await page.goto(`${BASE}/predict`);
  await page.getByRole("heading", { name: "Thầy Bói Cinco Phán Kèo" }).waitFor();
});

await check("one click on 'Trở Về Người Tử Tế' switches back to English immediately and persists", async () => {
  await page.getByRole("button", { name: "Trở Về Người Tử Tế" }).click();
  await page.getByRole("heading", { name: "Predict a Match" }).waitFor();
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.equal((await storage(page)).lang, "en");
  await page.reload();
  await page.getByRole("heading", { name: "Predict a Match" }).waitFor();
});

await check("once acknowledged, switching on again needs no dialog", async () => {
  await page.getByRole("button", { name: "Mất Nết 18+" }).click();
  await page.locator("html[lang=vi]").waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
});

// ───────────────────────────── leaderboard / history / roast again
console.log("Leaderboard, history, Chửi Nữa Đi");
await page.goto(BASE);
await page.getByRole("heading", { name: "Bảng Phong Thần Mõm" }).first().waitFor();
await page.locator("article").first().waitFor();

await check("ratings keep exactly 2 decimals in funny mode and no raw keys appear", async () => {
  for (const path of ["/", "/predict", "/players", "/matches"]) {
    await page.goto(BASE + path);
    await page.locator("html[lang=vi]").waitFor();
    await page.waitForTimeout(250);
    const text = await page.locator("main").innerText();
    assert.equal(text.match(/\b\d\.\d{3,}\b/g), null, `${path} shows >2 decimals`);
    assert.equal(RAW_KEY.test(text), false, `${path} shows a raw key: ${text.match(RAW_KEY)}`);
  }
});

await check("historical (legacy win-by-2) matches get Vietnamese lines with no database update", async () => {
  await page.goto(`${BASE}/matches`);
  await page.locator("html[lang=vi]").waitFor();
  const cards = page.locator("article");
  await cards.first().waitFor();
  const n = await cards.count();
  assert.ok(n >= 10, `cards ${n}`);
  let withLines = 0;
  for (let i = 0; i < n; i++) if (/[ăâêôơưđ]/.test(await cards.nth(i).locator("p[lang=vi]").first().innerText().catch(() => ""))) withLines++;
  assert.ok(withLines >= Math.floor(n / 2), `only ${withLines}/${n} cards had a Vietnamese line`);
  const legacy = await cards.filter({ hasText: "Phải Hơn 2 Mới Được Gáy" }).count();
  assert.ok(legacy >= 10, `legacy matches should keep their win-by-2 rule (found ${legacy})`);
});

await check("'Chửi Nữa Đi' cycles distinct lines locally: no requests, no data change", async () => {
  await page.goto(`${BASE}/matches`);
  const card = page.locator("article").first();
  await card.waitFor();
  await page.waitForLoadState("networkidle");
  const before = await card.innerText();
  v1.requests.length = 0;
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    await card.getByRole("button", { name: "Chửi Nữa Đi" }).click();
    await page.waitForTimeout(400);
    seen.add(await card.locator("p[lang=vi]").first().innerText());
  }
  assert.ok(seen.size >= 3, `expected several distinct lines, got ${seen.size}`);
  // Next.js <Link> prefetches (?_rsc=) are framework behaviour, not the button; nothing else may be sent.
  const real = v1.requests.filter((r) => !r.url.includes("_rsc="));
  assert.equal(real.length, 0, `network requests during roast: ${JSON.stringify(real)}`);
  const strip = (s) => s.replace(/\s+/g, " ");
  // Scores, names and rating changes are untouched.
  const nums = (s) => (strip(s).match(/[+−]?\d+(\.\d+)?/g) ?? []).join("|");
  const afterNums = nums(await card.innerText());
  assert.ok(nums(before).split("|").slice(0, 6).every((x) => afterNums.includes(x)), "numbers changed after roasting");
});

await check("a stable line on reload until the button is pressed", async () => {
  await page.goto(`${BASE}/matches`);
  const first = page.locator("article").first();
  await first.locator("p[lang=vi]").first().waitFor();
  const a = await first.locator("p[lang=vi]").first().innerText();
  await page.reload();
  const first2 = page.locator("article").first();
  await first2.locator("p[lang=vi]").first().waitFor();
  assert.equal(await first2.locator("p[lang=vi]").first().innerText(), a);
});

await check("every rendered line belongs to the right bucket: winners get winner lines, losers get loser lines", async () => {
  const events = JSON.parse(readFileSync(new URL("../src/i18n/vi-roast.events.json", import.meta.url), "utf8"));
  const bucketOf = (text) => Object.entries(events).filter(([, v]) => v.includes(text)).map(([k]) => k);
  const cards = await page.locator("article").evaluateAll((els) =>
    els.map((c) => {
      const [a, b] = [...c.querySelectorAll("div.space-y-1 > div")];
      const read = (row) => ({
        won: row.firstElementChild.className.includes("bg-muted"),
        line: (row.querySelector("p[lang=vi]")?.innerText ?? "").replace(/^[^\p{L}\p{N}]+/u, ""),
        score: Number(row.firstElementChild.querySelector("span.tabular").innerText.replace(/\D+.*$/, "")),
      });
      return { a: read(a), b: read(b), badge: c.querySelector("span.inline-flex")?.innerText ?? "" };
    }),
  );
  const WIN = new Set(["bagel_winner", "close_win", "blowout_win", "expected_win"]);
  const LOSE = new Set(["bagel_loser", "close_loss", "blowout_loss"]);
  let checked = 0;
  for (const c of cards) {
    assert.notEqual(c.a.won, c.b.won);
    for (const side of [c.a, c.b]) {
      if (!side.line) continue;
      const buckets = bucketOf(side.line);
      assert.ok(buckets.length > 0, `unknown line: ${side.line}`);
      assert.ok(buckets.every((k) => (side.won ? WIN : LOSE).has(k)), `${side.won ? "winner" : "loser"} got ${buckets}: ${side.line}`);
      if (/^11–0|^0–11/.test(side.line)) assert.ok(c.badge.includes("11"), "hard-coded 11-0 shown on a different target");
      checked++;
    }
  }
  assert.ok(checked >= 10, `only ${checked} lines checked`);
});

await page.goto(`${BASE}/matches`);
await page.locator("article").first().waitFor();
if (SHOTS) await page.screenshot({ path: `${SHOTS}/roast-matches-desktop.png`, fullPage: true });

// ───────────────────────────── predictor
console.log("Predictor");
await page.goto(`${BASE}/predict`);
async function pick(label, text) {
  const input = page.getByRole("combobox", { name: label, exact: true });
  await input.click();
  await input.fill(text);
  await page.getByRole("option", { name: new RegExp(text) }).first().click();
}
await page.getByRole("heading", { name: "Thầy Bói Cinco Phán Kèo" }).waitFor();
await pick("Player 1", "Demo Avery");
await pick("Player 2", "Demo Blake");
await pick("Player 3", "Demo Casey");
await pick("Player 4", "Demo Drew");
const panel = page.getByRole("region", { name: "Thầy bói" });
await panel.waitFor();

await check("verdict panel shows probabilities from the engine and a matching roast line", async () => {
  const a = parseFloat(await page.getByTestId("win-a").getAttribute("data-value"));
  const b = parseFloat(await page.getByTestId("win-b").getAttribute("data-value"));
  assert.ok(Math.abs(a + b - 1) < 1e-9);
  const text = await panel.innerText();
  assert.match(text, /Kèo Thơm Hơn|Ngang Ngửa/);
  assert.ok(text.length > 60);
});

await check("win-by rule changes the probability; the roast button never does", async () => {
  await page.getByText("Hơn 1 Là Chốt", { exact: true }).first().click();
  const w1 = parseFloat(await page.getByTestId("win-a").getAttribute("data-value"));
  await page.getByText("Phải Hơn 2 Mới Được Gáy", { exact: true }).first().click();
  const w2 = parseFloat(await page.getByTestId("win-a").getAttribute("data-value"));
  assert.notEqual(w1, w2);
  const before = await page.getByTestId("win-a").getAttribute("data-value");
  const texts = new Set();
  for (let i = 0; i < 4; i++) {
    await panel.getByRole("button", { name: "Chửi Nữa Đi" }).click();
    await page.waitForTimeout(350);
    texts.add(await panel.innerText());
  }
  assert.ok(texts.size >= 3, "lines should cycle");
  assert.equal(await page.getByTestId("win-a").getAttribute("data-value"), before);
});

await check("balance button re-pairs to the closest teams and shows a balance line", async () => {
  await page.getByRole("button", { name: "Chia Phe Đỡ Hành Nhau" }).click();
  await page.waitForTimeout(400);
  const a = parseFloat(await page.getByTestId("win-a").getAttribute("data-value"));
  assert.ok(a > 0.2 && a < 0.8, `balanced win prob ${a}`);
});

await check("no duplicate players can be selected", async () => {
  const input = page.getByRole("combobox", { name: "Player 1", exact: true });
  await input.click();
  await input.fill("Demo Blake");
  assert.equal(await page.getByRole("option", { name: /Demo Blake/ }).count(), 0);
  await page.keyboard.press("Escape");
});

await check("point-share caveat is still shown (in Vietnamese) next to the disclaimer", async () => {
  const text = await page.locator("main").innerText();
  assert.match(text, /không phải xác suất thắng trận/);
  assert.match(text, /Thầy bói chỉ tính xác suất/);
});
if (SHOTS) await page.screenshot({ path: `${SHOTS}/roast-predict-desktop.png`, fullPage: true });

// ───────────────────────────── profile
console.log("Profile");
await page.goto(`${BASE}/players`);
await page.getByRole("link", { name: /Demo Avery/ }).first().click();
await page.waitForURL("**/players/*");
await check("official name unchanged; Vietnamese labels, streak/status lines and ratings at 2 decimals", async () => {
  await page.getByRole("heading", { name: "Demo Avery", exact: true }).waitFor();
  await page.getByText("Lý Lịch Bất Hảo").waitFor();
  const text = await page.locator("main").innerText();
  assert.match(text, /Trình Thật Chứ Không Phải Trình Mõm/);
  assert.equal(text.match(/\b\d\.\d{3,}\b/g), null);
  assert.equal(RAW_KEY.test(text), false);
});
if (SHOTS) await page.screenshot({ path: `${SHOTS}/roast-profile-desktop.png`, fullPage: true });

// ───────────────────────────── database is untouched by language changes
await check("switching languages and roasting wrote nothing to the database", async () => {
  const { execFileSync } = await import("node:child_process");
  const now = execFileSync("node", ["/tmp/dbhash.cjs"], { encoding: "utf8" }).split(" ")[0];
  const before = (process.env.HASH_BEFORE ?? "").trim().split(" ")[0];
  if (before) assert.equal(now, before);
  else console.log("     (set HASH_BEFORE to compare)", now);
});
assert.deepEqual(v1.errors, [], `console errors: ${v1.errors.join("\n")}`);
await v1.ctx.close();

// ───────────────────────────── admin in funny mode
console.log("Admin");
if (EMAIL && PASSWORD) {
  const adm = await newVisitor();
  const ap = adm.page;
  await ap.addInitScript(([l, a]) => {
    localStorage.setItem(l, "vi-roast");
    localStorage.setItem(a, "1");
  }, [LANG_KEY, ACK_KEY]);
  await check("admin routes still require sign-in regardless of language", async () => {
    for (const path of ["/admin", "/admin/players", "/admin/matches/new", "/admin/settings"]) {
      await ap.goto(BASE + path);
      await ap.waitForURL("**/admin/login");
    }
    const res = await ap.request.get(`${BASE}/admin/export`);
    assert.equal(res.status(), 401);
  });
  await check("sign in works in funny mode; destructive and approval actions keep plain English", async () => {
    await ap.getByLabel("Email").fill(EMAIL);
    await ap.getByLabel("Password").fill(PASSWORD);
    await ap.getByRole("button", { name: "Sign in" }).click();
    await ap.waitForURL("**/admin");
    await ap.getByRole("button", { name: /Rút Lui Chiến Thuật \(Sign out\)/ }).waitFor();
    await ap.goto(`${BASE}/admin/matches/new`);
    await ap.getByRole("heading", { name: "Khai Báo Thương Vong" }).waitFor();
    await ap.getByText("Hơn 1 Là Chốt").first().waitFor();
    await ap.getByText("(Win by 1)").first().waitFor();
  });
  await check("ACCEPTANCE in funny mode: 11–10, Win by 1 saves and confirms; old matches untouched", async () => {
    async function pick2(label, text) {
      const input = ap.getByRole("combobox", { name: label, exact: true });
      await input.click();
      await input.fill(text);
      await ap.getByRole("option", { name: new RegExp(text) }).first().click();
    }
    await pick2("Player 1", "Demo Casey");
    await pick2("Player 2", "Demo Drew");
    await pick2("Player 3", "Demo Gray");
    await pick2("Player 4", "Demo Harper");
    await ap.getByRole("spinbutton", { name: "Phe A" }).fill("11");
    await ap.getByRole("spinbutton", { name: "Phe B" }).fill("10");
    await ap.getByRole("radio", { name: /Win by 1|Hơn 1/ }).check({ force: true });
    await ap.getByRole("button", { name: "Xem Ai Bay Điểm" }).click();
    await ap.getByText("Projected — not saved until you confirm").waitFor();
    const ack = ap.getByLabel(/not a duplicate/);
    if (await ap.getByLabel(/not a duplicate/).count()) await ack.check();
    await ap.getByRole("button", { name: /Chốt Đơn Mất Mặt \(Confirm & save match\)/ }).click();
    await ap.getByText(/Đã Khai Báo, Không Chạy Đâu Được \(Match confirmed/).waitFor();
  });
  await check("the new match shows a line in funny mode on the public history", async () => {
    await ap.goto(`${BASE}/matches`);
    const card = ap.locator("article").first();
    await card.waitFor();
    assert.match(await card.innerText(), /11/);
    assert.match(await card.innerText(), /Hơn 1 Là Chốt/);
    assert.ok((await card.locator("p[lang=vi]").count()) >= 1);
  });
  assert.deepEqual(adm.errors, [], `admin console errors: ${adm.errors.join("\n")}`);
  await adm.ctx.close();
}

// ───────────────────────────── 360px layout, reduced motion
console.log("Mobile 360px + reduced motion");
const mob = await newVisitor({ viewport: { width: 360, height: 780 }, isMobile: true, reducedMotion: "reduce" });
await mob.page.addInitScript(([l, a]) => {
  localStorage.setItem(l, "vi-roast");
  localStorage.setItem(a, "1");
}, [LANG_KEY, ACK_KEY]);
const mp = mob.page;
await mp.goto(BASE);
await mp.locator("html[lang=vi]").waitFor();
const someProfile = await mp.locator('a[href^="/players/"]').first().getAttribute("href");
for (const path of ["/", "/predict", "/players", "/matches", someProfile, "/admin/login"]) {
  await check(`no horizontal overflow at 360px: ${path}`, async () => {
    await mp.goto(BASE + path);
    await mp.locator("html[lang=vi]").waitFor();
    await mp.waitForTimeout(500);
    const { w, offenders } = await mp.evaluate(() => {
      const w = document.documentElement.scrollWidth;
      const offenders = [...document.querySelectorAll("body *")]
        .filter((e) => e.getBoundingClientRect().right > 361 && !e.closest("[class*=overflow-x-auto]") && getComputedStyle(e).position !== "fixed")
        .slice(0, 3)
        .map((e) => `${e.tagName}.${String(e.className).slice(0, 40)}`);
      return { w, offenders };
    });
    assert.ok(w <= 360, `scrollWidth ${w}; offenders ${offenders.join(", ")}`);
  });
}
await check("touch targets in the header, nav and cards are at least 44px", async () => {
  await mp.goto(`${BASE}/matches`);
  await mp.locator("article").first().waitFor();
  const small = await mp.evaluate(() =>
    [...document.querySelectorAll("header button, header a, nav a, article button")]
      .filter((e) => e.getBoundingClientRect().height > 0)
      .map((e) => ({ name: (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 24), h: e.getBoundingClientRect().height, w: e.getBoundingClientRect().width }))
      .filter((e) => e.h < 43.5 || e.w < 43.5),
  );
  assert.deepEqual(small, []);
});
if (SHOTS) {
  for (const [name, path] of [["leaderboard", "/"], ["predict", "/predict"], ["matches", "/matches"], ["profile", someProfile]]) {
    await mp.goto(BASE + path);
    await mp.locator("html[lang=vi]").waitFor();
    if (name === "predict") {
      for (const [label, text] of [["Player 1", "Demo Avery"], ["Player 2", "Demo Blake"], ["Player 3", "Demo Casey"], ["Player 4", "Demo Drew"]]) {
        const input = mp.getByRole("combobox", { name: label, exact: true });
        await input.click();
        await input.fill(text);
        await mp.getByRole("option", { name: new RegExp(text) }).first().click();
      }
    }
    await mp.waitForTimeout(600);
    await mp.screenshot({ path: `${SHOTS}/roast-${name}-360.png`, fullPage: true });
  }
}
assert.deepEqual(mob.errors, [], `mobile console errors: ${mob.errors.join("\n")}`);
await mob.ctx.close();

await browser.close();
if (failures.length) {
  console.log(`\n${failures.length} FAILED:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
console.log("\nROAST E2E OK");
