"use client";

import { AnimatePresence, motion } from "motion/react";
import { useLocale } from "@/i18n/use-locale";
import type { EventCatalog, RoastEvent } from "@/i18n/types";
import { EVENT_EMOJI } from "@/lib/roast/classify-event";
import { pickMessage, type LineContext } from "@/lib/roast/pick-message";
import { cn } from "@/lib/utils";

/** The loaded joke library, or null in English mode (so nothing roast-related renders or runs). */
export function useRoastEvents(): EventCatalog | null {
  const { mode, catalog } = useLocale();
  return mode === "vi-roast" && catalog ? catalog.events : null;
}

/** One animated line. The text swaps with a soft spring; reduced-motion visitors get an instant swap. */
export function RoastText({
  event,
  text,
  className,
  emoji = true,
}: {
  event: RoastEvent;
  text: string | null | undefined;
  className?: string;
  emoji?: boolean;
}) {
  if (!text) return null;
  return (
    <AnimatePresence mode="wait">
      <motion.p
        key={text}
        lang="vi"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className={cn("text-sm leading-snug text-muted-foreground", className)}
      >
        {emoji && EVENT_EMOJI[event] && (
          <span aria-hidden className="mr-1.5">
            {EVENT_EMOJI[event]}
          </span>
        )}
        {text}
      </motion.p>
    </AnimatePresence>
  );
}

/** Convenience: pick a line for an event and render it; renders nothing outside the funny mode. */
export function RoastLine({
  event,
  seed,
  variant = 0,
  ctx,
  className,
}: {
  event: RoastEvent;
  seed: string;
  variant?: number;
  ctx?: LineContext;
  className?: string;
}) {
  const events = useRoastEvents();
  if (!events) return null;
  return <RoastText event={event} text={pickMessage(events[event], `${seed}|${event}|vi-roast`, variant, ctx)} className={className} />;
}
