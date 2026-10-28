# Viet Cinco — “Chế Độ Mất Nết 18+” Implementation Specification

## Mission

Implement an **opt-in, Vietnamese adult-humor UI mode** in the **existing** Next.js + SQLite + Render Viet Cinco app. This is a localization + personality layer, NOT a new rating system. Keep the existing public leaderboard and predictor, and admin-only player/match management. Preserve every existing record and all numerical calculations.

**Assets delivered with this document**:

- `vi-roast.ui.json`: 107 Vietnamese UI text replacements.
- `vi-roast.events.json`: 255 unique, original Vietnamese lines in 27 event buckets.

If a UI key is missing, **fall back to the current English UI**; never show raw dotted localization keys. The JSON files are ready for inclusion in your repo. You may refactor them into typed TS exports without changing the strings.

## Desired personality

Vietnamese-speaking adult friends roasting **pickleball play and on-court behavior**: sarcastic, irreverent, colloquial, a little crude; no stiff literal translation. Incorporate *ăn hành, gáy, mõm, ông thần, gà, đổ thừa, đánh như cái nồi*. Avoid repetitive insults. The 18+ mode may contain mild adult profanity where it is organically funny, but do not turn every message into swearing.

**Guardrails:** jokes about scores, errors, inflated ego, predictions, partner coordination and mishaps only. Do not joke about ethnicity/nationality, sexual orientation, religion, disability, age, physical appearance, medical or family circumstances, actual personal trauma, or protected traits. Do not use threats or targeted harassment. Don’t publicly show adult-joke content until the visitor opts in. The official player name remains exactly as entered; never translate, nick-name or alter names in the database.

## Existing decisions that must remain unchanged

1. Public leaderboard, match predictor, history and profiles without authentication.
2. Only admins add/edit/deactivate players, submit/confirm/edit/void matches and change settings.
3. Confirmed matches update all four ratings automatically using the existing model.
4. New players can always be added with admin-specified initial Cinco Points.
5. Show Cinco ratings using **2 decimals**, but **retain full precision in calculations and SQLite**.
6. Match entry and predictor support **win by 1 and win by 2**; games to 11/15/21, with existing historical scores untouched.
7. Do not alter production database schema unless necessary, and never reset or reseed existing player/match tables.

## Modes / language switcher

Modes are:
- `en`: current English/default UI (must remain available)
- `vi`: optional neutral Vietnamese mode ONLY if already implemented, otherwise defer and omit it from the selector for now
- `vi-roast`: Chế Độ Mất Nết 18+ / “🔥 Mất Nết 18+”

Add switcher in desktop navbar and mobile navigation, accessible on leaderboard, predictor, match history and player profiles. Admin can switch too, but admin security/audit messages must stay unambiguous even in the funny mode.

**Default = `en`** for first-time visitors. For `vi-roast`, require user to intentionally select it and accept an inline acknowledgement (“Tôi trên 18 tuổi và muốn bật chế độ cà khịa”) before showing its content. Persist local preference and acknowledged status in localStorage (e.g., `vietcinco:language`, `vietcinco:roast-ack`). Respect SSR/CSR hydration: render English until client preference is read, or implement a cookie-backed preference that avoids flicker. Never write localStorage during SSR. Provide one-click switch back to English: “Trở Về Người Tử Tế”. Do not use actual age verification claims—this is an adult-content opt-in/acknowledgement, not identity/age verification.

Do not make selected mode or funny phrase a persistent user/player property; it is each visitor's device/session preference. Do not change raw data/API fields or exports; the funny text is **presentation only**.

## Suggested code locations (adapt to repository structure)

```
src/
  i18n/
    en.ts                    # existing current labels or extracted catalog
    vi-roast.ui.json         # provided file
    vi-roast.events.json     # provided file
    types.ts                 # LocaleMode, TranslationKey, RoastEvent
    use-locale.ts           # preference, hydration, opt-in
    t.ts                    # typed translation accessor with English fallback
  lib/roast/
    classify-event.ts       # turn game/rating/prediction facts into event keys
    pick-message.ts         # deterministic/stable picker; no network/API/AI
    templates.ts            # optional safe placeholder templating
  components/
    locale-switcher.tsx
    roast-message.tsx
    roast-again-button.tsx
```

Don't overwrite existing file structures; use the project's conventions and existing localization solution if one is already present. Client bundle should not load all event jokes for visitors who stay in English: lazy-import `vi-roast.events.json` on funny mode / event component use.

## Localization architecture

