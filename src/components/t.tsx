"use client";

import { useIsRoast, useT, useTPlain } from "@/i18n/use-locale";
import type { TranslationKey } from "@/i18n/types";

/**
 * Inline translated text usable from server components. It renders English during SSR and on the
 * first client render, then the visitor's mode. `en` keeps the existing English wording where one
 * key is reused for a differently worded English label.
 */
export function T({ k, en }: { k: TranslationKey; en?: string }) {
  return <>{useT()(k, en)}</>;
}

/** Funny label followed by the plain English meaning, for admin actions that must stay unambiguous. */
export function TPlain({ k, plain }: { k: TranslationKey; plain: string }) {
  return <>{useTPlain()(k, plain)}</>;
}

/** Renders its children only in the funny mode (English visitors never see or download them). */
export function RoastOnly({ children }: { children: React.ReactNode }) {
  return useIsRoast() ? <>{children}</> : null;
}
