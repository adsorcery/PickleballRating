/**
 * Presentation-only formatting for Cinco Points. Stored and calculated values keep full
 * precision; these helpers must never be used to round data that is persisted or computed on.
 */

export const CINCO_DISPLAY_DECIMALS = 2;
const SCALE = 10 ** CINCO_DISPLAY_DECIMALS;

/**
 * Value in hundredths, rounded half away from zero. Going through the decimal string avoids
 * binary artefacts such as 1.005 * 100 = 100.49999999999999.
 */
function toHundredths(value: number): number {
  const abs = Math.abs(value);
  const text = String(abs);
  const scaled = text.includes("e") ? abs * SCALE : Number(`${text}e${CINCO_DISPLAY_DECIMALS}`);
  return Math.round(scaled);
}

const isMissing = (value: number | null | undefined): value is null | undefined =>
  value == null || !Number.isFinite(value);

/** Rating as shown to users: always exactly 2 decimals (3.229473 -> "3.23"). */
export function formatCincoRating(value: number | null | undefined): string {
  if (isMissing(value)) return "—";
  const hundredths = toHundredths(value);
  const text = (hundredths / SCALE).toFixed(CINCO_DISPLAY_DECIMALS);
  return value < 0 && hundredths !== 0 ? `-${text}` : text;
}

/** True when the value would be displayed as 0.00, so it should not be styled as a gain or loss. */
export function displaysAsZero(value: number | null | undefined): boolean {
  return isMissing(value) || toHundredths(value) === 0;
}

/** Signed rating change, 2 decimals (+0.03 / −0.03; a change that displays as 0.00 has no sign). */
export function formatCincoDelta(value: number | null | undefined): string {
  if (isMissing(value)) return "—";
  const magnitude = (toHundredths(value) / SCALE).toFixed(CINCO_DISPLAY_DECIMALS);
  if (displaysAsZero(value)) return magnitude;
  return value > 0 ? `+${magnitude}` : `−${magnitude}`;
}
