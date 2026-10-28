"use client";

import { Minus, Plus } from "lucide-react";
import { useId } from "react";

export function ScoreInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  const n = Number(value);
  const bump = (d: number) => onChange(String(Math.max(0, Math.min(99, (Number.isFinite(n) ? n : 0) + d))));
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold">
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => bump(-1)} className="flex size-14 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted">
          <Minus aria-hidden />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={99}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="tabular h-14 w-full min-w-0 rounded-lg border border-border bg-card text-center text-3xl font-extrabold"
        />
        <button type="button" aria-label={`Increase ${label}`} onClick={() => bump(1)} className="flex size-14 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted">
          <Plus aria-hidden />
        </button>
      </div>
    </div>
  );
}
