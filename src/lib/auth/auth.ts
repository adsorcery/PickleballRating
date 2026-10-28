import { and, eq, gt, lt } from "drizzle-orm";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Executor } from "@/lib/db/client";
import { adminSessions, authRateLimits, users } from "@/lib/db/schema";
import { verifyAgainstDummy, verifyPassword } from "./password";

export const SESSION_COOKIE = "vc_session";

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;

export interface AdminUser {
  id: string;
  email: string;
  role: "admin";
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function limitKeys(email: string, ip: string): string[] {
  return [`email:${normalizeEmail(email)}`, `ip:${ip}`];
}

export function checkLoginAllowed(db: Executor, email: string, ip: string, now = Date.now()): boolean {
  for (const key of limitKeys(email, ip)) {
    const row = db.select().from(authRateLimits).where(eq(authRateLimits.key, key)).get();
    if (row?.lockedUntil && row.lockedUntil.getTime() > now) return false;
  }
  return true;
}

function recordFailure(db: Executor, key: string, now: number) {
  const row = db.select().from(authRateLimits).where(eq(authRateLimits.key, key)).get();
  if (!row || now - row.windowStart.getTime() > WINDOW_MS) {
    db.insert(authRateLimits)
      .values({ key, failures: 1, windowStart: new Date(now), lockedUntil: null })
      .onConflictDoUpdate({
        target: authRateLimits.key,
        set: { failures: 1, windowStart: new Date(now), lockedUntil: null },
      })
      .run();
    return;
  }
  const failures = row.failures + 1;
  db.update(authRateLimits)
    .set({ failures, lockedUntil: failures >= MAX_FAILURES ? new Date(now + LOCKOUT_MS) : row.lockedUntil })
    .where(eq(authRateLimits.key, key))
    .run();
}

function clearFailures(db: Executor, email: string) {
  db.delete(authRateLimits).where(eq(authRateLimits.key, `email:${normalizeEmail(email)}`)).run();
}

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; user: AdminUser }
  | { ok: false; reason: "rate_limited" | "invalid" };

export async function login(
  db: Executor,
  input: { email: string; password: string; ip: string; ttlHours: number },
  now = Date.now(),
): Promise<LoginResult> {
  const email = normalizeEmail(input.email);
  if (!checkLoginAllowed(db, email, input.ip, now)) return { ok: false, reason: "rate_limited" };

  const user = db.select().from(users).where(eq(users.email, email)).get();
  const valid = user ? await verifyPassword(input.password, user.passwordHash) : await verifyAgainstDummy(input.password);
  if (!user || !valid) {
    for (const key of limitKeys(email, input.ip)) recordFailure(db, key, now);
    return { ok: false, reason: "invalid" };
  }

  clearFailures(db, email);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now + input.ttlHours * 3600 * 1000);
  db.insert(adminSessions)
    .values({ id: hashToken(token), userId: user.id, createdAt: new Date(now), expiresAt })
    .run();
  db.update(users).set({ lastLoginAt: new Date(now) }).where(eq(users.id, user.id)).run();
  db.delete(adminSessions).where(lt(adminSessions.expiresAt, new Date(now))).run();
  return { ok: true, token, expiresAt, user: { id: user.id, email: user.email, role: "admin" } };
}

export function getUserForToken(db: Executor, token: string | undefined, now = Date.now()): AdminUser | null {
  if (!token) return null;
  const row = db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(adminSessions)
    .innerJoin(users, eq(users.id, adminSessions.userId))
    .where(and(eq(adminSessions.id, hashToken(token)), gt(adminSessions.expiresAt, new Date(now))))
    .get();
  return row ?? null;
}

export function logout(db: Executor, token: string | undefined) {
  if (!token) return;
  db.delete(adminSessions).where(eq(adminSessions.id, hashToken(token))).run();
}

export function createUser(db: Executor, input: { email: string; passwordHash: string }): string {
  const id = randomUUID();
  db.insert(users)
    .values({ id, email: normalizeEmail(input.email), passwordHash: input.passwordHash, role: "admin", createdAt: new Date() })
    .run();
  return id;
}

export function countUsers(db: Executor): number {
  return db.select({ id: users.id }).from(users).all().length;
}
