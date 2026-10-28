# Viet Cinco

Mobile-first public leaderboard and matchup predictor for our doubles pickleball group, with secure admin-only player and match management. Ratings are **Cinco Points** computed by the independent **VCPR v1** algorithm. They are not DUPR, and the model is uncalibrated and needs checking against group results. See [VIET_CINCO_SPEC.md](./VIET_CINCO_SPEC.md) for the full specification and [PROGRESS.md](./PROGRESS.md) for milestone status.

**Stack:** Next.js 16 (App Router, TypeScript) · Tailwind CSS v4 + shadcn-style components · Motion · Recharts · SQLite (better-sqlite3) + Drizzle ORM · Zod · Vitest · Node 24 LTS.

## Quick start (local)

```bash
nvm use            # Node 24 (.nvmrc)
npm install
cp .env.example .env.local   # optional; defaults work locally
npm run db:migrate           # creates ./data/viet-cinco.sqlite (git-ignored)
npm run admin:create -- you@example.com   # prompts for a 12+ character password
npm run dev                  # http://localhost:3000
```

The database is also migrated automatically when the server starts, so `db:migrate` is optional.

Useful scripts:

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server, production build, production server |
| `npm test` | Unit, property, and integration tests (Vitest) |
| `npm run lint`, `npm run typecheck` | ESLint and TypeScript |
| `npm run db:generate` | Generate a Drizzle migration after editing `src/lib/db/schema.ts` |
| `npm run db:seed -- --csv roster.csv` | Preview a roster CSV; add `--yes` to import it after you verify names and ratings |
| `npm run db:seed -- --demo` | **Local dev only:** fake "Demo" players and matches |
| `npm run admin:create -- <email>` | Create an admin or reset their password |
| `npm run db:backup` | Take a verified, compressed online backup now |
| `npm run db:restore-check -- <file>` | Verify a backup (integrity, foreign keys, and replay equals stored ratings) |
| `npm run e2e` | Browser smoke test against a running server (needs `ADMIN_EMAIL`/`ADMIN_PASSWORD`; uses Playwright) |

## Configuration

