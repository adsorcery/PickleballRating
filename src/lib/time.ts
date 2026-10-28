const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

function partsAt(ms: number, timeZone: string) {
  const out: Record<string, number> = {};
  for (const p of formatterFor(timeZone).formatToParts(new Date(ms))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute, second: out.second };
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Calendar day (YYYY-MM-DD) of an instant in the given timezone. */
export function localDayKey(ms: number, timeZone: string): string {
  const p = partsAt(ms, timeZone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

function offsetAt(ms: number, timeZone: string): number {
  const p = partsAt(ms, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** Formats an instant for a `datetime-local` input (YYYY-MM-DDTHH:mm) in the timezone. */
export function epochToLocalInput(ms: number, timeZone: string): string {
  const p = partsAt(ms, timeZone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Interprets a `datetime-local` value as wall-clock time in the timezone. Returns null when malformed. */
export function localInputToEpoch(value: string, timeZone: string): number | null {
  const m = LOCAL_INPUT.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(asUtc);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) return null;
  const first = asUtc - offsetAt(asUtc, timeZone);
  return asUtc - offsetAt(first, timeZone);
}

export function formatDateTime(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function formatDate(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", year: "numeric" }).format(new Date(ms));
}

export function nowLocalInput(timeZone: string): string {
  return epochToLocalInput(Date.now(), timeZone);
}
