"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { login, logout, SESSION_COOKIE } from "@/lib/auth/auth";
import { assertSameOrigin, clientIp, sessionCookieOptions } from "@/lib/auth/guard";
import { getDb } from "@/lib/db/client";
import { getEnv } from "@/lib/env";

export interface LoginState {
  error?: string;
  email?: string;
}

const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(1024) });

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  try {
    await assertSameOrigin();
  } catch {
    return { error: "Request rejected.", email: "" };
  }
  const submittedEmail = typeof formData.get("email") === "string" ? (formData.get("email") as string).slice(0, 254) : "";
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Enter a valid email and password.", email: submittedEmail };

  const result = await login(getDb(), {
    ...parsed.data,
    ip: await clientIp(),
    ttlHours: getEnv().SESSION_TTL_HOURS,
  });
  if (!result.ok) {
    return {
      email: submittedEmail,
      error:
        result.reason === "rate_limited"
          ? "Too many failed attempts. Try again in 15 minutes."
          : "Invalid email or password.",
    };
  }
  (await cookies()).set(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresAt));
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  await assertSameOrigin();
  const store = await cookies();
  logout(getDb(), store.get(SESSION_COOKIE)?.value);
  store.delete(SESSION_COOKIE);
  redirect("/admin/login");
}
