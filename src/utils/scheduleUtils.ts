import type {
  BlockSection,
  HourlyScheduleBlock,
  RoomScheduleBlock,
} from "@/types";

const SECONDS_PER_HOUR = 60 * 60;
const SECONDS_PER_DAY = 24 * SECONDS_PER_HOUR;
const CLOCK_TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

interface ParsedScheduleBlock {
  block: RoomScheduleBlock;
  startSeconds: number;
  endSeconds: number;
}

function parseClockTime(time: string): number | null {
  const match = CLOCK_TIME_PATTERN.exec(time);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);
  const isEndOfDay = hour === 24 && minute === 0 && second === 0;
  if ((!isEndOfDay && hour > 23) || minute > 59 || second > 59) return null;

  return hour * SECONDS_PER_HOUR + minute * 60 + second;
}

function formatClockTime(totalSeconds: number): string {
  const normalizedSeconds =
    ((totalSeconds % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  const hour = Math.floor(normalizedSeconds / SECONDS_PER_HOUR);
  const minute = Math.floor((normalizedSeconds % SECONDS_PER_HOUR) / 60);
  const second = normalizedSeconds % 60;

  return [hour, minute, second]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":");
}

export const SCHEDULE_BLOCK_STYLES = {
  available:
    "bg-green-200 hover:bg-green-300 dark:bg-green-900/80 dark:hover:bg-green-800",
  occupied:
    "bg-red-200 hover:bg-red-300 dark:bg-red-900/80 dark:hover:bg-red-800",
  availableBase: "bg-green-200 dark:bg-green-900/80",
  occupiedBase: "bg-red-200 dark:bg-red-900/80",
} as const;

/**
 * Processes raw schedule data into hourly blocks with sections
 * @param scheduleData The raw schedule data from the API
 * @returns An array of hourly blocks with sections
 */
export function processScheduleIntoHourlyBlocks(
  scheduleData: RoomScheduleBlock[],
): HourlyScheduleBlock[] {
  if (!scheduleData || scheduleData.length === 0) {
    return [];
  }

  const firstBlock = scheduleData[0];
  const lastBlock = scheduleData[scheduleData.length - 1];
  const firstStartSeconds = parseClockTime(firstBlock.start);
  const lastEndSeconds = parseClockTime(lastBlock.end);
  if (firstStartSeconds === null || lastEndSeconds === null) return [];

  // Parse and sort once. The previous implementation rebuilt timezone-aware
  // Moment instances for every schedule block in every displayed hour.
  const parsedSchedule = scheduleData
    .flatMap((block): ParsedScheduleBlock[] => {
      const startSeconds = parseClockTime(block.start);
      const endSeconds = parseClockTime(block.end);
      return startSeconds === null || endSeconds === null
        ? []
        : [{ block, startSeconds, endSeconds }];
    })
    .sort((a, b) => a.startSeconds - b.startSeconds);

  const hourlyBlocks: HourlyScheduleBlock[] = [];
  let currentSeconds = firstStartSeconds;

  // For the first block, keep its original start time
  // but round the end time to the next hour boundary if it crosses an hour
  const nextHourBoundary =
    (Math.floor(currentSeconds / SECONDS_PER_HOUR) + 1) * SECONDS_PER_HOUR;
  const firstEndSeconds = Math.min(nextHourBoundary, lastEndSeconds);
  hourlyBlocks.push(
    createHourlyBlock(currentSeconds, firstEndSeconds, parsedSchedule),
  );
  currentSeconds = firstEndSeconds;

  // Create standard 1-hour blocks until we reach the last end time
  while (currentSeconds < lastEndSeconds) {
    const endSeconds = Math.min(
      currentSeconds + SECONDS_PER_HOUR,
      lastEndSeconds,
    );
    hourlyBlocks.push(
      createHourlyBlock(currentSeconds, endSeconds, parsedSchedule),
    );
    currentSeconds = endSeconds;
  }

  return hourlyBlocks;
}

/**
 * Creates a single hourly block with sections based on the schedule data
 */
function createHourlyBlock(
  startSeconds: number,
  endSeconds: number,
  scheduleData: ParsedScheduleBlock[],
): HourlyScheduleBlock {
  const sections: BlockSection[] = [];
  const blockStartStr = formatClockTime(startSeconds);
  const blockEndStr = formatClockTime(endSeconds);

  // Find all schedule blocks that overlap with this hourly block
  const overlappingBlocks = scheduleData.filter(
    (block) =>
      block.startSeconds < endSeconds && block.endSeconds > startSeconds,
  );

  if (overlappingBlocks.length === 0) {
    // If no overlapping blocks, create a single available section
    sections.push({
      start: blockStartStr,
      end: blockEndStr,
      status: "available",
      details: null,
    });
  } else {
    let currentSectionStart = startSeconds;

    for (const {
      block,
      startSeconds: blockStart,
      endSeconds: blockEnd,
    } of overlappingBlocks) {
      // Adjust block times to be within the hourly block
      const adjustedStart = Math.max(blockStart, startSeconds);
      const adjustedEnd = Math.min(blockEnd, endSeconds);

      // If there's a gap before this block, add an available section
      if (adjustedStart > currentSectionStart) {
        sections.push({
          start: formatClockTime(currentSectionStart),
          end: formatClockTime(adjustedStart),
          status: "available",
          details: null,
        });
      }

      // Add the current block as a section
      sections.push({
        start: formatClockTime(adjustedStart),
        end: formatClockTime(adjustedEnd),
        status: block.status,
        details: block.details,
      });

      // Update the current section start time
      currentSectionStart = adjustedEnd;
    }

    // If there's remaining time after the last block, add an available section
    if (currentSectionStart < endSeconds) {
      sections.push({
        start: formatClockTime(currentSectionStart),
        end: blockEndStr,
        status: "available",
        details: null,
      });
    }
  }

  return {
    start: blockStartStr,
    end: blockEndStr,
    sections,
  };
}
