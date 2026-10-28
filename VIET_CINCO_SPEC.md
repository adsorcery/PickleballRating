# Viet Cinco — Product Requirements & Implementation Plan (v1.0)

**Status:** Approved baseline specification  
**Primary goal:** A mobile-first public doubles pickleball leaderboard and matchup predictor with secure admin-only player and match management.  
**Stack:** Next.js App Router (TypeScript), Tailwind CSS, shadcn/ui, Motion, Recharts, SQLite, Drizzle ORM, better-sqlite3, Render paid Web Service + persistent disk.

## 1. Decisions (do not override)

- Anyone can read the leaderboard, player profiles, match history, and use the predictor without authentication.
- Only authenticated administrators can add, edit, or deactivate players, import CSV, submit/edit/void matches, or modify configuration.
- Admin saves a match as **confirmed** after preview; saving automatically and atomically updates ratings and history. Drafts have no effect.
- Player creation takes a required **initial Cinco Point**, distinct from the computed **current Cinco Point**. New players join the leaderboard and predictor immediately, with provisional status.
- DUPR is an optional reference field and is never automatically blended into Cinco.
- Use unique player IDs; never use display names as relational keys. Soft-delete players with histories.
- Baseline is approximately 17 players; design for hundreds, with easy imports and future growth.

## 2. Main routes

| Route | Access | Purpose |
|---|---|---|
| `/` | Public | Leaderboard, trends, recent results |
| `/predict` | Public | Four-player doubles matchup; win probability for 11/15/21, predicted point share |
| `/players/[id]` | Public | Current/initial rating, confidence, historical chart, W-L, recent games, partners |
| `/matches` | Public | Confirmed match history, search/filter |
| `/admin/login` | Public | Secure admin sign-in |
| `/admin` | Admin | Summary and pending drafts |
| `/admin/players` | Admin | Create/update/deactivate players, CSV import, opening ratings |
| `/admin/matches/new` | Admin | Enter doubles score, preview changes, confirm atomically |
| `/admin/matches/[id]` | Admin | Correct or void result and replay affected ratings |
| `/admin/settings` | Admin | Rating configuration, algorithm versions, export and backup status |

Write queries as server-side read-only operations; **authorize every mutation on the server** (server actions or route handlers). Do not depend on hidden buttons for security. Rate-limit admin sign-in, use secure HTTP-only session cookies, hash credentials using an appropriate password hashing algorithm, and require CSRF defenses when applicable.

## 3. Mathematical rating model (VCPR v1)

All calculations use unrounded floating-point intermediate values. Display exactly 2 decimals (via `formatCincoRating()` in `src/lib/format.ts`; presentation only); persist >= 6 decimals and always calculate with full precision. Tests must use numerical tolerances.

### Team ratings and scoring share

For ratings `r1, r2` vs `r3, r4`:

- `RA = (r1 + r2) / 2`, `RB = (r3 + r4) / 2`.
- `p = 1 / (1 + exp(-beta * (RA - RB)))`, with initial `beta = 2.6`.
- Interpret `p` as Team A's **expected share of points**, not its probability of winning the game.
- With actual score `a:b`, `s = a / (a+b)`.
- Team-average shift `d = clamp(K_eff * (s-p), -0.08, +0.08)`; base `K = 0.35`.
- For valid games, a+b > 0, scores are non-negative integers, and the chosen target is 11, 15, or 21 with a lead of >= 2, ending as soon as rules permit. Admin can mark a retirement/forfeit as **unrated**, but do not feed that result to the algorithm.

### Individual reliability and zero-sum distribution

Weights are assigned by **eligible rated games in trailing 180 days before this match**:

- 0–4 games: 1.50
- 5–14: 1.25
- 15–29: 1.00
- 30+: 0.80

If Team A players have weights `w1,w2`, their changes are `2*d*w1/(w1+w2)` and `2*d*w2/(w1+w2)`. Team B changes are `-2*d*w3/(w3+w4)` and `-2*d*w4/(w3+w4)`.

These sum to zero before floating-point rounding. Cap is **team-average** 0.08, not necessarily an individual cap. Show this clearly in UI. Initial ratings are estimates; mark fewer than 15 total eligible games as provisional. Display the *normal* rating scale 2–6 but do not clip stored ratings, which would break zero-sum transfer. Flag out-of-range results for admin review.

### Repeated matchup adjustment

For exact repeated four-player sets on the same local calendar day, count the first three rated games with `K_eff=K`; subsequent games use `K_eff=K*0.5` to discourage gaming. Count games regardless of pair orientation; define and test this consistently. Do not retroactively apply a different K to old games when changing algorithm settings.

