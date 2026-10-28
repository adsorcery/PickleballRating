import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createUser, getUserForToken, login, logout } from "@/lib/auth/auth";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { adminSessions } from "@/lib/db/schema";
import { memoryDb } from "./helpers/db";

describe("passwords", () => {
  it("hashes with salt and verifies", async () => {
    const a = await hashPassword("correct horse battery");
    const b = await hashPassword("correct horse battery");
    expect(a).not.toEqual(b);
    expect(a.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", a)).toBe(true);
    expect(await verifyPassword("wrong password!!", a)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

describe("admin sessions and rate limiting", () => {
  it("logs in, stores only a token hash, expires, and logs out", async () => {
    const { db } = await memoryDb();
    createUser(db, { email: "Admin@Example.com", passwordHash: await hashPassword("a-long-password-1") });
    const now = Date.now();
    const res = await login(db, { email: "admin@example.com", password: "a-long-password-1", ip: "1.1.1.1", ttlHours: 1 }, now);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(db.select().from(adminSessions).all()[0].id).not.toEqual(res.token);
    expect(getUserForToken(db, res.token, now + 1000)?.email).toBe("admin@example.com");
    expect(getUserForToken(db, res.token, now + 2 * 3600 * 1000)).toBeNull();
    expect(getUserForToken(db, "forged", now)).toBeNull();
    expect(getUserForToken(db, undefined, now)).toBeNull();
    logout(db, res.token);
    expect(getUserForToken(db, res.token, now)).toBeNull();
    expect(db.select().from(adminSessions).where(eq(adminSessions.id, "x")).all()).toHaveLength(0);
  });

  it("locks out after repeated failures, even with the right password", async () => {
    const { db } = await memoryDb();
    createUser(db, { email: "a@b.co", passwordHash: await hashPassword("a-long-password-1") });
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      const r = await login(db, { email: "a@b.co", password: "nope", ip: "2.2.2.2", ttlHours: 1 }, now + i);
      expect(r).toEqual({ ok: false, reason: "invalid" });
    }
    const locked = await login(db, { email: "a@b.co", password: "a-long-password-1", ip: "3.3.3.3", ttlHours: 1 }, now + 10);
    expect(locked).toEqual({ ok: false, reason: "rate_limited" });
    const later = await login(db, { email: "a@b.co", password: "a-long-password-1", ip: "3.3.3.3", ttlHours: 1 }, now + 16 * 60 * 1000);
    expect(later.ok).toBe(true);
  });

  it("rejects unknown users without revealing which part was wrong", async () => {
    const { db } = await memoryDb();
    const r = await login(db, { email: "nobody@x.io", password: "whatever-long", ip: "9.9.9.9", ttlHours: 1 });
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });
});
