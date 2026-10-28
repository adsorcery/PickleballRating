import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { getUserForToken, SESSION_COOKIE, type AdminUser } from "./auth";

export class AuthorizationError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function getCurrentAdmin(): Promise<AdminUser | null> {
  const store = await cookies();
  return getUserForToken(getDb(), store.get(SESSION_COOKIE)?.value);
}

/** For pages and layouts: redirect unauthenticated visitors to the login page. */
export async function requireAdminPage(): Promise<AdminUser> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || h.get("x-real-ip") || "unknown";
}

/** Defence in depth on top of SameSite cookies and Next's own server-action origin check. */
export async function assertSameOrigin(): Promise<void> {
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!origin || !host) throw new AuthorizationError("Missing origin");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AuthorizationError("Invalid origin");
  }
  if (originHost !== host) throw new AuthorizationError("Cross-origin request rejected");
}

/** Every server-side mutation must call this first. */
export async function requireAdminAction(): Promise<AdminUser> {
  await assertSameOrigin();
  const admin = await getCurrentAdmin();
  if (!admin) throw new AuthorizationError();
  return admin;
}

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: getEnv().NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}
