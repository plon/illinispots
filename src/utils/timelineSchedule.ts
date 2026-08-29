import type { RoomScheduleBlock, TimeSlot } from "@/types";
import {
  addDateDays,
  differenceInCalendarDays,
  getDateWeekday,
  parseTimeToMinutes,
} from "@/utils/time";

export { CAMPUS_TIMEZONE } from "@/utils/time";
export const TIMELINE_HOUR_WIDTH_PX = 72;

const DEFAULT_START_MINUTES = 8 * 60;
const DEFAULT_END_MINUTES = 22 * 60;
const MINUTES_PER_HOUR = 60;

export interface TimelineDayOption {
  date: string;
  label: string;
}

export interface TimelineBlock {
  block: RoomScheduleBlock;
  durationMinutes: number;
  leftPercent: number;
  widthPercent: number;
  leftPx: number;
  widthPx: number;
}

export interface TimelineTick {
  hour: number;
  label: string;
  percent: number;
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
  const daysFromToday = differenceInCalendarDays(selectedDate, today) ?? 0;
  const windowOffset = Math.floor(daysFromToday / 7) * 7;
  const firstDay = addDateDays(today, windowOffset) ?? today;

  return Array.from({ length: 7 }, (_, index) => {
    const date = addDateDays(firstDay, index) ?? firstDay;
    const day = Number(date.slice(-2));
    return {
      date,
      label:
        date === today ? "Today" : `${getDateWeekday(date, true) ?? ""} ${day}`,
    };
  });
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

export function convertLibrarySlotsToScheduleBlocks(
  slots: TimeSlot[],
): RoomScheduleBlock[] {
  return slots.map((slot) => ({
    start: slot.start,
    end: slot.end,
    status: slot.available ? "available" : "event",
    details: slot.available
      ? null
      : {
          type: "event",
          title: "Reserved",
          identifier: "Reserved",
        },
  }));
}

export function buildTimelineModel(
  schedule: RoomScheduleBlock[],
): TimelineModel {
  const parsedBlocks = schedule.flatMap((block) => {
    const startMinutes = parseTimeToMinutes(block.start);
    let endMinutes = parseTimeToMinutes(block.end);

    if (
      endMinutes !== null &&
      startMinutes !== null &&
      endMinutes === 0 &&
      block.end.startsWith("00:") &&
      startMinutes > 0
    ) {
      endMinutes = 24 * 60;
    }

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

  const totalMinutes = totalHours * MINUTES_PER_HOUR;

  const blocks = parsedBlocks.flatMap((parsed): TimelineBlock[] => {
    const clippedStart = Math.max(startMinutes, parsed.startMinutes);
    const clippedEnd = Math.min(endMinutes, parsed.endMinutes);
    const durationMinutes = clippedEnd - clippedStart;
    if (durationMinutes <= 0) return [];

    const offsetMinutes = clippedStart - startMinutes;

    return [
      {
        block: parsed.block,
        durationMinutes,
        leftPercent: totalMinutes > 0 ? (offsetMinutes / totalMinutes) * 100 : 0,
        widthPercent: totalMinutes > 0 ? (durationMinutes / totalMinutes) * 100 : 0,
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
      percent: totalHours > 0 ? (index / totalHours) * 100 : 0,
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
