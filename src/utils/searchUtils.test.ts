import { describe, expect, it } from "bun:test";
import type { Facility, LibraryRoom } from "@/types";
import { FacilityType, RoomStatus } from "@/types";
import {
  createFacilitySearchIndex,
  performSearch,
  searchFacilityIndex,
} from "./searchUtils";

const facilities: Facility[] = [
  {
    id: "cif",
    name: "Campus Instructional Facility",
    type: FacilityType.ACADEMIC,
    coordinates: { latitude: 40.0, longitude: -88.0 },
    hours: { open: "08:00", close: "22:00" },
    isOpen: true,
    roomCounts: { available: 1, total: 2 },
    rooms: {
      "0027": {
        type: "academic",
        status: RoomStatus.AVAILABLE,
        availableFor: 30,
      },
      "1404": {
        type: "academic",
        status: RoomStatus.OCCUPIED,
        currentClass: { course: "CS 225", title: "Data Structures" },
      },
    },
  },
  {
    id: "main-library",
    name: "Main Library",
    type: FacilityType.LIBRARY,
    coordinates: { latitude: 40.1, longitude: -88.1 },
    hours: { open: "08:00", close: "23:00" },
    isOpen: true,
    roomCounts: { available: 1, total: 1 },
    rooms: {
      "Orange Room": {
        type: "library",
        status: RoomStatus.AVAILABLE,
        availableFor: 90,
        url: "https://example.com/orange",
        thumbnail: "",
        slots: [],
        grouping: "Media Commons",
      } as LibraryRoom & { grouping: string },
    },
  },
];

function summarize(result: ReturnType<typeof performSearch>) {
  return {
    buildings: result.buildings.map((building) => ({
      id: building.facilityId,
      score: building.score,
      matchingRooms: building.matchingRooms.map((room) => room.roomNumber),
    })),
    rooms: result.rooms.map((room) => ({
      id: `${room.facilityId}-${room.roomNumber}`,
      score: room.score,
      highlight: room.matchHighlight,
    })),
    totalCount: result.totalCount,
  };
}

describe("prepared facility search index", () => {
  it("preserves one-shot search behavior across direct, alias, and fuzzy queries", () => {
    const index = createFacilitySearchIndex(facilities);

    for (const query of ["cif", "1404", "cs 225", "orange room", "main librarry"]) {
      expect(summarize(searchFacilityIndex(index, query))).toEqual(
        summarize(performSearch(facilities, query)),
      );
    }
  });

  it("pre-filters rooms and building counts for availability criteria", () => {
    const index = createFacilitySearchIndex(
      facilities,
      { minDuration: 60 },
      true,
    );
    const result = searchFacilityIndex(index, "library");

    expect(result.buildings.map((building) => building.facilityId)).toEqual([
      "main-library",
    ]);
    expect(result.buildings[0]?.availableRoomsCount).toBe(1);
    expect(result.rooms.map((room) => room.roomNumber)).toEqual([
      "Orange Room",
    ]);
  });
});
