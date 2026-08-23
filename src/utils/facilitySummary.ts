import type { Facility, FacilityStatus } from "@/types";
import { FacilityType, RoomStatus } from "@/types";
import type { RoomAvailabilityPredicate } from "@/utils/filterUtils";

export interface SidebarFacilitySummary {
  libraryFacilities: Facility[];
  academicFacilities: Facility[];
  matchingRoomsCount: number;
  filteredAvailableCountByFacility: Map<Facility, number>;
}

/** Builds all sidebar room counts and facility groups in one room traversal. */
export function summarizeFacilitiesForSidebar(
  facilityData: FacilityStatus | null | undefined,
  hasActiveFilters: boolean,
  roomMatchesFilters: RoomAvailabilityPredicate,
): SidebarFacilitySummary {
  const libraryFacilities: Facility[] = [];
  const academicFacilities: Facility[] = [];
  const filteredAvailableCountByFacility = new Map<Facility, number>();
  let matchingRoomsCount = 0;

  for (const facility of Object.values(facilityData?.facilities ?? {})) {
    let filteredAvailableCount = 0;

    for (const room of Object.values(facility.rooms)) {
      const isAvailableOrPassing =
        room.status === RoomStatus.AVAILABLE ||
        room.status === RoomStatus.PASSING_PERIOD;
      if (
        isAvailableOrPassing &&
        (!hasActiveFilters || roomMatchesFilters(room))
      ) {
        filteredAvailableCount++;
      }
    }

    matchingRoomsCount += hasActiveFilters
      ? filteredAvailableCount
      : facility.roomCounts?.total ?? Object.keys(facility.rooms).length;

    if (hasActiveFilters && filteredAvailableCount === 0) {
      continue;
    }

    filteredAvailableCountByFacility.set(facility, filteredAvailableCount);
    if (facility.type === FacilityType.LIBRARY) {
      libraryFacilities.push(facility);
    } else if (facility.type === FacilityType.ACADEMIC) {
      academicFacilities.push(facility);
    }
  }

  const compareFacilityNames = (a: Facility, b: Facility) =>
    a.name.localeCompare(b.name);
  libraryFacilities.sort(compareFacilityNames);
  academicFacilities.sort(compareFacilityNames);

  return {
    libraryFacilities,
    academicFacilities,
    matchingRoomsCount,
    filteredAvailableCountByFacility,
  };
}
