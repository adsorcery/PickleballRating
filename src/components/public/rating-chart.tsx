"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ChartPoint {
  t: number;
  rating: number;
}

export function RatingChart({ points, timezone }: { points: ChartPoint[]; timezone: string }) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric" });
  const ratings = points.map((p) => p.rating);
  const lo = Math.floor((Math.min(...ratings) - 0.1) * 10) / 10;
  const hi = Math.ceil((Math.max(...ratings) + 0.1) * 10) / 10;
  return (
    <div className="h-64 w-full" role="img" aria-label={`Rating history from ${ratings[0].toFixed(3)} to ${ratings[ratings.length - 1].toFixed(3)}`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="#cfd9c8" strokeDasharray="3 3" />
          <XAxis dataKey="t" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(t) => fmt.format(new Date(t))} tick={{ fontSize: 12 }} />
          <YAxis domain={[lo, hi]} tick={{ fontSize: 12 }} tickFormatter={(v) => Number(v).toFixed(1)} width={40} />
          <Tooltip
            formatter={(v) => [Number(v).toFixed(3), "Cinco"]}
            labelFormatter={(t) => fmt.format(new Date(Number(t)))}
          />
          <Line type="monotone" dataKey="rating" stroke="#0b5d3b" strokeWidth={3} dot={{ r: 3 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
