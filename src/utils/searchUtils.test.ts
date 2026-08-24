import { describe, expect, it } from "bun:test";
import type { Facility, LibraryRoom } from "@/types";
import { FacilityType, RoomStatus } from "@/types";
import {
  createFacilitySearchIndex,
  searchFacilityIndex,
  type SearchResultsData,
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

function summarize(result: SearchResultsData) {
  return {
    buildings: result.buildings.map((building) => ({
      id: building.facilityId,
      matchingRooms: building.matchingRooms.map((room) => room.roomNumber),
    })),
    rooms: result.rooms.map((room) => ({
      id: `${room.facilityId}-${room.roomNumber}`,
      highlight: room.matchHighlight ?? null,
    })),
    totalCount: result.totalCount,
  };
}

describe("prepared facility search index", () => {
  it("returns stable direct, alias, course, and fuzzy matches", () => {
    const index = createFacilitySearchIndex(facilities);
    const cases = [
      {
        query: "cif",
        expected: {
          buildings: [{ id: "cif", matchingRooms: ["0027", "1404"] }],
          rooms: [
            { id: "cif-0027", highlight: "" },
            { id: "cif-1404", highlight: "" },
          ],
          totalCount: 3,
        },
      },
      {
        query: "1404",
        expected: {
          buildings: [],
          rooms: [{ id: "cif-1404", highlight: "Room 1404" }],
          totalCount: 1,
        },
      },
      {
        query: "cs 225",
        expected: {
          buildings: [],
          rooms: [{ id: "cif-1404", highlight: null }],
          totalCount: 1,
        },
      },
      {
        query: "orange room",
        expected: {
          buildings: [
            { id: "main-library", matchingRooms: ["Orange Room"] },
          ],
          rooms: [
            {
              id: "main-library-Orange Room",
              highlight: "Room Orange Room",
            },
          ],
          totalCount: 2,
        },
      },
      {
        query: "main librarry",
        expected: {
          buildings: [
            { id: "main-library", matchingRooms: ["Orange Room"] },
          ],
          rooms: [{ id: "main-library-Orange Room", highlight: "" }],
          totalCount: 2,
        },
      },
    ];

    for (const { query, expected } of cases) {
      expect(summarize(searchFacilityIndex(index, query))).toEqual(expected);
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
