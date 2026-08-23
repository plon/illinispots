import { describe, expect, it } from "bun:test";
import moment from "moment-timezone";
import {
  type Facility,
  type FacilityStatus,
  FacilityType,
  RoomStatus,
} from "@/types";
import { projectFacilityStatus } from "@/utils/liveAvailability";

const CAMPUS_TIMEZONE = "America/Chicago";

function atCampusTime(value: string): Date {
  return moment.tz(value, "YYYY-MM-DD HH:mm:ss", CAMPUS_TIMEZONE).toDate();
}

function statusWith(facility: Facility, timestamp = "2026-08-24 10:00:00"): FacilityStatus {
  return {
    timestamp: moment
      .tz(timestamp, "YYYY-MM-DD HH:mm:ss", CAMPUS_TIMEZONE)
      .toISOString(),
    facilities: { [facility.id]: facility },
  };
}

describe("projectFacilityStatus", () => {
  it("decrements an available academic room and enters its next class", () => {
    const snapshot = statusWith({
      id: "siebel",
      name: "Siebel Center",
      type: FacilityType.ACADEMIC,
      coordinates: { latitude: 0, longitude: 0 },
      hours: { open: "08:00:00", close: "22:00:00" },
      isOpen: true,
      roomCounts: { available: 1, total: 1 },
      rooms: {
        "1101": {
          type: "academic",
          status: RoomStatus.AVAILABLE,
          availableFor: 30,
          availableUntil: "10:30:00",
          nextClass: {
            course: "CS 225",
            title: "Data Structures",
            time: { start: "10:30:00", end: "11:20:00" },
          },
        },
      },
    });

    const duringGap = projectFacilityStatus(
      snapshot,
      atCampusTime("2026-08-24 10:10:30"),
    );
    expect(duringGap.facilities.siebel.rooms["1101"]).toMatchObject({
      status: RoomStatus.PASSING_PERIOD,
      availableFor: 20,
      passingPeriod: true,
    });

    const duringClass = projectFacilityStatus(
      snapshot,
      atCampusTime("2026-08-24 10:35:00"),
    );
    expect(duringClass.facilities.siebel.rooms["1101"]).toMatchObject({
      status: RoomStatus.OCCUPIED,
      currentClass: { course: "CS 225" },
    });
    expect(duringClass.facilities.siebel.roomCounts.available).toBe(0);
  });

  it("makes an occupied academic room available at its loaded boundary", () => {
    const snapshot = statusWith({
      id: "cif",
      name: "Campus Instructional Facility",
      type: FacilityType.ACADEMIC,
      coordinates: { latitude: 0, longitude: 0 },
      hours: { open: "07:00:00", close: "22:00:00" },
      isOpen: true,
      roomCounts: { available: 0, total: 1 },
      rooms: {
        "0027": {
          type: "academic",
          status: RoomStatus.OPENING_SOON,
          currentClass: {
            course: "MATH 241",
            title: "Calculus III",
            time: { start: "09:00:00", end: "10:10:00" },
          },
          availableAt: "10:10:00",
          availableFor: 50,
        },
      },
    });

    const projected = projectFacilityStatus(
      snapshot,
      atCampusTime("2026-08-24 10:20:00"),
    );
    expect(projected.facilities.cif.rooms["0027"]).toMatchObject({
      status: RoomStatus.AVAILABLE,
      availableFor: 40,
      availableUntil: "11:00:00",
    });
    expect(projected.facilities.cif.roomCounts.available).toBe(1);
  });

  it("recomputes library room status from the loaded reservation slots", () => {
    const snapshot = statusWith({
      id: "grainger",
      name: "Grainger Engineering Library",
      type: FacilityType.LIBRARY,
      coordinates: { latitude: 0, longitude: 0 },
      hours: { open: "08:00", close: "23:59" },
      isOpen: true,
      roomCounts: { available: 0, total: 1 },
      rooms: {
        "407": {
          type: "library",
          status: RoomStatus.RESERVED,
          url: "https://example.com",
          thumbnail: "",
          slots: [
            { start: "10:00:00", end: "10:30:00", available: false },
            { start: "10:30:00", end: "11:00:00", available: true },
            { start: "11:00:00", end: "11:30:00", available: true },
          ],
        },
      },
    });

    const openingSoon = projectFacilityStatus(
      snapshot,
      atCampusTime("2026-08-24 10:15:00"),
    );
    expect(openingSoon.facilities.grainger.rooms["407"]).toMatchObject({
      status: RoomStatus.OPENING_SOON,
      availableAt: "10:30:00",
      availableFor: 60,
    });

    const available = projectFacilityStatus(
      snapshot,
      atCampusTime("2026-08-24 10:45:00"),
    );
    expect(available.facilities.grainger.rooms["407"]).toMatchObject({
      status: RoomStatus.AVAILABLE,
      availableFor: 45,
    });
    expect(available.facilities.grainger.roomCounts.available).toBe(1);
    expect(available.timestamp).toBe(
      moment(atCampusTime("2026-08-24 10:45:00"))
        .tz(CAMPUS_TIMEZONE)
        .toISOString(),
    );
  });

  it("handles loaded library slots that cross midnight", () => {
    const snapshot = statusWith(
      {
        id: "aces",
        name: "Funk ACES Library",
        type: FacilityType.LIBRARY,
        coordinates: { latitude: 0, longitude: 0 },
        hours: { open: "08:30", close: "02:00" },
        isOpen: true,
        roomCounts: { available: 0, total: 1 },
        rooms: {
          "301": {
            type: "library",
            status: RoomStatus.RESERVED,
            url: "https://example.com",
            thumbnail: "",
            slots: [
              { start: "23:30:00", end: "00:00:00", available: false },
              { start: "00:00:00", end: "01:00:00", available: true },
            ],
          },
        },
      },
      "2026-08-24 23:30:00",
    );

    const projected = projectFacilityStatus(
      snapshot,
      atCampusTime("2026-08-25 00:15:00"),
    );
    expect(projected.facilities.aces.rooms["301"]).toMatchObject({
      status: RoomStatus.AVAILABLE,
      availableFor: 45,
    });
  });

  it("does not mutate the loaded query value", () => {
    const snapshot = statusWith({
      id: "empty",
      name: "Empty Building",
      type: FacilityType.ACADEMIC,
      coordinates: { latitude: 0, longitude: 0 },
      hours: { open: "08:00:00", close: "17:00:00" },
      isOpen: true,
      roomCounts: { available: 0, total: 0 },
      rooms: {},
    });

    const projected = projectFacilityStatus(
      snapshot,
      atCampusTime("2026-08-24 18:00:00"),
    );
    expect(snapshot.facilities.empty.isOpen).toBe(true);
    expect(projected.facilities.empty.isOpen).toBe(false);
  });
});
