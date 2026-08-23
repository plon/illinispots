import moment, { type Moment } from "moment-timezone";
import {
  type AcademicRoom,
  type ClassInfo,
  type Facility,
  type FacilityRoom,
  type FacilityStatus,
  FacilityType,
  type LibraryRoom,
  RoomStatus,
  type TimeSlot,
} from "@/types";
import { isLibraryOpen } from "@/utils/libraryHours";

const CAMPUS_TIMEZONE = "America/Chicago";
const OPENING_SOON_MINUTES = 20;
const PASSING_PERIOD_MINUTES = 30;

function timeOnReferenceDate(time: string, reference: Moment): Moment {
  return moment.tz(
    `${reference.format("YYYY-MM-DD")} ${time}`,
    "YYYY-MM-DD HH:mm:ss",
    CAMPUS_TIMEZONE,
  );
}

function classInterval(info: ClassInfo | undefined, reference: Moment) {
  if (!info?.time) return null;
  const start = timeOnReferenceDate(info.time.start, reference);
  const end = timeOnReferenceDate(info.time.end, reference);
  if (end.isSameOrBefore(start)) end.add(1, "day");
  return { info, start, end };
}

function remainingMinutes(end: Moment, now: Moment): number {
  return Math.max(0, Math.ceil(end.diff(now, "seconds") / 60));
}

function projectAcademicRoom(
  room: AcademicRoom,
  reference: Moment,
  now: Moment,
): AcademicRoom {
  const currentInterval = classInterval(room.currentClass, reference);
  const nextInterval = classInterval(room.nextClass, reference);
  const activeInterval = [currentInterval, nextInterval].find(
    (interval) =>
      interval &&
      now.isSameOrAfter(interval.start) &&
      now.isBefore(interval.end),
  );

  if (activeInterval) {
    const nextBecameCurrent = activeInterval === nextInterval;
    return {
      ...room,
      status: RoomStatus.OCCUPIED,
      passingPeriod: false,
      currentClass: activeInterval.info,
      nextClass: nextBecameCurrent ? undefined : room.nextClass,
      availableAt: nextBecameCurrent ? undefined : room.availableAt,
      availableFor: nextBecameCurrent ? undefined : room.availableFor,
      availableUntil: undefined,
    };
  }

  const wasAvailable =
    room.status === RoomStatus.AVAILABLE ||
    room.status === RoomStatus.PASSING_PERIOD;
  const availabilityStart = wasAvailable
    ? reference.clone()
    : room.availableAt
      ? timeOnReferenceDate(room.availableAt, reference)
      : null;
  let availabilityEnd = room.availableUntil
    ? timeOnReferenceDate(room.availableUntil, reference)
    : availabilityStart && room.availableFor !== undefined
      ? availabilityStart.clone().add(room.availableFor, "minutes")
      : null;

  if (
    availabilityStart &&
    availabilityEnd &&
    availabilityEnd.isSameOrBefore(availabilityStart)
  ) {
    availabilityEnd = availabilityEnd.add(1, "day");
  }

  if (
    availabilityStart &&
    availabilityEnd &&
    now.isSameOrAfter(availabilityStart) &&
    now.isBefore(availabilityEnd)
  ) {
    const availableFor = remainingMinutes(availabilityEnd, now);
    const isPassingPeriod =
      availableFor < PASSING_PERIOD_MINUTES &&
      !!nextInterval &&
      nextInterval.start.isSameOrBefore(availabilityEnd);

    return {
      ...room,
      status: isPassingPeriod
        ? RoomStatus.PASSING_PERIOD
        : RoomStatus.AVAILABLE,
      passingPeriod: isPassingPeriod,
      currentClass: undefined,
      availableAt: undefined,
      availableFor,
      availableUntil: availabilityEnd.format("HH:mm:ss"),
    };
  }

  if (availabilityStart && now.isBefore(availabilityStart)) {
    const minutesUntilAvailable = Math.ceil(
      availabilityStart.diff(now, "seconds") / 60,
    );
    return {
      ...room,
      status:
        minutesUntilAvailable <= OPENING_SOON_MINUTES &&
        (room.availableFor ?? 0) >= PASSING_PERIOD_MINUTES
          ? RoomStatus.OPENING_SOON
          : RoomStatus.OCCUPIED,
    };
  }

  // The snapshot only carries the current and next academic activity. Once
  // those known intervals have elapsed, keep the conservative occupied state
  // rather than claiming the room is free without schedule data to prove it.
  if (!wasAvailable && availabilityEnd && now.isSameOrAfter(availabilityEnd)) {
    return {
      ...room,
      status: RoomStatus.OCCUPIED,
      passingPeriod: false,
      currentClass: undefined,
      availableAt: undefined,
      availableFor: undefined,
      availableUntil: undefined,
    };
  }

  return room;
}

interface DatedSlot {
  slot: TimeSlot;
  start: Moment;
  end: Moment;
}

