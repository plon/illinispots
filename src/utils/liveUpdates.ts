import { FacilityStatus, RoomStatus } from "@/types";

export const LIVE_REFRESH_INTERVAL_MS = 5 * 60_000;

export function shouldRefetchFacilitiesOnReconnect(
  isLive: boolean,
  visibilityState: DocumentVisibilityState = document.visibilityState,
): boolean {
  return !isLive || visibilityState === "visible";
}

export function ageLiveAvailability(
  data: FacilityStatus | undefined,
  now: Date,
): FacilityStatus | undefined {
  if (!data) return undefined;

  const timestamp = Date.parse(data.timestamp);
  if (!Number.isFinite(timestamp)) return data;

  const elapsedMinutes = Math.max(
    0,
    Math.floor((now.getTime() - timestamp) / 60_000),
  );
  if (elapsedMinutes === 0) return data;

  let agedFacilities = data.facilities;

  Object.entries(data.facilities).forEach(([facilityId, facility]) => {
    let agedRooms = facility.rooms;

    Object.entries(facility.rooms).forEach(([roomId, room]) => {
      const isCurrentlyAvailable =
        room.status === RoomStatus.AVAILABLE ||
        room.status === RoomStatus.PASSING_PERIOD;
      if (!isCurrentlyAvailable || room.availableFor === undefined) return;

      const availableFor = Math.max(
        0,
        room.availableFor - elapsedMinutes,
      );
      if (availableFor === room.availableFor) return;

      if (agedRooms === facility.rooms) {
        agedRooms = { ...facility.rooms };
      }
      agedRooms[roomId] = { ...room, availableFor };
    });

    if (agedRooms !== facility.rooms) {
      if (agedFacilities === data.facilities) {
        agedFacilities = { ...data.facilities };
      }
      agedFacilities[facilityId] = { ...facility, rooms: agedRooms };
    }
  });

  return agedFacilities === data.facilities
    ? data
    : { ...data, facilities: agedFacilities };
}
