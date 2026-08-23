import type { RoomScheduleBlock } from "@/types";

export const TIMELINE_HOUR_WIDTH_PX = 72;

const DEFAULT_START_MINUTES = 8 * 60;
const DEFAULT_END_MINUTES = 22 * 60;
const MINUTES_PER_HOUR = 60;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;
const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
});

export interface TimelineDayOption {
  date: string;
  label: string;
}

export interface TimelineBlock {
  block: RoomScheduleBlock;
  durationMinutes: number;
  leftPx: number;
  widthPx: number;
}

export interface TimelineTick {
  hour: number;
  label: string;
  positionPx: number;
}

export interface TimelineModel {
  startHour: number;
  endHour: number;
  startMinutes: number;
  endMinutes: number;
  totalHours: number;
  totalWidthPx: number;
  blocks: TimelineBlock[];
  ticks: TimelineTick[];
}

export function buildTimelineDayOptions(
  selectedDate: string,
  today: string,
): TimelineDayOption[] {
  const todayTime = parseCalendarDate(today);
  const selectedTime = parseCalendarDate(selectedDate);
  if (todayTime === null || selectedTime === null) return [];

  const daysFromToday = (selectedTime - todayTime) / DAY_MS;
  const windowOffset = Math.floor(daysFromToday / 7) * 7;
  const firstDay = todayTime + windowOffset * DAY_MS;

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(firstDay + index * DAY_MS);
    const date = formatCalendarDate(day);
    return {
      date,
      label: date === today ? "Today" : formatCalendarDayLabel(day),
    };
  });
}

function parseCalendarDate(date: string): number | null {
  const match = DATE_PATTERN.exec(date);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const parsed = new Date(time);
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? time
    : null;
}

function formatCalendarDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function formatCalendarDayLabel(date: Date): string {
  let weekday = "";
  let day = "";
  for (const part of DAY_LABEL_FORMATTER.formatToParts(date)) {
    if (part.type === "weekday") weekday = part.value;
    if (part.type === "day") day = part.value;
  }
  return `${weekday} ${day}`;
}

export function parseScheduleTime(time: string): number | null {
  const match = TIME_PATTERN.exec(time);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);

  if (hour > 23 || minute > 59 || second > 59) return null;
  return hour * MINUTES_PER_HOUR + minute + second / 60;
}

export function formatScheduleTime(time: string): string {
  const minutes = parseScheduleTime(time);
  if (minutes === null) return time;

  const hour = Math.floor(minutes / MINUTES_PER_HOUR);
  const minute = Math.floor(minutes % MINUTES_PER_HOUR);
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute.toString().padStart(2, "0")} ${period}`;
}

export function getScheduleDurationMinutes(start: string, end: string): number {
  const startMinutes = parseScheduleTime(start);
  const endMinutes = parseScheduleTime(end);
  if (startMinutes === null || endMinutes === null) return 0;
  return Math.max(0, Math.trunc(endMinutes - startMinutes));
}

export function formatDuration(minutes: number): string {
  const roundedMinutes = Math.round(minutes);
  const hours = Math.floor(roundedMinutes / MINUTES_PER_HOUR);
  const remainingMinutes = roundedMinutes % MINUTES_PER_HOUR;

  if (hours > 0 && remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  if (hours > 0) return `${hours}h`;
  return `${remainingMinutes}m`;
}

function formatHour(hour: number): string {
  const normalizedHour = hour % 24;
  return `${normalizedHour % 12 || 12} ${normalizedHour >= 12 ? "PM" : "AM"}`;
}

export function buildTimelineModel(
  schedule: RoomScheduleBlock[],
): TimelineModel {
  const parsedBlocks = schedule.flatMap((block) => {
    const startMinutes = parseScheduleTime(block.start);
    const endMinutes = parseScheduleTime(block.end);

    if (
      startMinutes === null ||
      endMinutes === null ||
      endMinutes <= startMinutes
    ) {
      return [];
    }

    return [{ block, startMinutes, endMinutes }];
  });

  const earliestStart =
    parsedBlocks.length > 0
      ? Math.min(...parsedBlocks.map(({ startMinutes }) => startMinutes))
      : DEFAULT_START_MINUTES;
  const latestEnd =
    parsedBlocks.length > 0
      ? Math.max(...parsedBlocks.map(({ endMinutes }) => endMinutes))
      : DEFAULT_END_MINUTES;

  const startHour = Math.max(
    0,
    Math.min(23, Math.floor(earliestStart / MINUTES_PER_HOUR)),
  );
  const endHour = Math.min(
    24,
    Math.max(startHour + 1, Math.ceil(latestEnd / MINUTES_PER_HOUR)),
  );
  const startMinutes = startHour * MINUTES_PER_HOUR;
  const endMinutes = endHour * MINUTES_PER_HOUR;
  const totalHours = endHour - startHour;
  const totalWidthPx = totalHours * TIMELINE_HOUR_WIDTH_PX;

  const blocks = parsedBlocks.flatMap((parsed): TimelineBlock[] => {
    const clippedStart = Math.max(startMinutes, parsed.startMinutes);
    const clippedEnd = Math.min(endMinutes, parsed.endMinutes);
    const durationMinutes = clippedEnd - clippedStart;
    if (durationMinutes <= 0) return [];

    return [
      {
        block: parsed.block,
        durationMinutes,
        leftPx:
          ((clippedStart - startMinutes) / MINUTES_PER_HOUR) *
          TIMELINE_HOUR_WIDTH_PX,
        widthPx:
          (durationMinutes / MINUTES_PER_HOUR) * TIMELINE_HOUR_WIDTH_PX,
      },
    ];
  });

  const ticks = Array.from({ length: totalHours + 1 }, (_, index) => {
    const hour = startHour + index;
    return {
      hour,
      label: formatHour(hour),
      positionPx: index * TIMELINE_HOUR_WIDTH_PX,
    };
  });

  return {
    startHour,
    endHour,
    startMinutes,
    endMinutes,
    totalHours,
    totalWidthPx,
    blocks,
    ticks,
  };
}
