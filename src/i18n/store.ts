import { LANGUAGE_STORAGE_KEY, ROAST_ACK_STORAGE_KEY, type LocaleMode } from "./types";

/**
 * A tiny external store over localStorage for useSyncExternalStore. Reads happen only in the browser
 * (the server snapshot is always English) and writes only from event handlers, never during render
 * or SSR. If storage is blocked, an in-memory fallback keeps the session working.
 */
const listeners = new Set<() => void>();
const memory = new Map<string, string | null>();

function read(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
    memory.delete(key);
  } catch {
    memory.set(key, value);
  }
  listeners.forEach((l) => l());
}

export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

export const getStoredLanguage = (): LocaleMode => (read(LANGUAGE_STORAGE_KEY) === "vi-roast" ? "vi-roast" : "en");
export const getStoredAck = (): boolean => read(ROAST_ACK_STORAGE_KEY) === "1";
export const getServerLanguage = (): LocaleMode => "en";
export const getServerAck = (): boolean => false;

export const storeLanguage = (mode: LocaleMode) => write(LANGUAGE_STORAGE_KEY, mode);
export const storeAck = () => write(ROAST_ACK_STORAGE_KEY, "1");
