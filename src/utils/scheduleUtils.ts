import { RoomScheduleBlock, HourlyScheduleBlock, BlockSection } from "@/types";
import { formatMinutesAsTime, parseTimeToMinutes } from "@/utils/time";

export const SCHEDULE_BLOCK_STYLES = {
  available:
    "bg-green-200 hover:bg-green-300 dark:bg-green-900/80 dark:hover:bg-green-800",
  occupied:
    "bg-red-200 hover:bg-red-300 dark:bg-red-900/80 dark:hover:bg-red-800",
  availableBase: "bg-green-200 dark:bg-green-900/80",
  occupiedBase: "bg-red-200 dark:bg-red-900/80",
} as const;

interface ParsedScheduleBlock {
  block: RoomScheduleBlock;
  start: number;
  end: number;
}

export function processScheduleIntoHourlyBlocks(
  scheduleData: RoomScheduleBlock[],
): HourlyScheduleBlock[] {
  const parsed = scheduleData.flatMap((block): ParsedScheduleBlock[] => {
    const start = parseTimeToMinutes(block.start);
    const end = parseTimeToMinutes(block.end);
    return start !== null && end !== null && end > start
      ? [{ block, start, end }]
      : [];
  });
  if (parsed.length === 0) return [];

  parsed.sort((left, right) => left.start - right.start);
  const firstStart = parsed[0].start;
  const lastEnd = Math.max(...parsed.map(({ end }) => end));
  const hourlyBlocks: HourlyScheduleBlock[] = [];
  let current = firstStart;

  while (current < lastEnd) {
    const nextHour = current % 60 === 0 ? current + 60 : Math.ceil(current / 60) * 60;
    const end = Math.min(nextHour, lastEnd);
    hourlyBlocks.push(createHourlyBlock(current, end, parsed));
    current = end;
  }

  return hourlyBlocks;
}

function createHourlyBlock(
  startTime: number,
  endTime: number,
  scheduleData: ParsedScheduleBlock[],
): HourlyScheduleBlock {
  const sections: BlockSection[] = [];
  const overlappingBlocks = scheduleData.filter(
    ({ start, end }) => start < endTime && end > startTime,
  );
  let currentSectionStart = startTime;

  for (const { block, start, end } of overlappingBlocks) {
    const adjustedStart = Math.max(start, startTime);
    const adjustedEnd = Math.min(end, endTime);

    if (adjustedStart > currentSectionStart) {
      sections.push({
        start: formatMinutesAsTime(currentSectionStart),
        end: formatMinutesAsTime(adjustedStart),
        status: "available",
        details: null,
      });
    }

    sections.push({
      start: formatMinutesAsTime(adjustedStart),
      end: formatMinutesAsTime(adjustedEnd),
      status: block.status,
      details: block.details,
    });
    currentSectionStart = Math.max(currentSectionStart, adjustedEnd);
  }

  if (currentSectionStart < endTime) {
    sections.push({
      start: formatMinutesAsTime(currentSectionStart),
      end: formatMinutesAsTime(endTime),
      status: "available",
      details: null,
    });
  }

  return {
    start: formatMinutesAsTime(startTime),
    end: formatMinutesAsTime(endTime),
    sections,
  };
}
