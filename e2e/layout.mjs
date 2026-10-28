// Checks for horizontal overflow on key public pages at phone width.
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3111";
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 360, height: 780 } })).newPage();
let bad = 0;
for (const path of ["/", "/predict", "/players", "/matches", "/admin/login"]) {
  await p.goto(BASE + path);
  const w = await p.evaluate(() => document.documentElement.scrollWidth);
  console.log(path, w);
  if (w > 360) bad++;
}
await b.close();
process.exit(bad ? 1 : 0);
