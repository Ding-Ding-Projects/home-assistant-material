export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

const partsFormatter = (timeZone: string): Intl.DateTimeFormat => {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
};

/** The wall clock reading of an instant in the given IANA time zone. */
export const getZonedParts = (date: Date, timeZone: string): ZonedParts => {
  const values: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(date)) {
    if (part.type !== "literal") {
      values[part.type] = Number(part.value);
    }
  }
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    // Some engines report midnight as 24 even with h23
    hour: values.hour % 24,
    minute: values.minute,
    second: values.second,
  };
};

const offsetMs = (date: Date, timeZone: string): number => {
  const p = getZonedParts(date, timeZone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
};

/**
 * The instant at which the wall clock of the given zone reads the given
 * time. A reading skipped by a daylight-saving jump resolves to the moment
 * just after the jump; a repeated reading resolves to its first occurrence.
 */
export const zonedWallTimeToDate = (
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): Date => {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  // Offsets either side of the wanted moment; they differ only at a jump
  const before = offsetMs(new Date(wall - 86400000), timeZone);
  const after = offsetMs(new Date(wall + 86400000), timeZone);
  const candidates = [wall - before, wall - after];
  const matching = candidates
    .filter((ms) => {
      const p = getZonedParts(new Date(ms), timeZone);
      return (
        p.year === year &&
        p.month === month &&
        p.day === day &&
        p.hour === hour &&
        p.minute === minute &&
        p.second === second
      );
    })
    .sort((a, b) => a - b);
  if (matching.length) {
    return new Date(matching[0]);
  }
  // Skipped reading: use the offset from before the jump, which lands after it
  return new Date(wall - before);
};

/** Today's calendar date in the given zone. */
export const todayInZone = (
  timeZone: string,
  now: Date = new Date()
): { year: number; month: number; day: number } => {
  const { year, month, day } = getZonedParts(now, timeZone);
  return { year, month, day };
};

/** The instant at which the current day began in the given zone. */
export const startOfDayInZone = (
  timeZone: string,
  now: Date = new Date()
): Date => {
  const { year, month, day } = todayInZone(timeZone, now);
  return zonedWallTimeToDate(timeZone, year, month, day);
};

/** Whole calendar days from today to the day the instant falls on, in a zone. */
export const calendarDaysFromToday = (
  date: Date,
  timeZone: string,
  now: Date = new Date()
): number => {
  const a = getZonedParts(date, timeZone);
  const b = getZonedParts(now, timeZone);
  return Math.round(
    (Date.UTC(a.year, a.month - 1, a.day) -
      Date.UTC(b.year, b.month - 1, b.day)) /
      86400000
  );
};

/**
 * Parse a calendar value. A date without a time becomes local midnight of
 * that date (show it without a time zone); a time with an offset is an exact
 * instant; a time without one is a reading of the server zone clock.
 */
export const parseCalendarValue = (
  value: string,
  serverTimeZone: string
): Date => {
  if (value.length <= 10) {
    return new Date(`${value}T00:00:00`);
  }
  if (/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    return new Date(value);
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(
    value
  );
  if (!match) {
    return new Date(value);
  }
  return zonedWallTimeToDate(
    serverTimeZone,
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6] ?? 0)
  );
};
