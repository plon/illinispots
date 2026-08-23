import { describe, expect, it } from "bun:test";
import type { Facility, FacilityRoom, FacilityStatus } from "@/types";
import { FacilityType, RoomStatus } from "@/types";
import { createRoomAvailabilityPredicate } from "./filterUtils";
import { summarizeFacilitiesForSidebar } from "./facilitySummary";

function facility(
  id: string,
  name: string,
  type: FacilityType,
  rooms: Record<string, FacilityRoom>,
): Facility {
  return {
    id,
    name,
    type,
    coordinates: { latitude: 40, longitude: -88 },
    hours: { open: "08:00", close: "22:00" },
    rooms,
    isOpen: true,
    roomCounts: {
      available: Object.values(rooms).filter(
        (room) =>
          room.status === RoomStatus.AVAILABLE ||
          room.status === RoomStatus.PASSING_PERIOD,
      ).length,
      total: Object.keys(rooms).length,
    },
  };
}

const available = (availableFor: number): FacilityRoom => ({
  type: "academic",
  status: RoomStatus.AVAILABLE,
  availableFor,
});
const occupied: FacilityRoom = {
  type: "academic",
  status: RoomStatus.OCCUPIED,
  availableFor: 120,
};

describe("summarizeFacilitiesForSidebar", () => {
  const zeta = facility("z", "Zeta", FacilityType.ACADEMIC, {
    "100": available(20),
    "101": available(90),
    "102": occupied,
  });
  const alpha = facility("a", "Alpha", FacilityType.ACADEMIC, {
    "200": available(10),
  });
  const library = facility("l", "Main Library", FacilityType.LIBRARY, {
    "Room A": available(60),
  });
  const data: FacilityStatus = {
    timestamp: "2026-08-23T10:00:00.000Z",
    facilities: { zeta, alpha, library },
  };

  it("preserves total-room counts and available badge counts without filters", () => {
    const summary = summarizeFacilitiesForSidebar(data, false, () => true);

    expect(summary.academicFacilities.map(({ name }) => name)).toEqual([
      "Alpha",
      "Zeta",
    ]);
    expect(summary.libraryFacilities).toEqual([library]);
    expect(summary.matchingRoomsCount).toBe(5);
    expect(summary.filteredAvailableCountByFacility.get(zeta)).toBe(2);
    expect(summary.filteredAvailableCountByFacility.get(alpha)).toBe(1);
  });

  it("filters facilities and derives all active-filter counts in the same pass", () => {
    const matches = createRoomAvailabilityPredicate({ minDuration: 30 });
    const summary = summarizeFacilitiesForSidebar(data, true, matches);

    expect(summary.academicFacilities).toEqual([zeta]);
    expect(summary.libraryFacilities).toEqual([library]);
    expect(summary.matchingRoomsCount).toBe(2);
    expect(summary.filteredAvailableCountByFacility.get(zeta)).toBe(1);
    expect(summary.filteredAvailableCountByFacility.has(alpha)).toBe(false);
  });
});
