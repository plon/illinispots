import { describe, expect, it } from "bun:test";
import { FacilityStatus, FacilityType, RoomStatus } from "@/types";
import {
  ageLiveAvailability,
  shouldRefetchFacilitiesOnReconnect,
} from "./liveUpdates";

function academicData(overrides: Partial<FacilityStatus> = {}): FacilityStatus {
  return {
    timestamp: "2026-08-24T09:00:00-05:00",
    facilities: {
      dcl: {
        id: "dcl",
        name: "Digital Computer Laboratory",
        type: FacilityType.ACADEMIC,
        coordinates: { latitude: 0, longitude: 0 },
        hours: { open: "08:00", close: "22:00" },
        isOpen: true,
        roomCounts: { available: 0, total: 1 },
        rooms: {
          "1320": {
            type: "academic",
            status: RoomStatus.OCCUPIED,
            currentClass: {
              course: "CS 101",
              title: "Intro",
              time: { start: "09:00:00", end: "09:50:00" },
            },
            nextClass: {
              course: "CS 102",
              title: "Next",
              time: { start: "10:00:00", end: "10:50:00" },
            },
            availableAt: "09:50:00",
          },
        },
      },
    },
    ...overrides,
  };
}

describe("ageLiveAvailability", () => {
  it("counts down current availability without changing future windows", () => {
    const data = academicData();
    const room = data.facilities.dcl.rooms["1320"];
    room.status = RoomStatus.AVAILABLE;
    room.availableFor = 50;
    data.facilities.dcl.rooms.future = {
      type: "academic",
      status: RoomStatus.OCCUPIED,
      availableAt: "10:00:00",
      availableFor: 30,
    };

    const aged = ageLiveAvailability(
      data,
      new Date("2026-08-24T09:07:00-05:00"),
    );

    expect(aged?.facilities.dcl.rooms["1320"].availableFor).toBe(43);
    expect(aged?.facilities.dcl.rooms.future.availableFor).toBe(30);
    expect(data.facilities.dcl.rooms["1320"].availableFor).toBe(50);
  });
});

describe("shouldRefetchFacilitiesOnReconnect", () => {
  it("does not refetch stale live data when a hidden tab comes online", () => {
    expect(shouldRefetchFacilitiesOnReconnect(true, "hidden")).toBe(false);
  });

  it("allows visible live data and fixed-time data to refetch", () => {
    expect(shouldRefetchFacilitiesOnReconnect(true, "visible")).toBe(true);
    expect(shouldRefetchFacilitiesOnReconnect(false, "hidden")).toBe(true);
  });
});
