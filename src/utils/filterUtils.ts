import { FacilityRoom, RoomStatus } from "@/types";
import moment, { Moment } from "moment-timezone";

export interface FilterCriteria {
    minDuration?: number; // in minutes
    freeUntil?: string; // HH:mm
    now?: Moment; // Reference time for "free until" calculation
}

export const isRoomAvailable = (
    room: FacilityRoom,
    criteria: FilterCriteria,
): boolean => {
    if (!criteria.minDuration && !criteria.freeUntil) {
        return true;
    }

    // Only consider available rooms for now
    if (room.status !== RoomStatus.AVAILABLE) {
        return false;
    }

    const availableFor = room.availableFor || 0;

    // Check Minimum Duration
    if (criteria.minDuration && availableFor < criteria.minDuration) {
        return false;
    }

    // Check Free Until
    if (criteria.freeUntil) {
        // Use provided reference time or default to current time
        const now = criteria.now ? criteria.now.clone() : moment().tz("America/Chicago");

        // If criteria.now is provided, we assume the user wants "free until HH:mm on that day".
        // So we take the date from 'now' and the time from 'freeUntil'.
        const [hours, minutes] = criteria.freeUntil.split(':').map(Number);
        const targetTime = now.clone().hour(hours).minute(minutes).second(0);

        // If target time is before 'now', it means the time has passed for today.

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
