"use client";

import { useLocale, useT } from "@/i18n/use-locale";
import { cn } from "@/lib/utils";

/**
 * Compact two-option switch that fits the sticky header on phones and desktops. English is the
 * default; the funny mode is chosen deliberately and goes through the acknowledgement dialog.
 */
export function LocaleSwitcher() {
  const { mode, requestRoast, resetToEnglish } = useLocale();
  const t = useT();
  const roast = mode === "vi-roast";
  const base =
    "flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2.5 text-xs font-bold transition-colors sm:text-sm";
  return (
    <div role="group" aria-label={t("common.language")} className="flex items-center gap-0.5 rounded-xl bg-muted p-0.5">
      <button
        type="button"
        aria-pressed={!roast}
        aria-label="English"
        title="English"
        onClick={resetToEnglish}
        className={cn(base, !roast ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
      >
        EN
      </button>
      <button
        type="button"
        aria-pressed={roast}
        aria-label="Mất Nết 18+"
        title="Chế Độ Mất Nết 18+"
        onClick={requestRoast}
        className={cn(base, roast ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
      >
        <span aria-hidden>🔥</span>
        <span className="ml-1">18+</span>
      </button>
    </div>
  );
}

/** Thin banner shown only in the funny mode, with the one-click way back. */
export function RoastBanner() {
  const { mode, resetToEnglish } = useLocale();
  const t = useT();
  if (mode !== "vi-roast") return null;
  return (
    <div className="border-b border-border bg-accent/60">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-1.5 text-xs font-semibold text-accent-foreground">
        <span lang="vi">🔥 Chế Độ {t("common.funny")}</span>
        <button type="button" onClick={resetToEnglish} className="min-h-9 rounded-lg px-2 underline underline-offset-2 hover:bg-accent" lang="vi">
          {t("common.reset")}
        </button>
      </div>
    </div>
  );
}
