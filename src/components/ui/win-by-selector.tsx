"use client";

import { useId } from "react";
import { WIN_BY_OPTIONS, winByLabel, type WinBy } from "@/lib/rating/config";
import { cn } from "@/lib/utils";

/** Shared by match entry and the predictor so both use exactly the same rule options. */
export function WinBySelector({ value, onChange }: { value: WinBy; onChange: (v: WinBy) => void }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold">Winning rule</legend>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Winning rule">
        {WIN_BY_OPTIONS.map((w) => (
          <label
            key={w}
            className={cn(
              "flex min-h-12 cursor-pointer items-center justify-center rounded-lg border text-base font-bold has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
              value === w ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
            )}
          >
            <input type="radio" name={name} className="sr-only" checked={value === w} onChange={() => onChange(w)} />
            {winByLabel(w)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
