/**
 * Usage:
 *   npm run db:seed -- --csv path/to/roster.csv   import a roster you have verified (preview is printed first)
 *   npm run db:seed -- --demo                     LOCAL DEV ONLY: fake "Demo" players and matches
 */
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { closeDatabase, getDatabase } from "../src/lib/db/client";
import { users } from "../src/lib/db/schema";
import { getEnv } from "../src/lib/env";
import { initialize } from "../src/lib/init";
import { confirmNewMatch } from "../src/lib/services/matches";
import { createPlayer, importRosterCsv, previewRosterCsv } from "../src/lib/services/players";
import { epochToLocalInput } from "../src/lib/time";

function actorId(db: ReturnType<typeof getDatabase>["db"]): string {
  const admin = db.select().from(users).where(eq(users.role, "admin")).get();
  if (!admin) throw new Error("Create an admin first: npm run admin:create -- you@example.com");
  return admin.id;
}

async function main() {
  const args = process.argv.slice(2);
  const opened = getDatabase();
  await initialize(opened);
  const { db } = opened;

  const csvIndex = args.indexOf("--csv");
  if (csvIndex >= 0) {
    const file = args[csvIndex + 1];
    if (!file) throw new Error("--csv requires a file path");
    const text = fs.readFileSync(file, "utf8");
    const preview = previewRosterCsv(db, text);
    if (preview.fatal) throw new Error(preview.fatal);
    console.table(preview.rows.map((r) => ({ line: r.line, name: r.displayName, rating: r.initialRating, status: r.status, note: r.message ?? "" })));
    if (!args.includes("--yes")) {
      console.log("Preview only. Verify names and ratings, then re-run with --yes to import.");
      return;
    }
    console.log(importRosterCsv(db, actorId(db), text));
    return;
  }

  if (args.includes("--demo")) {
    if (getEnv().NODE_ENV === "production") throw new Error("Refusing to seed demo data in production.");
    const actor = actorId(db);
    const names: [string, number][] = [
      ["Demo Avery", 4.2], ["Demo Blake", 3.9], ["Demo Casey", 3.6], ["Demo Drew", 3.4],
      ["Demo Emery", 3.2], ["Demo Finley", 3.0], ["Demo Gray", 2.8], ["Demo Harper", 3.5],
    ];
    const ids = names.map(([displayName, initialRating]) =>
      createPlayer(db, actor, { displayName, initialRating, duprRating: null, avatarUrl: null, notes: "Demo data" }),
    );
    const tz = getEnv().APP_TIMEZONE;
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const start = Date.now() - 40 * 86_400_000;
    for (let i = 0; i < 24; i++) {
      const pool = [...ids].sort(() => rnd() - 0.5).slice(0, 4);
      const aWins = rnd() > 0.45;
      const loser = Math.floor(rnd() * 10);
      confirmNewMatch(db, actor, {
        teamA: [pool[0], pool[1]],
        teamB: [pool[2], pool[3]],
        playedAtLocal: epochToLocalInput(start + i * 40 * 3_600_000, tz),
        formatTarget: 11,
        scoreA: aWins ? 11 : loser,
        scoreB: aWins ? loser : 11,
        rated: true,
        notes: "Demo data",
        idempotencyKey: `demo-seed-${i}-${Date.now()}`,
      }, { acknowledgeDuplicate: true });
    }
    console.log("Seeded 8 demo players and 24 demo matches.");
    return;
  }
  console.log("Nothing to do. Use --csv <file> [--yes] or --demo.");
}

main()
  .catch((err) => {
    console.error(err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