Use typed keys and a `t(key)` method. Preserve all technical units, numeric values, player names, timestamps, rating changes, and scores. Use **Vietnamese text labels only**, not changes to data.

For example:

```ts
export type LocaleMode = 'en' | 'vi-roast';

export function formatCincoRating(value: number): string {
  return value.toFixed(2);
}

// On the leaderboard, the stored number 3.229473 MUST still display 3.23
// in BOTH languages. The number 3.229473 remains stored unchanged.
```

Use suitable Vietnamese font coverage (e.g., current site font if Vietnamese diacritics render well). Preserve keyboard accessibility, labels, screen-reader meaning, and responsive layouts. Funny labels may be longer, so test mobile overflow and button widths. For critical destructive actions include a clear secondary/plain description such as “Xóa dấu vết (Delete)” and retain confirmation modals.

## Event classification rules — score-based and context-aware

**Important:** derive all triggers from existing rating engine result and match data. Do not infer match winning probability from *scoring share* directly; use the app's actual **game win probability**, which must honor to-11/15/21 and win-by-1/win-by-2. Never recalculate or overwrite saved probabilities or ratings just to display jokes. Use server-provided pre-match snapshots if present; do not use post-match ratings to decide whether an upset occurred.

Define event schema such as:

```ts
type RoastEvent =
  | 'prediction_heavy_favorite' | 'prediction_favorite' | 'prediction_even'
  | 'prediction_underdog' | 'prediction_longshot'
  | 'upset_win' | 'expected_win' | 'close_win' | 'blowout_win'
  | 'close_loss' | 'blowout_loss' | 'bagel_winner' | 'bagel_loser'
  | 'rating_gain_small' | 'rating_gain_large'
  | 'rating_drop_small' | 'rating_drop_large'
  | 'win_streak' | 'loss_streak' | 'new_player' | 'provisional'
  | 'balanced_match' | 'partner_chemistry_good' | 'partner_chemistry_bad'
  | 'no_matches' | 'error_safe' | 'roast_again';
```

Use these initial thresholds, grouped to distinguish context and avoid contradictory claims:

**Prediction from the perspective of the currently described team** (`pWin` is a number in [0,1]):

- `>= 0.85`: `prediction_heavy_favorite`
- `>= 0.60`: `prediction_favorite`
- `> 0.40 && < 0.60`: `prediction_even`
- `> 0.15 && <= 0.40`: `prediction_underdog`
- `<= 0.15`: `prediction_longshot`
- For `pWin = 0.60`, use favorite; for `pWin = 0.40`, use underdog.

**Result text**, calculated separately for the winner and loser:

- Winner 11–0 (or target–0) => `bagel_winner`; loser => `bagel_loser`.
- For results with score difference = 1 under win-by-1, or = 2 under win-by-2 with both teams close to the target, use `close_win` / `close_loss`.
- Define “close” as loser score >= `target - 2` (and difference <= 2). Respect extended win-by-2 scores (e.g., 14–12 to 11).
- Blowout when `loserScore / winnerScore <= 0.4` (excluding zero, which is bagel).
- Otherwise `expected_win` if there is no more specific event.
- `upset_win` takes precedence in a *separate* callout when winner's **pre-match win probability <= 0.25**; avoid describing an upset from point share alone.
- NEVER report that an outcome was an upset if its pre-match predicted win probability wasn't saved or isn't available. Fall back to score-based jokes.

**Rating**: choose gain/drop using the stored precise delta, not a displayed rounded 0.00 value. Use `abs(delta) >= 0.04` as “large” initially; positive small otherwise; negative small otherwise; exact zero should show a neutral message or no rating message. Display signed delta with TWO decimal places, retaining raw precision in calculations. **Caution:** if a nonzero small delta rounds to +0.00 or -0.00, use a `~0.00` or “< 0.01” display to avoid misleading users. Never call a negative performance a gain.

**Streaks**: only show when >= 3 confirmed consecutive wins/losses, chronological and ignoring void matches. Partner chemistry only after >= 8 shared matches and measured vs opponent-adjusted expectation; do not claim chemistry as a fact from a tiny sample. Pick titles from existing player stats only, no invented awards/ranks.

## Roast phrase selection

