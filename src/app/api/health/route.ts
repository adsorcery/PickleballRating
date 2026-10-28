import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    const row = getDb().get<{ n: number }>(sql`select count(*) as n from players`);
    return NextResponse.json({ status: "ok", players: row?.n ?? 0 }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "health check failed", error: String(err) }));
    return NextResponse.json({ status: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
