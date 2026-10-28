# Viet Cinco — Progress

## M1 — Foundation & security ✅
- Next.js 16 (App Router, TS), Tailwind v4, shadcn-style UI primitives, Drizzle + better-sqlite3.
- Full schema + initial migration (`drizzle/0000_init.sql`); runtime migrations with pre-migration online backup (`src/instrumentation.ts` → `src/lib/init.ts`).
- Session-based admin auth: scrypt hashing, hashed session tokens, HTTP-only cookie, DB-backed login rate limit, origin check on mutations (`src/lib/auth`, `src/lib/admin-action.ts`).
- `/api/health` checks SQLite read access.
- Tests: migrations, persistence, pragmas, constraints, auth/rate-limit (`tests/`).
