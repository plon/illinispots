import { describe, expect, test } from "bun:test";
import { performSearch, getBuildingAliases, searchFacilities } from "@/utils/searchUtils";
import { Facility, FacilityType, RoomStatus } from "@/types";

const mockFacilities: Facility[] = [
  {
    id: "siebel-cs",
    name: "Siebel Center for Comp Sci",
    type: FacilityType.ACADEMIC,
    isOpen: true,
    coordinates: { latitude: 40.1138, longitude: -88.2249 },
    hours: { open: "07:00", close: "23:00" },
    roomCounts: { available: 2, total: 3 },
    rooms: {
      "1404": {
        type: "academic",
        status: RoomStatus.OCCUPIED,
        passingPeriod: false,
      },
      "2405": {
        type: "academic",
        status: RoomStatus.AVAILABLE,
        availableFor: 60,
        passingPeriod: false,
      },
      "0216": {
        type: "academic",
        status: RoomStatus.AVAILABLE,
        availableFor: 120,
        passingPeriod: false,
      },
    },
  },
  {
    id: "cif",
    name: "Campus Instructional Facility",
    type: FacilityType.ACADEMIC,
    isOpen: true,
    coordinates: { latitude: 40.1125, longitude: -88.2284 },
    hours: { open: "07:00", close: "23:00" },
    roomCounts: { available: 2, total: 2 },
    rooms: {
      "0027": {
        type: "academic",
        status: RoomStatus.AVAILABLE,
        availableFor: 90,
        passingPeriod: false,
      },
      "1404": {
        type: "academic",
        status: RoomStatus.AVAILABLE,
        availableFor: 30,
        passingPeriod: false,
      },
    },
  },
  {
    id: "main-library",
    name: "Main Library",
    type: FacilityType.LIBRARY,
    isOpen: true,
    coordinates: { latitude: 40.1047, longitude: -88.2286 },
    hours: { open: "08:00", close: "22:00" },
    roomCounts: { available: 2, total: 2 },
    rooms: {
      "Orange Room": {
        type: "library",
        status: RoomStatus.AVAILABLE,
        url: "",
        thumbnail: "",
        slots: [],
      },
      "Media Commons": {
        type: "library",
        status: RoomStatus.AVAILABLE,
        url: "",
        thumbnail: "",
        slots: [],
      },
    },
  },
];

describe("searchUtils performSearch with uFuzzy", () => {
  test("returns empty list for empty query or whitespace", () => {
    expect(performSearch(mockFacilities, "")).toHaveLength(0);
    expect(performSearch(mockFacilities, "   ")).toHaveLength(0);
  });

  test("finds all rooms in a building when searching by building alias", () => {
    const rooms = performSearch(mockFacilities, "siebel");
    expect(rooms).toHaveLength(3);
    // Available rooms should be prioritized before occupied rooms
    expect(rooms[0].roomNumber).toBe("0216");
    expect(rooms[1].roomNumber).toBe("2405");
    expect(rooms[2].roomNumber).toBe("1404");
  });

  test("matches building acronyms like CIF", () => {
    const rooms = performSearch(mockFacilities, "cif");
    expect(rooms).toHaveLength(2);
    expect(rooms.map((room) => room.roomNumber)).toContain("0027");
    expect(rooms.map((room) => room.roomNumber)).toContain("1404");
  });

  test("handles compound query of building and room number", () => {
    const rooms = performSearch(mockFacilities, "siebel 1404");
    expect(rooms).toHaveLength(1);
    expect(rooms[0].facility.id).toBe("siebel-cs");
    expect(rooms[0].roomNumber).toBe("1404");
  });

  test("handles out of order compound query", () => {
    const rooms = performSearch(mockFacilities, "0027 cif");
    expect(rooms).toHaveLength(1);
    expect(rooms[0].facility.id).toBe("cif");
    expect(rooms[0].roomNumber).toBe("0027");
  });

  test("matches exact room number across buildings", () => {
    const rooms = performSearch(mockFacilities, "1404");
    expect(rooms).toHaveLength(2);
    const facilityIds = rooms.map((room) => room.facility.id);
    expect(facilityIds).toContain("cif");
    expect(facilityIds).toContain("siebel-cs");
  });

  test("tolerates minor typos in building name", () => {
    const rooms = performSearch(mockFacilities, "sibel");
    expect(rooms).toHaveLength(3);
    expect(rooms.every((room) => room.facility.id === "siebel-cs")).toBe(true);
  });

  test("ranks more than 1,000 matches by relevance", () => {
    const rooms = Object.fromEntries(
      Array.from({ length: 1_001 }, (_, index) => [
        index === 1_000 ? "Hall West" : `West Hall ${index}`,
        {
          type: "academic" as const,
          status: RoomStatus.AVAILABLE,
          passingPeriod: false,
        },
      ]),
    );
    const facility = { ...mockFacilities[0], rooms };

    expect(performSearch([facility], "hall west")[0].roomNumber).toBe("Hall West");
  });

  test("respects active availability filter", () => {
    const rooms = performSearch(
      mockFacilities,
      "siebel",
      { minDuration: 90 },
      true
    );
    // Only 0216 has availableFor >= 90
    expect(rooms).toHaveLength(1);
    expect(rooms[0].roomNumber).toBe("0216");
  });
});

describe("searchFacilities", () => {
  test("returns all facilities when search term is empty", () => {
    expect(searchFacilities(mockFacilities, "")).toHaveLength(3);
    expect(searchFacilities(mockFacilities, "   ")).toHaveLength(3);
  });

  test("filters facilities by alias or acronym", () => {
    const cifResults = searchFacilities(mockFacilities, "cif");
    expect(cifResults).toHaveLength(1);
    expect(cifResults[0].id).toBe("cif");

    const siebelResults = searchFacilities(mockFacilities, "sibel");
    expect(siebelResults).toHaveLength(1);
    expect(siebelResults[0].id).toBe("siebel-cs");
  });
});

describe("getBuildingAliases", () => {
  test("generates lowercase acronyms and custom aliases", () => {
    const aliases = getBuildingAliases("Campus Instructional Facility");
    expect(aliases).toContain("cif");
    expect(aliases).toContain("campus instructional facility");
  });
});
