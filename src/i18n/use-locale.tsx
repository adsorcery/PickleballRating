"use client";

import { MotionConfig } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { RoastOptInDialog } from "@/components/roast-opt-in-dialog";
import { loadRoastCatalog } from "./catalog";
import {
  getServerAck,
  getServerLanguage,
  getStoredAck,
  getStoredLanguage,
  storeAck,
  storeLanguage,
  subscribe,
} from "./store";
import { translate, translatePlain } from "./t";
import type { LocaleMode, RoastCatalog, TranslationKey } from "./types";

export interface LocaleContextValue {
  /** The mode actually in effect. `vi-roast` requires the stored acknowledgement. */
  mode: LocaleMode;
  catalog: RoastCatalog | null;
  /** Asks for the funny mode: opens the one-time acknowledgement dialog if needed. */
  requestRoast: () => void;
  resetToEnglish: () => void;
}

const defaultValue: LocaleContextValue = { mode: "en", catalog: null, requestRoast: () => {}, resetToEnglish: () => {} };

export const LocaleContext = createContext<LocaleContextValue>(defaultValue);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  // Server snapshot is always English, so SSR and first client render match; the stored preference
  // is applied right after hydration without a mismatch.
  const language = useSyncExternalStore(subscribe, getStoredLanguage, getServerLanguage);
  const acknowledged = useSyncExternalStore(subscribe, getStoredAck, getServerAck);
  const [catalog, setCatalog] = useState<RoastCatalog | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const mode: LocaleMode = language === "vi-roast" && acknowledged ? "vi-roast" : "en";

  useEffect(() => {
    if (mode !== "vi-roast" || catalog) return;
    let cancelled = false;
    loadRoastCatalog()
      .then((c) => !cancelled && setCatalog(c))
      .catch(() => {
        // The catalog failed to load (offline?): stay readable in English rather than show nothing.
      });
    return () => {
      cancelled = true;
    };
  }, [mode, catalog]);

  useEffect(() => {
    document.documentElement.lang = mode === "vi-roast" && catalog ? "vi" : "en";
  }, [mode, catalog]);

  const requestRoast = useCallback(() => {
    if (getStoredAck()) storeLanguage("vi-roast");
    else setDialogOpen(true);
  }, []);
  const resetToEnglish = useCallback(() => storeLanguage("en"), []);

  const value = useMemo<LocaleContextValue>(
    () => ({ mode, catalog: mode === "vi-roast" ? catalog : null, requestRoast, resetToEnglish }),
    [mode, catalog, requestRoast, resetToEnglish],
  );

  return (
    <LocaleContext.Provider value={value}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
      <RoastOptInDialog
        open={dialogOpen}
        onCancel={() => setDialogOpen(false)}
        onConfirm={() => {
          storeAck();
          storeLanguage("vi-roast");
          setDialogOpen(false);
        }}
      />
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

export type TFunction = (key: TranslationKey, englishOverride?: string) => string;

/** Translator for the current mode. English (or a not-yet-loaded catalog) falls back to English. */
export function useT(): TFunction {
  const { mode, catalog } = useLocale();
  return useCallback((key, englishOverride) => translate(mode, catalog, key, englishOverride), [mode, catalog]);
}

/** Funny label with a plain English companion, for admin actions where meaning must stay unambiguous. */
export function useTPlain(): (key: TranslationKey, plainEnglish: string) => string {
  const { mode, catalog } = useLocale();
  return useCallback((key, plain) => translatePlain(mode, catalog, key, plain), [mode, catalog]);
}

/** True only when the funny mode is on and its catalog has loaded. */
export function useIsRoast(): boolean {
  const { mode, catalog } = useLocale();
  return mode === "vi-roast" && catalog !== null;
}
