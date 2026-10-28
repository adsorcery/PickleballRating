import type { RoastCatalog } from "./types";

let pending: Promise<RoastCatalog> | null = null;

/**
 * Dynamic imports keep the Vietnamese strings and all 255 jokes out of the English bundle: the
 * browser only downloads this chunk after the visitor has opted in.
 */
export function loadRoastCatalog(): Promise<RoastCatalog> {
  pending ??= Promise.all([
    import("./vi-roast.ui.json"),
    import("./vi-roast.events.json"),
    import("./vi-roast.extra"),
  ]).then(([ui, events, extra]) => ({
    ui: { ...extra.viExtra, ...(ui.default as Record<string, string>) },
    events: events.default as RoastCatalog["events"],
  }));
  pending.catch(() => {
    pending = null;
  });
  return pending;
}
