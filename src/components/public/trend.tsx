import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn, formatDelta } from "@/lib/utils";

export function Trend({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const Icon = value > 0.0005 ? ArrowUp : value < -0.0005 ? ArrowDown : Minus;
  const tone = value > 0.0005 ? "text-emerald-700" : value < -0.0005 ? "text-red-700" : "text-muted-foreground";
  return (
    <span className={cn("tabular inline-flex items-center gap-1 font-semibold", tone)}>
      <Icon className="size-3.5" aria-hidden />
      {formatDelta(value)}
    </span>
  );
}
