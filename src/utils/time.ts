export const CAMPUS_TIMEZONE = "America/Chicago";

const TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
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

export interface CampusDateTime {
  date: string;
  time: string;
}

export interface CampusDateTimeParts extends CampusDateTime {
  hour: number;
  minute: number;
}

function readNumericPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
): number {
  const part = parts.find((candidate) => candidate.type === type);
  if (!part) throw new Error(`Intl formatter omitted ${type}`);
  return Number(part.value);
}

export function getCampusDateTimeParts(
  value: Date | number = new Date(),
): CampusDateTimeParts {
  const parts = campusPartsFormatter.formatToParts(value);
  const year = readNumericPart(parts, "year");
  const month = readNumericPart(parts, "month");
  const day = readNumericPart(parts, "day");
  const hour = readNumericPart(parts, "hour");
  const minute = readNumericPart(parts, "minute");
  const second = readNumericPart(parts, "second");
  const pad = (part: number) => part.toString().padStart(2, "0");

  return {
    date: `${year.toString().padStart(4, "0")}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}:${pad(second)}`,
    hour,
    minute,
  };
}

export function parseTimeToMinutes(time: string): number | null {
  const match = TIME_PATTERN.exec(time);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  if (
    hour > 24 ||
    minute > 59 ||
    second > 59 ||
    (hour === 24 && (minute !== 0 || second !== 0))
  ) {
    return null;
  }

  return hour * 60 + minute + second / 60;
}

export function formatMinutesAsTime(minutes: number): string {
  const secondsPerDay = MINUTES_PER_DAY * 60;
  const roundedSeconds = Math.round(minutes * 60);
  const normalizedSeconds =
    ((roundedSeconds % secondsPerDay) + secondsPerDay) % secondsPerDay;
  const hour = Math.floor(normalizedSeconds / 3600);
  const minute = Math.floor((normalizedSeconds % 3600) / 60);
  const second = normalizedSeconds % 60;
  const pad = (part: number) => part.toString().padStart(2, "0");
  return `${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

export function formatTimeForDisplay(time: string | undefined): string {
  if (!time) return "";
  const minutes = parseTimeToMinutes(time);
  if (minutes === null) return time;

  const hour = Math.floor(minutes / 60) % 24;
  const minute = Math.floor(minutes % 60);
  const period = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${minute.toString().padStart(2, "0")} ${period}`;
}

function timeDifference(start: string, end: string): number | null {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  return startMinutes === null || endMinutes === null
    ? null
    : endMinutes - startMinutes;
}

export function getDurationMinutes(start: string, end: string): number {
  return Math.max(0, timeDifference(start, end) ?? 0);
}

export function getOvernightDurationMinutes(
  start: string,
  end: string,
): number {
  const duration = timeDifference(start, end);
  if (duration === null) return 0;
  return duration < 0 ? duration + MINUTES_PER_DAY : duration;
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
