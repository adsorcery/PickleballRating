import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeStorage {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
  removeItem(k: string) { this.data.delete(k); }
}

async function freshStore(storage: unknown) {
  vi.resetModules();
  const listeners = new Map<string, Set<() => void>>();
  vi.stubGlobal("window", {
    localStorage: storage,
    addEventListener: (n: string, cb: () => void) => (listeners.get(n) ?? listeners.set(n, new Set()).get(n)!).add(cb),
    removeEventListener: (n: string, cb: () => void) => listeners.get(n)?.delete(cb),
  });
  return import("@/i18n/store");
}

describe("language preference store", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("server snapshots are always English and unacknowledged (no hydration mismatch)", async () => {
    const s = await freshStore(new FakeStorage());
    expect(s.getServerLanguage()).toBe("en");
    expect(s.getServerAck()).toBe(false);
  });

  it("defaults to English for a first-time visitor and reads nothing it did not write", async () => {
    const fake = new FakeStorage();
    const s = await freshStore(fake);
    expect(s.getStoredLanguage()).toBe("en");
    expect(s.getStoredAck()).toBe(false);
    expect(fake.data.size).toBe(0);
  });

  it("persists the choice and acknowledgement under the documented keys", async () => {
    const fake = new FakeStorage();
    const s = await freshStore(fake);
    s.storeAck();
    s.storeLanguage("vi-roast");
    expect(fake.data.get("vietcinco:language")).toBe("vi-roast");
    expect(fake.data.get("vietcinco:roast-ack")).toBe("1");
    expect(s.getStoredLanguage()).toBe("vi-roast");
    expect(s.getStoredAck()).toBe(true);
    s.storeLanguage("en");
    expect(s.getStoredLanguage()).toBe("en");
    expect(fake.data.get("vietcinco:roast-ack")).toBe("1"); // acknowledgement survives switching back
  });

  it("treats corrupted or unknown values as English", async () => {
    const fake = new FakeStorage();
    fake.data.set("vietcinco:language", "klingon");
    fake.data.set("vietcinco:roast-ack", "yes");
    const s = await freshStore(fake);
    expect(s.getStoredLanguage()).toBe("en");
    expect(s.getStoredAck()).toBe(false);
  });

  it("notifies subscribers on change and stops after unsubscribe", async () => {
    const s = await freshStore(new FakeStorage());
    const cb = vi.fn();
    const off = s.subscribe(cb);
    s.storeLanguage("vi-roast");
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    s.storeLanguage("en");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("keeps working in memory when storage is blocked", async () => {
    const blocked = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
      removeItem: () => { throw new Error("denied"); },
    };
    const s = await freshStore(blocked);
    expect(s.getStoredLanguage()).toBe("en");
    s.storeAck();
    s.storeLanguage("vi-roast");
    expect(s.getStoredLanguage()).toBe("vi-roast");
    expect(s.getStoredAck()).toBe(true);
  });
});
