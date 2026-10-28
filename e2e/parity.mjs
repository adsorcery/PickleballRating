// Compares the rendered English text of public pages between two running servers (A = before, B = after).
import { chromium } from "playwright";
import assert from "node:assert/strict";
const [A, B] = [process.env.A, process.env.B];
const b = await chromium.launch();
async function grab(base, path, login) {
  const ctx = await b.newContext({ viewport: { width: 1100, height: 900 }, locale: "en-US", timezoneId: "UTC" });
  const p = await ctx.newPage();
  if (login) {
    await p.goto(base + "/admin/login");
    await p.getByLabel("Email").fill(process.env.ADMIN_EMAIL);
    await p.getByLabel("Password").fill(process.env.ADMIN_PASSWORD);
    await p.getByRole("button", { name: "Sign in" }).click();
    await p.waitForURL("**/admin");
  }
  await p.goto(base + path);
  await p.waitForLoadState("networkidle");
  await p.waitForTimeout(500);
  const out = await p.evaluate(() => ({
    lang: document.documentElement.lang,
    main: document.querySelector("main").innerText,
    footer: document.querySelector("footer").innerText,
    nav: [...document.querySelectorAll("nav[aria-label=Main] a")].map((a) => a.innerText.trim()).filter(Boolean),
    headings: [...document.querySelectorAll("h1,h2")].map((h) => h.innerText.trim()),
    buttons: [...document.querySelectorAll("main button")].map((x) => (x.getAttribute("aria-label") || x.innerText).trim()),
    links: [...document.querySelectorAll("main a")].map((x) => x.getAttribute("href")),
  }));
  await ctx.close();
  return out;
}
const idPage = await (async () => {
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.goto(B + "/players");
  const href = await p.locator('a[href^="/players/"]').first().getAttribute("href");
  await ctx.close();
  return href;
})();
let bad = 0;
for (const path of ["/", "/predict", "/players", "/matches", "/matches?page=2", "/matches?format=11&q=avery", idPage, "/admin/login"]) {
  const [x, y] = [await grab(A, path), await grab(B, path)];
  for (const k of Object.keys(x)) {
    const same = JSON.stringify(x[k]) === JSON.stringify(y[k]);
    if (!same) {
      bad++;
      console.log(`DIFF ${path} [${k}]\n  before: ${JSON.stringify(x[k]).slice(0, 300)}\n  after : ${JSON.stringify(y[k]).slice(0, 300)}`);
    }
  }
  console.log(`${path}: compared ${Object.keys(x).length} facets`);
}
if (process.env.ADMIN_EMAIL) {
  for (const path of ["/admin", "/admin/players", "/admin/matches/new", "/admin/settings"]) {
    const [x, y] = [await grab(A, path, true), await grab(B, path, true)];
    for (const k of ["main", "headings", "buttons", "links"]) {
      if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) {
        bad++;
        console.log(`DIFF ${path} [${k}]\n  before: ${JSON.stringify(x[k]).slice(0, 400)}\n  after : ${JSON.stringify(y[k]).slice(0, 400)}`);
      }
    }
    console.log(`${path} (admin): compared`);
  }
}
await b.close();
assert.equal(bad, 0, `${bad} English differences`);
console.log("ENGLISH PARITY OK");