### Chronological replay and corrections

Record canonical ordering `(played_at, created_at, match_id)`; clearly surface admin edits that change match time. For a corrected/voided match or changed initial player rating, rebuild ratings and history by replaying **all confirmed rated matches in canonical order** from immutable initial player ratings, using each match's stored algorithm version/config snapshot. Recompute projected win probabilities at that historical moment. Run under a serialized database write transaction; block concurrent admin updates. Maintain audit trail of old/new values, actor, time, reason.

### IMPORTANT: Predictor — point share is not win probability

Given each rally independently won by Team A with probability `p`, estimate probability to win a game to `n` by 2. Use a finite-state dynamic program / exact combinatorial formula (no Monte Carlo required):

- Boundary: A wins if `a>=n && a-b>=2`; B wins if `b>=n && b-a>=2`.
- Recurrence: `W(a,b)=p*W(a+1,b)+(1-p)*W(a,b+1)` before deuce.
- At `(n-1,n-1)` (deuce): `W = p^2/(p^2+(1-p)^2)`.
- Start from `(0,0)`; use memoization. Clamp output in [0,1] only to absorb floating-point noise.
- This assumes rally outcomes are independent and is a deliberately simplified, **uncalibrated** model. Do not present probabilities as proven predictions.
- For the UI, show Team A probability, Team B complement, expected point share, format, and team average. For a projected final score, either calculate a properly specified conditional expected score via dynamic programming, clearly label an illustrative score, **or omit projected score in v1**. Do not derive an exact final score simply by multiplying `p` by 11.
- A 50/50 game (equal team-average rating) yields 50/50 game win probability.
- Future: log **pre-game** prediction snapshots for calibration (Brier score, probability buckets, error by team disparity).

## 4. Player management

Create form: display name (required), initial Cinco Point (required, decimal, suggested 2.00–6.00), optional DUPR, optional avatar, optional notes. Persist `initial_cinco_rating` and `current_cinco_rating` separately. On create, set current = initial and matches played = 0; mark provisional. Name edits should not touch ratings. For players with confirmed history, changes to `initial_cinco_rating` require an explicit admin confirmation, reason, audit record and full replay; show affected-match count. Never hard-delete historical participants. Provide CSV preview, validation and duplicate detection before bulk importing.

## 5. Match submission and score validation

Select exactly 4 distinct active players. Place two on each team. Choose match date/time, format to 11/15/21, final scores. Verify no ties and valid win-by-2 ending. Show before submit: pre-match averages, expected point shares, match-winning probability, final scores, projected rating changes for each player, provisional weighting, repeated-match discount, post-match ratings. Confirm action writes match + all four rating changes + current player ratings in a single transaction. Implement an idempotency key to prevent double-submit; additionally warn on suspected same-four/score/time duplicates. Admin can save as draft; drafts are excluded from public pages and calculations.

## 6. Data model (Drizzle/SQLite)

- `players`: id, display_name, initial_cinco_rating, current_cinco_rating, dupr_rating nullable, avatar_url nullable, active, created_at, updated_at.
- `users`: id, email UNIQUE, password_hash, role (`admin`), created_at, last_login_at.
- `sessions`: id, name, started_at, ended_at nullable (optional in v1; can defer UI).
- `matches`: id, session_id nullable, played_at, created_at, updated_at, format_target, score_a, score_b, status (`draft|confirmed|void`), rated boolean, algorithm_version, config_snapshot JSON, predicted_point_share_a, predicted_win_prob_a, entered_by, confirmed_at, idempotency_key UNIQUE, notes nullable.
- `match_players`: match_id, player_id, team (`A|B`), position (1|2), pre_rating, delta_rating, post_rating; UNIQUE(match_id,player_id); CHECK team/position.
- `rating_history`: id, player_id, match_id, rating_before, rating_after, delta, played_at; UNIQUE(player_id,match_id).
- `rating_config_versions`: id, version, beta, K, maximum_team_delta, weights JSON, matchup_discount JSON, effective_at.
- `audit_logs`: id, actor_id, entity_type, entity_id, action, before_json, after_json, reason, created_at.
- `prediction_snapshots`: id, match_id nullable, input JSON, probability_a, created_at (optional; retain only match-linked snapshots initially, avoid unbounded anonymous storage).

Indexes for matches by `(status, played_at, id)`, history by `(player_id, played_at)`, player name, and match-player membership. Enforce foreign keys.

## 7. Public visual design

