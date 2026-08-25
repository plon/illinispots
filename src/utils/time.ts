export const CAMPUS_TIMEZONE = "America/Chicago";

const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MINUTES_PER_DAY = 24 * 60;

const campusPartsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
});

const shortWeekdayFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
});

export interface CampusDateTimeParts {
  date: string;
  time: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function getCampusDateTimeParts(
  value: Date | number = new Date(),
): CampusDateTimeParts {
  const parts = campusPartsFormatter.formatToParts(value);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const year = values.year;
  const month = values.month;
  const day = values.day;
  const hour = values.hour;
  const minute = values.minute;
  const second = values.second;

  return {
    date: `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`,
    time: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}:${second.toString().padStart(2, "0")}`,
    year,
    month,
    day,
    hour,
    minute,
    second,
  };
}

export function parseTimeToMinutes(time: string): number | null {
  const match = TIME_PATTERN.exec(time);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  if (hour > 23 || minute > 59 || second > 59) return null;

  return hour * 60 + minute + second / 60;
}

export function formatMinutesAsTime(minutes: number, includeSeconds = true): string {
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hour = Math.floor(normalized / 60);
  const minute = Math.floor(normalized % 60);
  const second = Math.round((normalized - Math.floor(normalized)) * 60) % 60;
  const base = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  return includeSeconds ? `${base}:${second.toString().padStart(2, "0")}` : base;
}

export function formatTimeForDisplay(time: string): string {
  const minutes = parseTimeToMinutes(time);
  if (minutes === null) return time;

  const hour = Math.floor(minutes / 60);
  const minute = Math.floor(minutes % 60);
  const period = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${minute.toString().padStart(2, "0")} ${period}`;
}

export function getDurationMinutes(
  start: string,
  end: string,
  wrapsAtMidnight = false,
): number {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  if (startMinutes === null || endMinutes === null) return 0;

  const duration = endMinutes - startMinutes;
  return duration < 0 && wrapsAtMidnight ? duration + MINUTES_PER_DAY : Math.max(0, duration);
}

function dateToUtc(date: string): Date | null {
  const match = DATE_PATTERN.exec(date);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const value = new Date(Date.UTC(year, month - 1, day));
  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

export function addDateDays(date: string, days: number): string | null {
  const value = dateToUtc(date);
  if (!value) return null;
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function differenceInCalendarDays(left: string, right: string): number | null {
  const leftDate = dateToUtc(left);
  const rightDate = dateToUtc(right);
  if (!leftDate || !rightDate) return null;
  return Math.round((leftDate.getTime() - rightDate.getTime()) / 86_400_000);
}

export function getDateWeekday(date: string, short = false): string | null {
  const value = dateToUtc(date);
  if (!value) return null;
  return (short ? shortWeekdayFormatter : weekdayFormatter).format(value);
}

export function formatDateForDisplay(date: string): string {
  const value = dateToUtc(date);
  return value ? shortDateFormatter.format(value) : date;
}
