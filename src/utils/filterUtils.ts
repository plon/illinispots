import { FacilityRoom, RoomStatus } from "@/types";
import moment, { Moment } from "moment-timezone";

export interface FilterCriteria {
    minDuration?: number; // in minutes
    freeUntil?: string; // HH:mm
    startTime?: string; // HH:mm - room must be free by this time
    now?: Moment; // Reference time for filtering
}

export const isRoomAvailable = (
    room: FacilityRoom,
    criteria: FilterCriteria,
): boolean => {
    if (
        !criteria.minDuration &&
        !criteria.freeUntil &&
        !criteria.startTime
    ) {
        return true;
    }

    // Only consider available rooms for now
    if (room.status !== RoomStatus.AVAILABLE) {
        return false;
    }

    const availableFor = room.availableFor || 0;
    const now = criteria.now ? criteria.now.clone() : moment().tz("America/Chicago");

    // Check Start Time (room must be free by this time)
    if (criteria.startTime) {
        const [hours, minutes] = criteria.startTime.split(':').map(Number);
        const startTargetTime = now.clone().hour(hours).minute(minutes).second(0);

        // If start time is before now, it has passed
        const minutesUntilStart = startTargetTime.diff(now, 'minutes');

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
        const [hours, minutes] = criteria.freeUntil.split(':').map(Number);
        const targetTime = now.clone().hour(hours).minute(minutes).second(0);

        const diffMinutes = targetTime.diff(now, 'minutes');

        if (diffMinutes < 0) {
            return false;
        }

        if (availableFor < diffMinutes) {
            return false;
        }
    }

    return true;
};
