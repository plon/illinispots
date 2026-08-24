import type { FacilityRoom } from "@/types";
import { RoomStatus } from "@/types";
import { parseClockTimeSeconds } from "@/utils/clockTime";

const CAMPUS_CLOCK_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export interface FilterCriteria {
  minDuration?: number; // in minutes
  freeUntil?: string; // HH:mm
  startTime?: string; // HH:mm - room must be free by this time
  now?: Date; // Reference time for filtering
}

function campusMinutesNow(): number {
  let hour = 0;
  let minute = 0;
  let second = 0;
  for (const part of CAMPUS_CLOCK_FORMATTER.formatToParts(new Date())) {
    if (part.type === "hour") hour = Number(part.value);
    if (part.type === "minute") minute = Number(part.value);
    if (part.type === "second") second = Number(part.value);
  }
  return hour * 60 + minute + second / 60;
}

function referenceMinutes(now: Date | undefined): number {
  return now
    ? now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
    : campusMinutesNow();
}

function minutesUntil(currentMinutes: number, time: string): number | null {
  const targetSeconds = parseClockTimeSeconds(time);
  if (targetSeconds === null) return null;

  // Moment's integer-unit diff truncates toward zero. Milliseconds cancel
  // because its target was cloned from the reference time before setting
  // seconds to zero, so intentionally do not include them here.
  return Math.trunc(targetSeconds / 60 - currentMinutes);
}

export type RoomAvailabilityPredicate = (room: FacilityRoom) => boolean;

/**
 * Compiles stable filter criteria once for callers that test many rooms.
 * Interactive lists routinely apply one criteria object to every room, so
 * parsing the same clock values inside the room loop is avoidable work.
 */
export const createRoomAvailabilityPredicate = (
  criteria: FilterCriteria,
): RoomAvailabilityPredicate => {
  if (!criteria.minDuration && !criteria.freeUntil && !criteria.startTime) {
    return () => true;
  }

  const currentMinutes = referenceMinutes(criteria.now);
  const minutesUntilStart = criteria.startTime
    ? minutesUntil(currentMinutes, criteria.startTime)
    : undefined;
  const minutesUntilFree = criteria.freeUntil
    ? minutesUntil(currentMinutes, criteria.freeUntil)
    : undefined;
  const minimumDuration = criteria.minDuration;

  if (minutesUntilStart === null || minutesUntilFree === null) {
    return () => false;
  }

  return (room: FacilityRoom): boolean => {
    if (
      room.status !== RoomStatus.AVAILABLE &&
      room.status !== RoomStatus.PASSING_PERIOD
    ) {
      return false;
    }

    const availableFor = room.availableFor || 0;

    if (
      minutesUntilStart !== undefined &&
      (minutesUntilStart < 0 || availableFor < minutesUntilStart)
    ) {
      return false;
    }

    if (minimumDuration && availableFor < minimumDuration) {
      return false;
    }

    if (
      minutesUntilFree !== undefined &&
      (minutesUntilFree < 0 || availableFor < minutesUntilFree)
    ) {
      return false;
    }

    return true;
  };
};

export const isRoomAvailable = (
  room: FacilityRoom,
  criteria: FilterCriteria,
): boolean => createRoomAvailabilityPredicate(criteria)(room);