- Modern, welcoming, mobile-first sports interface; generous spacing, large touch targets, high contrast, accessible keyboard controls and labels.
- Brand: **Viet Cinco**; main CTA `Predict a Match`; public nav `Leaderboard`, `Predict`, `Players`, `Matches`.
- Leaderboard defaults to current rating descending; optionally show 7/30-day trends and provisional badge.
- Predictor: four searchable player controls, live probability visualization, n=11/15/21 selector, explain predicted point share vs win probability.
- Player profile: initial/current rating, rating chart, wins/losses, recent matches, frequent partners and opponent diversity where data supports it. Hide metrics lacking sufficient data rather than fabricate them.
- Admin: clear save/confirm flow, optimistic feedback only after successful server writes; meaningful validation and errors.
- Motion microinteractions are subtle and honor `prefers-reduced-motion`.

## 8. Render deployment and reliability

- Render **paid Web Service** (Node runtime) + **persistent disk** mounted at `/var/data`.
- `DATABASE_PATH=/var/data/viet-cinco.sqlite`; local development uses `./data/viet-cinco.sqlite` in ignored path.
- `better-sqlite3` + Drizzle with WAL mode, `busy_timeout`, foreign_keys ON, one Node application instance, serialized rating writes.
- Ensure **runtime startup** applies validated database migrations and takes a pre-migration backup. Render build and pre-deploy commands cannot access the mounted disk, so migrations must not assume they can.
- Configure robust off-host backups using SQLite's consistent online backup procedure; periodically test restoration. Do not simply copy a live WAL database file as an unsafe backup. Use Render disk snapshots as extra protection, not the only backup. Store secrets via Render environment variables.
- Configure health endpoint that checks SQLite read access, production error logs and alerting. Single service + disk means no horizontal scaling and brief deployment downtime. Upgrade to hosted Postgres if availability/scaling needs change.
- Use pinned supported Node.js LTS, production build, schema migration CI and integration tests.

## 9. Development milestones (implementation sequence)

### M1 — Foundation & security
- Scaffold Next.js TypeScript, Tailwind, shadcn/ui, Drizzle SQLite; install test suite; implement session-based admin authentication and guarded mutations.
- Drizzle schema/migrations, env validation, local seed support.
**Acceptance:** public pages readable; admin routes/mutations reject unauthenticated requests; DB persists after restart.

### M2 — Ratings engine (pure TypeScript, no UI dependencies)
- Build expected point share, probability DP, score validation, per-player K weighting, repeat-match handling, deterministic replay.
- Unit/property tests: swapping teams complements results, `p=0.5 => W=0.5`, sum of rating deltas zero, valid game endings, repeated-match policy, deterministic replay.
**Acceptance:** tests pass on edge cases, tie handling and known numeric fixtures.

### M3 — Player admin + initial import
- Create/edit/deactivate; custom initial point; optional DUPR; CSV import; seed provided roster after human verification of names/ratings.
**Acceptance:** creating a player doesn't modify existing ratings; appears in public selections immediately; edit initial rating triggers audited replay.

### M4 — Match entry + public data
- Admin match preview/confirm/correct/void; atomic updates; live leaderboard; match history and player profiles.
**Acceptance:** four-player updates atomic; duplicate submissions don't multiply ratings; correction replays all affected subsequent matches.

### M5 — Predictor + UI polish
- Public four-player predictor, format selection, responsive charts, accessible UI, mobile score entry; include model caveats and empty states.
**Acceptance:** no duplicate selections; probabilities sum to 100%; results match backend function for every format.

### M6 — Production deployment
- Render paid web + disk, runtime migrations, backup/restore procedure, seed import, production smoke tests, admin security hardening, monitoring.
**Acceptance:** deploy/restart preserves matches; recover backup on test instance; no public access to writes; production mobile tests pass.

### Later (not launch blockers)
- Automated balanced teams and rotations, session scheduling, partner chemistry, competition seasons, shareable game cards, reliability calibration, optional player accounts.

## 10. Copilot implementation instructions

1. Build incrementally M1→M6, with small tested commits and an updated `PROGRESS.md` after each milestone.
2. Keep the rating engine in pure functions under `src/lib/rating/`; no duplicate formula in client and server.
3. Use Zod schemas for all inputs, authorization checks on **every** mutation, transactions for result processing, and typed API returns.
4. Do not fabricate player statistics or display projected rating changes as finalized before commit.
5. Keep constants versioned/configurable, but changing them must never silently rewrite historical ratings.
6. Prefer straightforward code to elaborate microservices. Document setup, environment, migrations, testing, deployment, and backup restoration in README.
7. Do not claim official DUPR equivalence. The Viet Cinco algorithm is independent and requires calibration against group data.
