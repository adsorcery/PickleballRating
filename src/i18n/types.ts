import type events from "./vi-roast.events.json";
import type ui from "./vi-roast.ui.json";
import type { ExtraKey } from "./vi-roast.extra";

/** `vi` (neutral Vietnamese) is not implemented, so it is deliberately absent from the selector. */
export type LocaleMode = "en" | "vi-roast";

/** Every key in the provided UI library. Types are derived from the JSON so a renamed key fails to compile. */
export type UiKey = keyof typeof ui;
export type TranslationKey = UiKey | ExtraKey;
export type RoastEvent = keyof typeof events;

export type EventCatalog = Record<RoastEvent, readonly string[]>;

/** Everything that is lazily loaded when the visitor turns the funny mode on. */
export interface RoastCatalog {
  ui: Readonly<Partial<Record<TranslationKey, string>>>;
  events: EventCatalog;
}

export const LANGUAGE_STORAGE_KEY = "vietcinco:language";
export const ROAST_ACK_STORAGE_KEY = "vietcinco:roast-ack";

/** Event names from the specification; a test asserts the JSON has exactly these buckets. */
export const ROAST_EVENTS = [
  "prediction_heavy_favorite",
  "prediction_favorite",
  "prediction_even",
  "prediction_underdog",
  "prediction_longshot",
  "upset_win",
  "expected_win",
  "close_win",
  "blowout_win",
  "close_loss",
  "blowout_loss",
  "bagel_winner",
  "bagel_loser",
  "rating_gain_small",
  "rating_gain_large",
  "rating_drop_small",
  "rating_drop_large",
  "win_streak",
  "loss_streak",
  "new_player",
  "provisional",
  "balanced_match",
  "partner_chemistry_good",
  "partner_chemistry_bad",
  "no_matches",
  "error_safe",
  "roast_again",
] as const satisfies readonly RoastEvent[];
