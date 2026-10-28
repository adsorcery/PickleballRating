# Viet Cinco — Progress

## M1 — Foundation & security ✅
- Next.js 16 (App Router, TS), Tailwind v4, shadcn-style UI primitives, Drizzle + better-sqlite3.
- Full schema + initial migration (`drizzle/0000_init.sql`); runtime migrations with pre-migration online backup (`src/instrumentation.ts` → `src/lib/init.ts`).
- Session-based admin auth: scrypt hashing, hashed session tokens, HTTP-only cookie, DB-backed login rate limit, origin check on mutations (`src/lib/auth`, `src/lib/admin-action.ts`).
- `/api/health` checks SQLite read access.
- Tests: migrations, persistence, pragmas, constraints, auth/rate-limit (`tests/`).

## M2 — Ratings engine ✅
- Pure TypeScript in `src/lib/rating/` (config, engine, predictor, validation, replay) plus `src/lib/time.ts`.
- Exact DP win probability (checked against an independent grid propagation), zero-sum weighted distribution, team-average cap, repeated-matchup discount (orientation-independent, local-day aware), deterministic canonical replay using each match's config snapshot.
- Property + fixture tests in `tests/rating-*.test.ts`.

## M3 — Player admin + initial import ✅
- Create/edit/deactivate players, required initial Cinco Point, optional DUPR/avatar/notes, case-insensitive unique names, soft delete only.
- CSV import with preview, validation and duplicate detection (`src/lib/csv.ts`, `src/lib/services/players.ts`); `npm run db:seed -- --csv` previews before importing (no roster was supplied, so none is bundled; `--demo` is dev-only).
- Changing an initial rating with history needs confirmation + reason, shows the affected-match count, replays everything and writes an audit record.

## M4 — Match entry + public data ✅
- Preview → confirm flow, drafts, correct and void with reasons, optimistic-concurrency checks, idempotency keys, duplicate warnings, unrated matches (`src/lib/services/matches.ts`, `replay-store.ts`).
- All changes replay in one immediate transaction and write only the rows that changed; every replay uses each match's stored config snapshot.
- Public leaderboard (7/30-day trends), match history with filters, player profiles (chart, partners, opponent diversity only when data supports it).

## M5 — Predictor + UI polish ✅
- Public predictor with searchable ARIA combobox pickers (no duplicate selections), 11/15/21 selector, animated probability bar (honours reduced motion), point-share vs win-probability explanation, empty states.
- The predictor calls the same pure functions as the server. Mobile score steppers and a no-horizontal-scroll check at 360px.

## M6 — Production deployment ✅ (repo side)
- `render.yaml` (paid web service, one instance, disk at `/var/data`), runtime migrations with pre-migration backup, `/api/health`, structured JSON error logs.
- Scheduled online-backup API snapshots (verified, gzipped, pruned, optional S3-compatible off-host upload), `db:restore-check`, admin export (JSON/CSV), CI workflow incl. migration drift check, README with setup/deploy/backup/restore docs.
- Verified locally against a production build: restart persistence, admin-only mutations (including rejection of a mutation after the session is cleared), browser smoke test (`npm run e2e`), mobile layout check.
- **Not done here (needs your Render account):** actual deployment, configuring the off-host bucket credentials, and a restore drill on a Render test instance.

## Win by 1 / Win by 2 ✅
- `matches.win_by` (1|2) stored per match; migration `0001_win_by.sql` is additive (`ALTER TABLE … ADD COLUMN`, no table rebuild). Existing rows are backfilled to 2, so history is validated and replayed exactly as before. New matches default to 1.
- `users.preferred_win_by` remembers each admin's choice (updated only when changing the rule on the new-match form).
- Score validation, preview, confirmation, correction, replay and the predictor all take the rule (`src/lib/rating/validation.ts`, `predictor.ts`); the predictor uses the same `WinBySelector` component and constants as match entry. The rating formula is unchanged.
- Tests: exhaustive score oracle for every target × rule, closed-form win-by-1 probability, acceptance case (11–10 win by 1), legacy migration test proving stored matches, ratings and history are byte-identical and a replay changes nothing.
