import { en } from "./en";
import type { LocaleMode, RoastCatalog, TranslationKey } from "./types";

/**
 * Typed accessor with English fallback. A missing, empty or non-string Vietnamese value falls back
 * to English; the raw dotted key is never returned. `englishOverride` lets one key serve two places
 * whose English wording differs, so English screens stay exactly as they were.
 */
export function translate(
  mode: LocaleMode,
  catalog: RoastCatalog | null,
  key: TranslationKey,
  englishOverride?: string,
): string {
  const base = englishOverride ?? en[key] ?? "";
  if (mode !== "vi-roast" || !catalog) return base;
  const value = catalog.ui[key];
  return typeof value === "string" && value.trim() !== "" ? value : base;
}

/** For admin mutations: funny label first, plain English second, so the meaning is never ambiguous. */
export function translatePlain(
  mode: LocaleMode,
  catalog: RoastCatalog | null,
  key: TranslationKey,
  plainEnglish: string,
): string {
  const funny = translate(mode, catalog, key, plainEnglish);
  return funny === plainEnglish ? plainEnglish : `${funny} (${plainEnglish})`;
}