All settings are environment variables, validated by Zod at first use (`src/lib/env.ts`). See [.env.example](./.env.example).

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_PATH` | `./data/viet-cinco.sqlite` | `/var/data/viet-cinco.sqlite` on Render |
| `APP_TIMEZONE` | `America/Los_Angeles` | Initial timezone for the "same local calendar day" rule and date display. After first start, the timezone lives in the rating config, so change it in **Admin → Settings**. Past matches keep their snapshot. |
| `ADMIN_BOOTSTRAP_EMAIL` / `_PASSWORD` | unset | Creates the first admin at startup only when no users exist. Remove them afterwards. |
| `SESSION_TTL_HOURS` | `168` | Admin session lifetime |
| `BACKUP_INTERVAL_HOURS` | `24` | `0` disables the in-process schedule |
| `BACKUP_RETENTION_COUNT` | `14` | Local compressed backups kept |
| `BACKUP_S3_*` | unset | Off-host upload to any S3-compatible bucket (S3, R2, B2, …) |

## How it works

- **Public** (no login): `/` leaderboard, `/predict`, `/players`, `/players/[id]`, `/matches`.
- **Admin** (`/admin/*`): players and CSV import, match entry with preview, correction or void, settings, export and backups.
- **Display precision:** Cinco Points and rating changes are shown with exactly 2 decimals (`3.229473` → `3.23`) through `formatCincoRating()` / `formatCincoDelta()` in `src/lib/format.ts`. This is presentation only: SQLite keeps full-precision values, every calculation (ratings, win probabilities, replay) uses them unrounded, and the admin JSON/CSV exports contain the raw stored values. Changing it needs no migration.
- **Rating engine** lives in pure TypeScript at `src/lib/rating/` (no UI or DB imports). The predictor page, server preview, and replay all call the same functions.
  - Expected point share `p = 1/(1+exp(-β(RA−RB)))`. The team-average shift is `clamp(K_eff·(s−p), ±0.08)`. It is split across the pair by reliability weight and is zero-sum.
  - Win probability is an exact dynamic program over rally states: **win by 1** is the chance of reaching the target first, **win by 2** also requires a two-point lead (closed form at deuce). The rule is stored per match (`matches.win_by`; new matches default to 1, rows from before the column existed are 2), is chosen with the same selector in match entry and the predictor, and is remembered per admin (`users.preferred_win_by`). The rating formula uses the actual final score and ignores the rule. **Point share is not win probability**, and the UI says so. No projected final score is shown in v1.
  - After three rated games of the same four players on the same local day, `K` is halved. Pair orientation is ignored.
- **Replay:** every confirmed rated match is replayed in canonical order `(played_at, created_at, id)` from immutable initial ratings, using each match's **stored config snapshot**. Changing settings never rewrites history. A correction, void, back-dated match, or initial-rating change replays inside one `BEGIN IMMEDIATE` transaction and writes only the rows that changed.
- **Atomicity and idempotency:** confirming a match writes the match, four rating changes, history, prediction snapshot, and audit record in one transaction. A UUID idempotency key makes double-submits harmless, and suspected duplicates (same four players, score, and a nearby time) need explicit acknowledgement.
- **Concurrency:** one Node instance, one connection, synchronous transactions. Edits also carry the row's `updated_at` so a stale form is rejected.
- **Audit trail:** player changes, match confirms, corrections, and voids (with reason and before/after values), and config publishes.

### Security model

- Every mutation is a server action wrapped by `adminAction()` (`src/lib/admin-action.ts`). It checks the same-origin `Origin` header, then the session, then validates input with Zod, so hidden buttons are not relied on. All public reads are server-side, read-only queries.
- Passwords use scrypt (N=2¹⁵, r=8, p=1) with per-password salts. Session tokens are 256-bit random values. Only a SHA-256 hash is stored, and the cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Sign-in is rate limited in the database (5 failures per 15 minutes per email and per client IP, then a 15-minute lockout). Unknown accounts take the same time as real ones.
- CSRF is covered by `SameSite=Lax`, Next.js's built-in server-action origin check, and our explicit `Origin` check. Security headers are set in `next.config.ts`. Avatar URLs must be http(s), and CSV exports neutralise spreadsheet formulas.

## Chế Độ Mất Nết 18+ (optional Vietnamese adult-humor mode)

A **presentation-only** mode. It changes labels and adds jokes; it never touches stored data, ratings, probabilities, exports or the rating engine. Full requirements: [VIET_CINCO_ROAST_MODE_COPILOT.md](./VIET_CINCO_ROAST_MODE_COPILOT.md).

- **Switching:** a compact `EN | 🔥 18+` switch sits in the header (desktop and phone). English is the default for first-time visitors. Choosing 🔥 18+ opens a one-time dialog; the mode turns on only after the visitor ticks *“Tôi trên 18 tuổi và muốn bật chế độ cà khịa”*. This is a content opt-in, not age verification. **“Trở Về Người Tử Tế”** (banner) or `EN` switches back in one click.
- **Persistence:** the visitor's device only, in `localStorage` (`vietcinco:language`, `vietcinco:roast-ack`). Nothing is stored on the server or in SQLite, and nothing is written during SSR. The server and first client render are always English, then the saved choice is applied after hydration. Writing only the language key does not bypass the dialog.
- **Content:** `src/i18n/vi-roast.ui.json` (107 UI strings) and `src/i18n/vi-roast.events.json` (255 lines in 27 buckets) are used unchanged. A few neutral extras the library lacks (the model caveat, “7 ngày”, “Đã chép!”) live in `src/i18n/vi-roast.extra.ts`. Anything without a Vietnamese string falls back to English; raw keys are never shown. `src/i18n/en.ts` is typed `Record<UiKey, string>`, so a key added to the JSON fails the build until English exists too.
- **Lazy loading:** the Vietnamese strings and all jokes are dynamic-imported (`src/i18n/catalog.ts`) only after opt-in. English visitors never download them (verified in `e2e/roast.mjs`).
- **How lines are chosen** (`src/lib/roast/`): `classify-event.ts` turns existing facts into event keys using the spec's thresholds (game win probability for predictions, the **saved pre-match** win probability for upsets, the stored precise rating delta, streaks of 3+, partner chemistry after 8+ shared matches against the saved expectations). `pick-message.ts` picks deterministically (FNV hash of match/team/event, so a reload is stable and SSR never disagrees); **Chửi Nữa Đi** advances to the next line, wraps, and makes no network request. No randomness, API or AI.
- **Accuracy guards:** a few provided lines state a fact (“11–0!”, “Thua một điểm”). They are unchanged but only eligible when true for the described result. A plain win is only called “expected” when the saved prediction favoured the winner, and an upset is never claimed without a saved probability.
- **Admin:** admin pages can use the funny labels, but approval and destructive actions show the plain English next to them (e.g. “Rút Lui Chiến Thuật (Sign out)”), and validation and audit text stays English.
- **Not covered by the provided library** (stay English in both modes): filter-form field labels, summary tiles and settings pages, pagination page counts, status badges such as “Unrated”, and aria-labels of the +/- score buttons.
- **Tests:** `tests/roast-*.test.ts(x)` (content integrity, classifier, picker, every target × rule × score, SSR output in both modes, localStorage store), plus browser checks: `npm run e2e:roast` (opt-in, persistence, lazy loading, no-network roasting, DB untouched, admin, 360px) and `npm run e2e:parity` (`A=<old url> B=<new url>`: English pages identical before and after).

## Database and migrations

Schema: `src/lib/db/schema.ts` (Drizzle). Migrations: `drizzle/` (committed). Workflow:

```bash
# edit schema.ts
npm run db:generate         # creates drizzle/000N_*.sql — review and commit it
npm test                    # migrations are applied to a fresh DB in tests
```

CI fails if `schema.ts` differs from the committed migrations.

At **runtime startup** (`src/instrumentation.ts` → `src/lib/init.ts`) the app validates the migration journal, takes a consistent pre-migration backup (`<db dir>/backups/pre-migrate-*.sqlite`) when the DB already has data and migrations are pending, applies them, then runs `integrity_check` and `foreign_key_check`. This happens at runtime because Render's build and pre-deploy steps cannot access the mounted disk. SQLite runs with WAL, `busy_timeout=5000`, and `foreign_keys=ON`.

## Deploying on Render

1. Create a **paid** Web Service from this repo (Blueprint: [render.yaml](./render.yaml)): Node runtime, `NODE_VERSION=24`, **one instance**, and a persistent disk mounted at `/var/data`.
2. Set secrets in the dashboard: `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` (12+ characters), and optionally the `BACKUP_S3_*` values.
3. Health check path is `/api/health` (returns 200 only when SQLite is readable, else 503). Enable Render's failed-deploy and service-down notifications for alerting. Logs are structured JSON on stdout (`level: error` lines are failures), so route them with a Render log stream if you want alerts on them.
4. Deploy, sign in at `/admin/login`, then **remove the bootstrap password env vars**.
5. Import the roster after human verification:
   ```bash
   # In a Render shell, or via Admin → Players → Import CSV
   npm run db:seed -- --csv roster.csv          # preview
   npm run db:seed -- --csv roster.csv --yes    # import
   ```

Limits: a single service plus disk means no horizontal scaling and brief downtime during deploys. If availability or scale needs grow, move to hosted Postgres (the data access is confined to `src/lib/` services and queries).

### Backups and restore

- The app takes a scheduled backup (default every 24 h) with SQLite's **online backup API** (never a raw copy of a live WAL file). It verifies the snapshot (`integrity_check`, `foreign_key_check`), gzips it to `/var/data/backups/viet-cinco-<timestamp>.sqlite.gz`, prunes old copies, and, if `BACKUP_S3_*` is set, uploads it off-host. Status and a "Run backup now" button are in **Admin → Settings**. Also enable Render disk snapshots as a second layer.
- **Test a restore regularly** (on a scratch instance or locally):
  ```bash
  npm run db:restore-check -- path/to/viet-cinco-….sqlite.gz   # must print BACKUP OK
  ```
- **Restore for real:** stop or suspend the service, then in a shell on the disk run:
  ```bash
  gunzip -c /var/data/backups/viet-cinco-<ts>.sqlite.gz > /var/data/restore.sqlite
  rm -f /var/data/viet-cinco.sqlite-wal /var/data/viet-cinco.sqlite-shm
  mv /var/data/viet-cinco.sqlite /var/data/viet-cinco.sqlite.bad && mv /var/data/restore.sqlite /var/data/viet-cinco.sqlite
  ```
  Resume the service. Pending migrations apply on startup. To recover from off-host storage, download the object first.

### Production smoke test

```bash
BASE_URL=https://<your-service>.onrender.com ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run e2e
BASE_URL=https://<your-service>.onrender.com npm run e2e:layout   # no horizontal scroll at phone width
```

The e2e script creates a test player and one match, so run it only against a scratch instance or remove that data afterwards (void the match; deactivate the player).

## Testing

`npm test` covers: exact win-probability DP (against an independent grid propagation), property tests (zero-sum, team swap symmetry, caps, valid game endings), repeated-matchup policy, deterministic replay, config snapshot immutability, atomic confirm and rollback, idempotency, drafts, corrections and voids, back-dating, initial-rating replay with audit, CSV import, auth and rate limiting, migrations, and backup behaviour.

## Known limitations (v1)

- The predictor is a simplified, uncalibrated model. Pre-game prediction snapshots are logged with each confirmed match (`prediction_snapshots`) so calibration (Brier score, probability buckets) can be added later.
- Play sessions (`sessions` table) exist in the schema, but there is no UI yet.
- Unrated matches count toward win–loss but never move ratings. Drafts and voided matches are excluded from public pages.