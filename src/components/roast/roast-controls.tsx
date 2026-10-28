"use client";

import { motion } from "motion/react";
import { Flame } from "lucide-react";
import { useT } from "@/i18n/use-locale";
import { RoastLine } from "@/components/roast/roast-line";
import { cn } from "@/lib/utils";

/**
 * "Chửi Nữa Đi". Purely local: it bumps a counter held in the parent, so it never touches the
 * network, the database, scores or ratings. Rendered only in the funny mode by its parents.
 */
export function RoastAgainButton({ onClick, className }: { onClick: () => void; className?: string }) {
  const t = useT();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
      whileHover={{ y: -1 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-bold text-accent-foreground hover:brightness-95",
        className,
      )}
    >
      <Flame className="size-4" aria-hidden />
      <span lang="vi">{t("common.roastAgain")}</span>
    </motion.button>
  );
}

/** A small reaction under the button once it has been pressed (the `roast_again` lines). */
export function RoastAgainCaption({ variant, seed }: { variant: number; seed: string }) {
  if (variant <= 0) return null;
  return <RoastLine event="roast_again" seed={seed} variant={variant} className="text-xs" />;
}
