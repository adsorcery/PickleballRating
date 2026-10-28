import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/auth/guard";
import { csvCell } from "@/lib/csv";
import { getDb } from "@/lib/db/client";
import { auditLogs, matches, matchPlayers, players, ratingConfigVersions, ratingHistory } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await getCurrentAdmin())) return new NextResponse("Unauthorized", { status: 401 });
  const db = getDb();
  const format = new URL(req.url).searchParams.get("format") ?? "json";
  const stamp = new Date().toISOString().slice(0, 10);
  const headers = { "Cache-Control": "no-store" };

  if (format === "players.csv") {
    const rows = db.select().from(players).all();
    const lines = [
      "id,display_name,initial_cinco_rating,current_cinco_rating,dupr_rating,active",
      ...rows.map((p) => [p.id, p.displayName, p.initialCincoRating, p.currentCincoRating, p.duprRating, p.active ? 1 : 0].map(csvCell).join(",")),
    ];
    return new NextResponse(lines.join("\n"), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="viet-cinco-players-${stamp}.csv"` },
    });
  }

  const data = {
    exportedAt: new Date().toISOString(),
    players: db.select().from(players).all(),
    matches: db.select().from(matches).all(),
    matchPlayers: db.select().from(matchPlayers).all(),
    ratingHistory: db.select().from(ratingHistory).all(),
    ratingConfigVersions: db.select().from(ratingConfigVersions).all(),
    auditLogs: db.select().from(auditLogs).all(),
  };
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { ...headers, "Content-Type": "application/json", "Content-Disposition": `attachment; filename="viet-cinco-export-${stamp}.json"` },
  });
}
