import "server-only";
import { z } from "zod";
import { AuthorizationError, requireAdminAction } from "@/lib/auth/guard";
import type { AdminUser } from "@/lib/auth/auth";
import { fail, ServiceError, type ActionResult } from "@/lib/result";

export function flattenZod(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/**
 * Wraps a server action: authenticates the admin (and checks origin) BEFORE any work,
 * validates input with Zod, and converts failures into typed results.
 */
export async function adminAction<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  handler: (admin: AdminUser, data: z.output<S>) => Promise<ActionResult<T>> | ActionResult<T>,
): Promise<ActionResult<T>> {
  try {
    const admin = await requireAdminAction();
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return fail("Please correct the highlighted fields.", "validation", flattenZod(parsed.error));
    }
    return await handler(admin, parsed.data);
  } catch (err) {
    if (err instanceof AuthorizationError) return fail("You are not authorized to do that.", "unauthorized");
    if (err instanceof ServiceError) return fail(err.message, err.code, err.fieldErrors);
    console.error(
      JSON.stringify({ level: "error", msg: "admin action failed", error: err instanceof Error ? err.stack : String(err) }),
    );
    return fail("Something went wrong. Nothing was saved. Please try again.", "internal");
  }
}

/** Parses FormData into a plain object, keeping the last value for repeated keys. */
export function formDataToObject(fd: FormData): Record<string, FormDataEntryValue> {
  const out: Record<string, FormDataEntryValue> = {};
  for (const [k, v] of fd.entries()) out[k] = v;
  return out;
}
