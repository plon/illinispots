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

  return {
    ...data,
    facilities: Object.fromEntries(
      Object.entries(data.facilities).map(([facilityId, facility]) => [
        facilityId,
        {
          ...facility,
          rooms: Object.fromEntries(
            Object.entries(facility.rooms).map(([roomId, room]) => {
              const isCurrentlyAvailable =
                room.status === RoomStatus.AVAILABLE ||
                room.status === RoomStatus.PASSING_PERIOD;

              return [
                roomId,
                isCurrentlyAvailable && room.availableFor !== undefined
                  ? {
                      ...room,
                      availableFor: Math.max(
                        0,
                        room.availableFor - elapsedMinutes,
                      ),
                    }
                  : room,
              ];
            }),
          ),
        },
      ]),
    ),
  };
}
