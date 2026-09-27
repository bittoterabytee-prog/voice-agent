/**
 * Deterministic date/time phrase resolver for appointment tools (KAN-66 / SRD §4.5).
 * Clinic timezone: Asia/Kolkata (IST). Ambiguous phrases return outcome "ambiguous"
 * and never invent a booking slot.
 */

export type PartOfDay = "morning" | "afternoon" | "evening" | "any";

export type ResolvedTimeWindow = {
  /** Calendar date in Asia/Kolkata, YYYY-MM-DD */
  date: string;
  /** Inclusive window start HH:MM:SS (24h, IST wall clock) */
  timeStart: string;
  /** Exclusive-ish upper bound HH:MM:SS for the part of day / phrase */
  timeEnd: string;
  partOfDay: PartOfDay;
};

export type ResolveDateTimeResult =
  | {
      outcome: "resolved";
      window: ResolvedTimeWindow;
      message: string;
    }
  | {
      outcome: "ambiguous";
      window: null;
      message: string;
    };

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const PART_WINDOWS: Record<Exclude<PartOfDay, "any">, { start: string; end: string }> = {
  morning: { start: "09:00:00", end: "12:00:00" },
  afternoon: { start: "12:00:00", end: "17:00:00" },
  evening: { start: "17:00:00", end: "21:00:00" },
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format a Date that already represents an IST wall-clock instant via UTC fields. */
function formatIstDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function startOfIstDay(now: Date): Date {
  const ist = toIstWallClock(now);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

function addDays(day: Date, days: number): Date {
  const next = new Date(day.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Convert absolute instant → Date whose UTC getters equal IST wall clock. */
function toIstWallClock(now: Date): Date {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).filter((p) => p.type !== "literal").map((p) => [p.type, p.value]),
  );
  return new Date(
    Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    ),
  );
}

function nextWeekday(fromDay: Date, targetDow: number, requireFutureWeek: boolean): Date {
  const current = fromDay.getUTCDay();
  let delta = (targetDow - current + 7) % 7;
  if (requireFutureWeek && delta === 0) delta = 7;
  return addDays(fromDay, delta);
}

function parsePartOfDay(text: string): PartOfDay | null {
  if (/\b(morning|subah|subah\s*mein)\b/i.test(text)) return "morning";
  if (/\b(afternoon|dopahar|dopehar)\b/i.test(text)) return "afternoon";
  if (/\b(evening|night|shaam|raat)\b/i.test(text)) return "evening";
  if (/\b(any\s*time|whenever|koi\s*bhi\s*time)\b/i.test(text)) return "any";
  if (/\bafter\s*5(\s*(pm|p\.m\.))?\b/i.test(text) || /\bafter\s*17\b/i.test(text)) {
    return "evening";
  }
  if (/\bbefore\s*lunch\b/i.test(text)) return "morning";
  return null;
}

function parseClockTime(text: string): string | null {
  const ampm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/i);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = Number(ampm[2] ?? "0");
    const meridiem = ampm[3].toLowerCase().replace(/\./g, "");
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (meridiem === "pm" && hour < 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
    return `${pad2(hour)}:${pad2(minute)}:00`;
  }
  const twentyFour = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (twentyFour) {
    return `${pad2(Number(twentyFour[1]))}:${twentyFour[2]}:00`;
  }
  return null;
}

function parseCalendarDate(text: string, nowDay: Date): Date | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  }
  const dmy = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return new Date(Date.UTC(year, month - 1, day));
  }
  if (/\btoday\b/i.test(text) || /\baaj\b/i.test(text)) return nowDay;
  if (/\btomorrow\b/i.test(text) || /\bkal\b/i.test(text)) return addDays(nowDay, 1);
  if (/\bday\s+after(\s+tomorrow)?\b/i.test(text) || /\bparso[nm]?\b/i.test(text)) {
    return addDays(nowDay, 2);
  }
  if (/\bnext\s+week\b/i.test(text)) {
    // Next week's Monday (deterministic; not "guess a day")
    return nextWeekday(nowDay, 1, true);
  }
  if (/\bweekend\b/i.test(text)) {
    return nextWeekday(nowDay, 6, false);
  }
  for (const [label, dow] of Object.entries(WEEKDAYS)) {
    const nextPrefixed = new RegExp(`\\bnext\\s+${label}\\b`, "i").test(text);
    const bare = new RegExp(`\\b${label}\\b`, "i").test(text);
    if (nextPrefixed || bare) {
      return nextWeekday(nowDay, dow, nextPrefixed);
    }
  }
  return null;
}

function windowFor(
  date: Date,
  part: PartOfDay,
  exactTime: string | null,
): ResolvedTimeWindow {
  const dateStr = formatIstDate(date);
  if (exactTime) {
    const [h, m, s] = exactTime.split(":").map(Number);
    const endH = Math.min(h + 1, 23);
    return {
      date: dateStr,
      timeStart: exactTime,
      timeEnd: `${pad2(endH)}:${pad2(m)}:${pad2(s ?? 0)}`,
      partOfDay: part === "any" ? "any" : part,
    };
  }
  if (part === "any") {
    return {
      date: dateStr,
      timeStart: "09:00:00",
      timeEnd: "21:00:00",
      partOfDay: "any",
    };
  }
  const w = PART_WINDOWS[part];
  return {
    date: dateStr,
    timeStart: w.start,
    timeEnd: w.end,
    partOfDay: part,
  };
}

/**
 * Resolve a natural-language date/time phrase against a supplied clock (`now`).
 */
export function resolveDateTime(
  phrase: string,
  now: Date = new Date(),
): ResolveDateTimeResult {
  const text = phrase.trim().replace(/\s+/g, " ");
  if (!text) {
    return {
      outcome: "ambiguous",
      window: null,
      message: "Ask for a date or time (for example tomorrow morning)",
    };
  }

  if (
    /^(sometime|later|soon|whenever|idk|don't know|dont know|any day)$/i.test(text)
  ) {
    return {
      outcome: "ambiguous",
      window: null,
      message: "That time is unclear; ask for a specific day and part of day",
    };
  }

  const nowDay = startOfIstDay(now);
  const date = parseCalendarDate(text, nowDay);
  const part = parsePartOfDay(text) ?? (parseClockTime(text) ? "any" : null);
  const clock = parseClockTime(text);

  // Ambiguous if we cannot pick a calendar day
  if (!date) {
    return {
      outcome: "ambiguous",
      window: null,
      message: "Could not determine the day; ask the caller to clarify the date",
    };
  }

  // Day known but no part of day / clock → still usable as full-day "any"
  const resolvedPart: PartOfDay = part ?? "any";
  const window = windowFor(date, resolvedPart, clock);

  return {
    outcome: "resolved",
    window,
    message: `Resolved to ${window.date} ${window.timeStart}–${window.timeEnd} IST`,
  };
}
