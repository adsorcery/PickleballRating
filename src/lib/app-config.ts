import type { Executor } from "@/lib/db/client";
import { getActiveConfig } from "@/lib/services/config";

export function getTimezone(db: Executor): string {
  return getActiveConfig(db).config.timezone;
}
