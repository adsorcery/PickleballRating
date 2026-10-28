"use client";

import { useId } from "react";
import { useT } from "@/i18n/use-locale";
import { WIN_BY_OPTIONS, winByLabel, type WinBy } from "@/lib/rating/config";
import { cn } from "@/lib/utils";

/**
 * Shared by match entry and the predictor so both use exactly the same rule options.
 * `plainEnglish` adds the plain English rule next to a funny label (used where meaning must be unambiguous).
 */
export function WinBySelector({ value, onChange, plainEnglish = false }: { value: WinBy; onChange: (v: WinBy) => void; plainEnglish?: boolean }) {
  const name = useId();
  const t = useT();
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold">{t("predictor.winBy")}</legend>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("predictor.winBy")}>
        {WIN_BY_OPTIONS.map((w) => {
          const label = t(w === 1 ? "predictor.winByOne" : "predictor.winByTwo", winByLabel(w));
          return (
            <label
              key={w}
              className={cn(
                "flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-lg border px-2 py-1 text-center text-base font-bold leading-tight has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                value === w ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
              )}
            >
              <input type="radio" name={name} className="sr-only" checked={value === w} onChange={() => onChange(w)} />
              <span>{label}</span>
              {plainEnglish && label !== winByLabel(w) && <span className="text-xs font-semibold opacity-80">({winByLabel(w)})</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
