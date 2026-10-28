import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { displaysAsZero, formatCincoDelta } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Trend({ value }: { value: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const flat = displaysAsZero(value);
  const Icon = flat ? Minus : value > 0 ? ArrowUp : ArrowDown;
  const tone = flat ? "text-muted-foreground" : value > 0 ? "text-emerald-700" : "text-red-700";
  return (
    <span className={cn("tabular inline-flex items-center gap-1 font-semibold", tone)}>
      <Icon className="size-3.5" aria-hidden />
      {formatCincoDelta(value)}
    </span>
  );
}
