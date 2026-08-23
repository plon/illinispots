import moment from "moment-timezone";
import type { RoomScheduleBlock } from "@/types";

export const CAMPUS_TIMEZONE = "America/Chicago";
export const TIMELINE_HOUR_WIDTH_PX = 72;

const DEFAULT_START_MINUTES = 8 * 60;
const DEFAULT_END_MINUTES = 22 * 60;
const MINUTES_PER_HOUR = 60;
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

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
  const todayMoment = moment.tz(today, CAMPUS_TIMEZONE);
  const selectedMoment = moment.tz(selectedDate, CAMPUS_TIMEZONE);
  const daysFromToday = selectedMoment.diff(todayMoment, "days");
  const windowOffset = Math.floor(daysFromToday / 7) * 7;
  const firstDay = todayMoment.clone().add(windowOffset, "days");

  return Array.from({ length: 7 }, (_, index) => {
    const day = firstDay.clone().add(index, "days");
    const date = day.format("YYYY-MM-DD");
    return {
      date,
      label: date === today ? "Today" : day.format("ddd D"),
    };
  });
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