1. For the same match, a visitor should see a stable phrase on reload unless they click **“Chửi Nữa Đi”**.
2. Implement seeded selection using `hash(matchId + eventKey + locale + variantIndex)` modulo phrase count; for predictions with no saved ID, seed using canonical IDs of four selected players, team membership, target score, win-by rule, and the event key.
3. `variantIndex` defaults to 0; every click increments it and selects the next distinct phrase, wrapping around at the end. Prevent immediate duplicates.
4. A line must match the event; never show winner jokes to losers. Prefer placing a win/loss line on each team's result card and optional separate upset/rating-change lines.
5. Do not use client-created random numbers to set text during SSR (hydration mismatch). Precompute on client only or use deterministic seeds.
6. Do not persist/generated insult strings to SQLite. A match's underlying metadata is the only persistent fact.
7. Keep `roastAgain` button hidden in English mode, visible only on appropriate cards in funny mode.
8. No external LLM, OpenRouter, API, tracking pixel, or additional service is needed.

## Locations to update

- Navbar / mobile menu / site headings.
- Public leaderboard, column headers, empty states, loading states.
- Match predictor, team labels, probabilities, game to 11/15/21, win-by-1/2, computed result.
- Post-match confirmed result and rating delta cards; match detail/history, old matches included.
- Player profiles, graphs/tooltip titles, streaks, partner stats, provisional badges.
- Admin player form and match form (funny display only, clear validation and approval semantics).
- Toasts and nontechnical errors.
- Shareable text/cards **only when user is in funny mode**, preserving ratings/scores exactly.

Do not change sensitive/security audit logs, API error codes, machine-readable values, transaction semantics or reports used for reconciliation.

## Original and historical data

This is entirely a display-layer mode. Previously submitted games instantly show a funny description in `vi-roast` based on their existing scores and rating changes. Keep all stored matches and rating snapshots intact. No migration should be necessary for translation or jokes. Do not rewrite names, scores, initial ratings, updated ratings, or player IDs.

## UI/UX direction

Keep professional visual design with small bursts of comedic personality: dramatic emoji on result cards, subtle spring/motion transitions, fake “thầy bói” verdict panel, playful hover copy, and “Chửi Nữa Đi” action. Honor `prefers-reduced-motion`; no intrusive full-screen insults, auto-play sounds, or flashing graphics. Don't use an ugly 18+ warning wall: a one-time small opt-in modal is enough. On phones, don't make jokes overshadow the actual probability or match score; numerical truth stays primary.

Suggested layout for match predictor:

```
🔮 THẦY BÓI CINCO PHÁN KÈO     [🔥 Mất Nết 18+]
[Phe A — Mõm To]  71% | 29% [Phe B — Không Phải Dạng Vừa]
[Probability bar with proper accessible label]
"Kèo hơi thơm, nhưng ngon quá dễ mắc nghẹn."
[Chửi Nữa Đi]       [Chia Phe Đỡ Hành Nhau]
```

## Quality checks / tests

- Existing English screen snapshots and routes remain behaviorally unchanged.
- Brand-new visitor sees English; funny mode is opt-in; preference persists; switch-off immediate.
- Existing historical games display Vietnamese lines without a database update.
- Verify correct diacritics, layout and wrapping on 360px and desktop.
- Zero accidental English labels for covered key paths, no raw key identifiers in UI.
- 11–10 allowed for game to 11 with win-by-1; 11–10 rejected for win-by-2; predictor's match probability uses selected rule.
- Historical rating `3.229473` shows `3.23` in both modes, without changing stored number or rating results.
- All 27 event categories have at least 1 line and all content references valid keys.
- Win/loss/upset/score events show only accurate messages, with safe fallback if prediction metadata unavailable.
- Clicking "Chửi Nữa Đi" cycles unique lines without mutating scores/rating or doing a network request.
- Admin-only routes remain access controlled on the **server**, independent of locale.
- No SQL migration, no destructive writes, no player records modified when language changes.
- Accessibility labels, RTL not needed, Vietnamese diacritics render properly.
- Production Render build succeeds. Avoid bundling roast library into all routes unnecessarily.

## Implementation order

1. Inspect existing repo, note app/router and any i18n utilities, record baseline tests.
2. Add locale mode and safe persistence/opt-in.
3. Import provided JSON dictionaries, implement fallback, type-check key coverage.
4. Add event classifier + deterministic phrase picker + unit tests.
5. Replace relevant labels across public screens and admin forms.
6. Add funny result cards, predictor verdict, “Chửi Nữa Đi”.
7. Verify historical games, all score formats, 2-decimal display and Render build.
8. Summarize changed files, automated test results, uncovered strings and any follow-up work.

**Do not** redesign the rating engine or database as part of this job. **Do not** delete or recalculate historical matches. Preserve all settings, scores, prediction functions, and current player data.
