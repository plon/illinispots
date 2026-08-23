import type { FacilityRoom } from "@/types";
import { RoomStatus } from "@/types";

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

function minutesUntil(now: Date | undefined, time: string): number {
  const separator = time.indexOf(":");
  const targetMinutes =
    Number(time.slice(0, separator)) * 60 + Number(time.slice(separator + 1));
  const currentMinutes = now
    ? now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
    : campusMinutesNow();

  // Moment's integer-unit diff truncates toward zero. Milliseconds cancel
  // because its target was cloned from the reference time before setting
  // seconds to zero, so intentionally do not include them here.
  return Math.trunc(targetMinutes - currentMinutes);
}

export const isRoomAvailable = (
  room: FacilityRoom,
  criteria: FilterCriteria,
): boolean => {
  if (!criteria.minDuration && !criteria.freeUntil && !criteria.startTime) {
    return true;
  }

  if (
    room.status !== RoomStatus.AVAILABLE &&
    room.status !== RoomStatus.PASSING_PERIOD
  ) {
    return false;
  }

  const availableFor = room.availableFor || 0;

  // Check Start Time (room must be free by this time)
  if (criteria.startTime) {
    const minutesUntilStart = minutesUntil(criteria.now, criteria.startTime);

    // If start time is before now, it has passed
    if (minutesUntilStart < 0) {
      return false;
    }

    // Room must be available by the start time
    if (availableFor < minutesUntilStart) {
      return false;
    }
  }

  // Check Minimum Duration
  if (criteria.minDuration && availableFor < criteria.minDuration) {
    return false;
  }

  // Check Free Until
  if (criteria.freeUntil) {
    const diffMinutes = minutesUntil(criteria.now, criteria.freeUntil);

    if (diffMinutes < 0) {
      return false;
    }

    if (availableFor < diffMinutes) {
      return false;
    }
  }

  return true;
};
