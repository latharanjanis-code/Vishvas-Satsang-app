// IST helpers. The portal works in Asia/Kolkata only; the database stores UTC (design.md §4).
import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

export const IST = "Asia/Kolkata";

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function toIST(d: Date): TZDate {
  return new TZDate(d.getTime(), IST);
}

/** A wall-clock time in IST → the real instant. */
export function istInstant(year: number, monthIndex: number, day: number, hh: number, mm: number): Date {
  return new Date(new TZDate(year, monthIndex, day, hh, mm, 0, 0, IST).getTime());
}

export function formatIST(d: Date, pattern: string): string {
  return format(toIST(d), pattern);
}

/** "Sat 7 Nov, 7:00 pm" */
export function shortIST(d: Date): string {
  return formatIST(d, "EEE d MMM, h:mm a").replace("AM", "am").replace("PM", "pm");
}

/** "Saturday, 7th Nov 2026, 7:00PM(IST)" — the sheet's second header line. */
export function sheetDateLine(d: Date): string {
  return `${formatIST(d, "EEEE, do MMM yyyy, h:mma")}(IST)`;
}

export function parseHHMM(s: string): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`Bad time "${s}"`);
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) throw new Error(`Bad time "${s}"`);
  return [hh, mm];
}

export type ScheduleTimes = {
  satsangDay: number;
  satsangTime: string;
  openDay: number;
  openTime: string;
  closeDay: number;
  closeTime: string;
  publishDay: number;
  publishTime: string;
};

/** The most recent `weekday hh:mm` IST strictly before `before`. */
function lastWeekdayBefore(before: Date, weekday: number, time: string): Date {
  const [hh, mm] = parseHHMM(time);
  const b = toIST(before);
  for (let back = 0; back <= 7; back++) {
    const cand = istInstant(b.getFullYear(), b.getMonth(), b.getDate() - back, hh, mm);
    if (toIST(cand).getDay() === weekday && cand < before) return cand;
  }
  throw new Error("unreachable");
}

/** Next satsang strictly after `after`, with its voting and publish times (design.md §4). */
export function nextSatsangTimes(s: ScheduleTimes, after: Date) {
  const [hh, mm] = parseHHMM(s.satsangTime);
  const a = toIST(after);
  let startsAt: Date | null = null;
  for (let fwd = 0; fwd <= 7; fwd++) {
    const cand = istInstant(a.getFullYear(), a.getMonth(), a.getDate() + fwd, hh, mm);
    if (toIST(cand).getDay() === s.satsangDay && cand > after) {
      startsAt = cand;
      break;
    }
  }
  if (!startsAt) throw new Error("unreachable");
  const opensAt = lastWeekdayBefore(startsAt, s.openDay, s.openTime);
  const closesAt = lastWeekdayBefore(startsAt, s.closeDay, s.closeTime);
  const publishAt = lastWeekdayBefore(startsAt, s.publishDay, s.publishTime);
  return { startsAt, opensAt, closesAt, publishAt };
}
