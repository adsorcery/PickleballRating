import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
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
