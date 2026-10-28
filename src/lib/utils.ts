import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Display ratings with 3 decimals. */
export function formatRating(value: number | null | undefined): string {
  return value == null || Number.isNaN(value) ? "—" : value.toFixed(3);
}

export function formatDelta(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const s = Math.abs(value).toFixed(3);
  return value > 0 ? `+${s}` : value < 0 ? `−${s}` : s;
}

export function formatPercent(p: number, digits = 1): string {
  return `${(p * 100).toFixed(digits)}%`;
}

/** Probabilities never display as a flat 0% or 100%: the model is approximate, not certain. */
export function formatProbability(p: number): string {
  if (p > 0.999) return ">99.9%";
  if (p < 0.001) return "<0.1%";
  return formatPercent(p);
}
