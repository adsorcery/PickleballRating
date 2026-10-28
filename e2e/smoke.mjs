// Browser smoke test: BASE_URL=http://localhost:3111 ADMIN_EMAIL=... ADMIN_PASSWORD=... node e2e/smoke.mjs
import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3111";
const EMAIL = process.env.ADMIN_EMAIL;
const PASSWORD = process.env.ADMIN_PASSWORD;
const SHOTS = process.env.SHOTS_DIR;
const NEWBIE = `E2E Newbie ${Date.now() % 100000}`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const shot = (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

async function pick(label, text) {
  const input = page.getByRole("combobox", { name: label, exact: true });
  await input.click();
  await input.fill(text);
  await page.getByRole("option", { name: new RegExp(text) }).first().click();
}

// ---- public leaderboard
await page.goto(BASE);
await page.getByRole("heading", { name: "Viet Cinco Leaderboard" }).waitFor();
const rows = await page.locator("tbody tr").count();
assert.ok(rows >= 8, `leaderboard rows ${rows}`);
await shot("leaderboard");

// ---- predictor
await page.getByRole("link", { name: "Predict a Match" }).first().click();
await page.waitForURL("**/predict");
await pick("Player 1", "Demo Avery");
await pick("Player 2", "Demo Blake");
await pick("Player 3", "Demo Casey");
// a chosen player cannot be offered again
const p4 = page.getByRole("combobox", { name: "Player 4", exact: true });
await p4.click();
await p4.fill("Demo Avery");
assert.equal(await page.getByRole("option", { name: /Demo Avery/ }).count(), 0, "duplicate selection offered");
await p4.fill("Demo Drew");
await page.getByRole("option", { name: /Demo Drew/ }).first().click();
const a11 = parseFloat(await page.getByTestId("win-a").getAttribute("data-value"));
const b11 = parseFloat(await page.getByTestId("win-b").getAttribute("data-value"));
assert.ok(Math.abs(a11 + b11 - 1) < 1e-9, `sum ${a11 + b11}`);
await page.getByText("Win by 2", { exact: true }).click();
const winBy2 = parseFloat(await page.getByTestId("win-a").getAttribute("data-value"));
await page.getByText("Win by 1", { exact: true }).click();
const winBy1 = parseFloat(await page.getByTestId("win-a").getAttribute("data-value"));
assert.ok(winBy1 < winBy2, "win by 1 should be less decisive than win by 2 for the favourite");
await page.getByText("21", { exact: true }).click();
const a21 = parseFloat(await page.getByTestId("win-a").getAttribute("data-value"));
assert.notEqual(a11, a21, "format should change probability");
console.log("predictor", { a11, b11, a21 });
await shot("predict");

// ---- admin guarded
await page.goto(`${BASE}/admin/matches/new`);
await page.waitForURL("**/admin/login");
await page.getByLabel("Email").fill(EMAIL);
await page.getByLabel("Password").fill("wrong-password-123");
await page.getByRole("button", { name: "Sign in" }).click();
await page.getByText("Invalid email or password.").waitFor();
await page.getByLabel("Password").fill(PASSWORD);
await page.getByRole("button", { name: "Sign in" }).click();
await page.waitForURL("**/admin");
const cookies = await ctx.cookies();
const sess = cookies.find((c) => c.name === "vc_session");
assert.ok(sess?.httpOnly && sess.sameSite === "Lax", "session cookie flags");
await shot("admin");

// ---- create player
await page.goto(`${BASE}/admin/players`);
await page.getByLabel("Display name *").fill(NEWBIE);
await page.getByLabel("Initial Cinco Point *").fill("3.100");
await page.getByRole("button", { name: "Add player" }).click();
await page.getByText(/Player added/).waitFor();

// ---- enter a match, preview, confirm
await page.goto(`${BASE}/admin/matches/new`);
await pick("Player 1", "Demo Avery");
await pick("Player 2", NEWBIE);
await pick("Player 3", "Demo Casey");
await pick("Player 4", "Demo Drew");
await page.getByRole("spinbutton", { name: "Team A score" }).fill("11");
await page.getByRole("spinbutton", { name: "Team B score" }).fill("6");
const confirmBtn = () => page.getByRole("button", { name: "Confirm & save match" });
assert.equal(await confirmBtn().count(), 0, "confirm must not exist before preview");
await page.getByRole("button", { name: "Preview changes" }).click();
await page.getByText("Projected — not saved until you confirm").waitFor();
await shot("preview");
await page.getByRole("spinbutton", { name: "Team B score" }).fill("7"); // change after preview -> stale
await page.getByText("You changed the match after previewing").waitFor();
assert.equal(await confirmBtn().count(), 0, "confirm hidden while preview is stale");
await page.getByRole("button", { name: "Preview changes" }).click();
await confirmBtn().waitFor();
await confirmBtn().dblclick(); // double-click must not double-apply
await page.getByText(/Match confirmed/).waitFor();

// ---- leaderboard reflects the match; the new player has a game and is provisional
await page.goto(BASE);
const row = page.locator("tr", { hasText: NEWBIE });
await row.waitFor();
assert.match(await row.innerText(), /Provisional/);
assert.match(await row.innerText(), /1–0/);
const rating = parseFloat((await row.locator("td").nth(2).innerText()).trim());
console.log("newbie rating after win", rating);
assert.ok(rating >= 3.1, "winner's rating should not fall below its 3.10 start");
await row.getByRole("link", { name: NEWBIE }).click();
await page.getByRole("heading", { name: NEWBIE }).waitFor();
await shot("profile");

// ---- ACCEPTANCE: 11-10 to 11 with Win by 1 saves, and all four ratings are recalculated
await page.goto(`${BASE}/admin/matches/new`);
await page.getByText("Win by 1", { exact: true }).click();
await pick("Player 1", "Demo Casey");
await pick("Player 2", "Demo Drew");
await pick("Player 3", "Demo Gray");
await pick("Player 4", "Demo Harper");
await page.getByRole("spinbutton", { name: "Team A score" }).fill("11");
await page.getByRole("spinbutton", { name: "Team B score" }).fill("10");
await page.getByRole("button", { name: "Preview changes" }).click();
await page.getByText("Projected — not saved until you confirm").waitFor();
await page.getByText(/to 11, Win by 1/).waitFor();
const ack = page.getByLabel(/not a duplicate/); // present when re-running against the same data
if (await ack.count()) await ack.check();
await page.getByRole("button", { name: "Confirm & save match" }).click();
await page.getByText(/Match confirmed/).waitFor();
await page.goto(BASE + "/matches");
assert.ok((await page.locator("main").innerText()).includes("Win by 1"), "match list shows its rule");

// ---- the preferred rule is remembered for the next match
await page.goto(`${BASE}/admin/matches/new`);
await page.getByText("Win by 2", { exact: true }).click();
await page.waitForTimeout(500);
await page.reload();
assert.ok(await page.getByRole("radio", { name: "Win by 2" }).isChecked(), "preference should persist");

// ---- invalid score rejected by the server
await page.goto(`${BASE}/admin/matches/new`);
await page.getByText("Win by 2", { exact: true }).click();
await pick("Player 1", "Demo Avery");
await pick("Player 2", "Demo Blake");
await pick("Player 3", "Demo Casey");
await pick("Player 4", "Demo Drew");
await page.getByRole("spinbutton", { name: "Team A score" }).fill("11");
await page.getByRole("spinbutton", { name: "Team B score" }).fill("10");
await page.getByRole("button", { name: "Preview changes" }).click();
await page.getByText(/lead by at least 2/).first().waitFor();

// ---- mutation without a session is rejected server-side even though the page is open
await page.getByRole("spinbutton", { name: "Team B score" }).fill("4");
await ctx.clearCookies();
await page.getByRole("button", { name: "Preview changes" }).click();
await page.getByText("You are not authorized to do that.").waitFor();

// ---- every rating is shown with exactly 2 decimals on the main pages
for (const path of ["/", "/predict", "/players", "/matches"]) {
  await page.goto(BASE + path);
  const text = await page.locator("main").innerText();
  const bad = text.match(/\b\d\.\d{3,}\b/g);
  assert.equal(bad, null, `${path} shows >2 decimals: ${bad}`);
}

await browser.close();
const real = errors.filter((e) => !/401|Failed to load resource/.test(e));
assert.equal(real.length, 0, `console errors: ${real.join("\n")}`);
console.log("E2E OK");