function dateLibrarySlots(slots: TimeSlot[], reference: Moment): DatedSlot[] {
  let previousStart: Moment | null = null;

  return slots.map((slot, index) => {
    const start = timeOnReferenceDate(slot.start, reference);
    const end = timeOnReferenceDate(slot.end, reference);
    if (end.isSameOrBefore(start)) end.add(1, "day");

    if (index === 0 && end.isSameOrBefore(reference)) {
      start.add(1, "day");
      end.add(1, "day");
    } else if (previousStart && start.isBefore(previousStart)) {
      start.add(1, "day");
      end.add(1, "day");
    }

    previousStart = start;
    return { slot, start, end };
  });
}

function availableBlockDuration(
  slots: DatedSlot[],
  startIndex: number,
  from: Moment,
): number {
  let end = slots[startIndex].end.clone();

  for (let index = startIndex + 1; index < slots.length; index++) {
    const next = slots[index];
    if (!next.slot.available || !next.start.isSame(end)) break;
    end = next.end.clone();
  }

  return remainingMinutes(end, from);
}

function projectLibraryRoom(
  room: LibraryRoom,
  reference: Moment,
  now: Moment,
): LibraryRoom {
  if (room.slots.length === 0) return room;

  const slots = dateLibrarySlots(room.slots, reference);
  const activeIndex = slots.findIndex(
    ({ start, end }) => now.isSameOrAfter(start) && now.isBefore(end),
  );

  if (activeIndex >= 0 && slots[activeIndex].slot.available) {
    return {
      ...room,
      status: RoomStatus.AVAILABLE,
      availableAt: undefined,
      availableFor: availableBlockDuration(slots, activeIndex, now),
    };
  }

  const futureAvailableIndex = slots.findIndex(
    ({ slot, start }) => slot.available && start.isAfter(now),
  );
  if (futureAvailableIndex < 0) {
    return {
      ...room,
      status: RoomStatus.RESERVED,
      availableAt: undefined,
      availableFor: 0,
    };
  }

  const availableStart = slots[futureAvailableIndex].start;
  const availableFor = availableBlockDuration(
    slots,
    futureAvailableIndex,
    availableStart,
  );
  const minutesUntilAvailable = Math.ceil(
    availableStart.diff(now, "seconds") / 60,
  );

  return {
    ...room,
    status:
      minutesUntilAvailable <= OPENING_SOON_MINUTES &&
      availableFor >= PASSING_PERIOD_MINUTES
        ? RoomStatus.OPENING_SOON
        : RoomStatus.RESERVED,
    availableAt: availableStart.format("HH:mm:ss"),
    availableFor,
  };
}

function isAcademicFacilityStillOpen(
  facility: Facility,
  reference: Moment,
  now: Moment,
): boolean {
  if (!facility.hours.open || !facility.hours.close) return facility.isOpen;
  const open = timeOnReferenceDate(facility.hours.open, reference);
  const close = timeOnReferenceDate(facility.hours.close, reference);
  if (close.isSameOrBefore(open)) close.add(1, "day");
  return now.isSameOrAfter(open) && now.isBefore(close);
}

function projectFacility(
  facility: Facility,
  reference: Moment,
  now: Moment,
): Facility {
  // A closed snapshot has no room schedule payload, so it cannot safely be
  // advanced into an open state without another request.
  const isOpen =
    facility.isOpen &&
    (facility.type === FacilityType.LIBRARY
      ? isLibraryOpen(facility.name, now)
      : isAcademicFacilityStillOpen(facility, reference, now));

  const rooms = Object.fromEntries(
    Object.entries(facility.rooms).map(([roomName, room]): [string, FacilityRoom] => [
      roomName,
      room.type === "library"
        ? projectLibraryRoom(room, reference, now)
        : projectAcademicRoom(room, reference, now),
    ]),
  );
  const available = isOpen
    ? Object.values(rooms).filter(
        (room) =>
          room.status === RoomStatus.AVAILABLE ||
          room.status === RoomStatus.PASSING_PERIOD,
      ).length
    : 0;

  return {
    ...facility,
    isOpen,
    rooms,
    roomCounts: { ...facility.roomCounts, available },
  };
}

/**
 * Advances a loaded availability snapshot using only its existing schedule
 * boundaries. It never performs I/O and never mutates the query cache value.
 */
export function projectFacilityStatus(
  status: FacilityStatus,
  currentTime: Date,
): FacilityStatus {
  const reference = moment(status.timestamp).tz(CAMPUS_TIMEZONE);
  const now = moment(currentTime).tz(CAMPUS_TIMEZONE);
  if (!reference.isValid() || now.isBefore(reference)) return status;

  return {
    ...status,
    timestamp: now.toISOString(),
    facilities: Object.fromEntries(
      Object.entries(status.facilities).map(([id, facility]) => [
        id,
        projectFacility(facility, reference, now),
      ]),
    ),
  };
}
