import { FacilityRoom, RoomStatus } from "@/types";
import { getCampusDateTimeParts, parseTimeToMinutes } from "@/utils/time";

export interface FilterCriteria {
  minDuration?: number;
  freeUntil?: string;
  nowMinutes?: number;
}

export const isRoomAvailable = (
  room: FacilityRoom,
  criteria: FilterCriteria,
): boolean => {
  if (!criteria.minDuration && !criteria.freeUntil) {
    return true;
  }

  if (
    room.status !== RoomStatus.AVAILABLE &&
    room.status !== RoomStatus.PASSING_PERIOD
  ) {
    return false;
  }

  const availableFor = room.availableFor || 0;
  const campusNow = getCampusDateTimeParts();
  const nowMinutes =
    criteria.nowMinutes ?? campusNow.hour * 60 + campusNow.minute;

  if (criteria.freeUntil) {
    const targetMinutes = parseTimeToMinutes(criteria.freeUntil);
    if (
      targetMinutes === null ||
      targetMinutes < nowMinutes ||
      availableFor < targetMinutes - nowMinutes
    ) {
      return false;
    }
  }

  if (criteria.minDuration && availableFor < criteria.minDuration) {
    return false;
  }

  return true;
};
