"use client";

import { useT } from "@/i18n/use-locale";
import { formatCincoRating } from "@/lib/format";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ChartPoint {
  t: number;
  rating: number;
}

export function RatingChart({ points, timezone }: { points: ChartPoint[]; timezone: string }) {
  const t = useT();
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric" });
  const ratings = points.map((p) => p.rating);
  const lo = Math.floor((Math.min(...ratings) - 0.1) * 10) / 10;
  const hi = Math.ceil((Math.max(...ratings) + 0.1) * 10) / 10;
  return (
    <div className="h-64 w-full" role="img" aria-label={`Rating history from ${formatCincoRating(ratings[0])} to ${formatCincoRating(ratings[ratings.length - 1])}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="#cfd9c8" strokeDasharray="3 3" />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t) => fmt.format(new Date(t))} tick={{ fontSize: 12 }} />
          <YAxis domain={[lo, hi]} tick={{ fontSize: 12 }} tickFormatter={(v) => formatCincoRating(Number(v))} width={48} />
          <Tooltip
            formatter={(v) => [formatCincoRating(Number(v)), t("leaderboard.rating")]}
            labelFormatter={(t) => fmt.format(new Date(Number(t)))}
          />
          <Line type="monotone" dataKey="rating" stroke="#0b5d3b" strokeWidth={3} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
