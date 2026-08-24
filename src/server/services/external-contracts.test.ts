import { describe, expect, it } from "bun:test";
import {
  ExternalResponseError,
  parseAcademicAvailabilityPayload,
  parseReservationResponse,
  parseRoomSchedule,
} from "./external-contracts";

describe("external response contracts", () => {
  it("normalizes academic nulls and strips unknown fields", () => {
    const payload = {
      ignored: true,
      _cache: { hit: true, source: null, reason: null, ignored: true },
      buildings: {
        cif: {
          name: "Campus Instructional Facility",
          coordinates: { latitude: 40.09, longitude: -88.23, ignored: true },
          hours: { open: null, close: "22:00:00", ignored: true },
          rooms: {
            "1101": {
              status: "occupied",
              passingPeriod: null,
              availableAt: "10:15:00",
              availableFor: 45,
              availableUntil: null,
              currentClass: null,
              nextClass: {
                course: null,
                title: "Algorithms",
                time: null,
                upstreamExtension: "preserved",
              },
              ignored: true,
            },
          },
          isOpen: true,
          roomCounts: { available: 0, total: 1, ignored: true },
          ignored: true,
        },
      },
    };

    expect(parseAcademicAvailabilityPayload(payload)).toEqual({
      _cache: { hit: true, source: undefined, reason: undefined },
      buildings: {
        cif: {
          name: "Campus Instructional Facility",
          coordinates: { latitude: 40.09, longitude: -88.23 },
          hours: { open: "", close: "22:00:00" },
          rooms: {
            "1101": {
              status: "occupied",
              passingPeriod: undefined,
              availableAt: "10:15:00",
              availableFor: 45,
              availableUntil: undefined,
              currentClass: undefined,
              nextClass: {
                course: "",
                title: "Algorithms",
                upstreamExtension: "preserved",
              },
            },
          },
          isOpen: true,
          roomCounts: { available: 0, total: 1 },
        },
      },
    });
  });

  it("normalizes LibCal and room schedule payloads without mutating them", () => {
    const reservation = {
      slots: [
        {
          itemId: 25428,
          start: "2026-08-24 10:00:00",
          end: "2026-08-24 10:30:00",
          className: null,
          ignored: true,
        },
      ],
      ignored: true,
    };
    const schedule = [
      {
        start: "09:00:00",
        end: "10:00:00",
        status: "class",
        details: {
          type: "class",
          title: "Algorithms",
          course: null,
          ignored: true,
        },
        ignored: true,
      },
      {
        start: "10:00:00",
        end: "11:00:00",
        status: "available",
      },
    ];

    expect(parseReservationResponse(reservation)).toEqual({
      slots: [
        {
          itemId: 25428,
          start: "2026-08-24 10:00:00",
          end: "2026-08-24 10:30:00",
          className: undefined,
        },
      ],
    });
    expect(parseRoomSchedule(schedule)).toEqual([
      {
        start: "09:00:00",
        end: "10:00:00",
        status: "class",
        details: {
          type: "class",
          title: "Algorithms",
          course: undefined,
        },
      },
      {
        start: "10:00:00",
        end: "11:00:00",
        status: "available",
        details: null,
      },
    ]);
    expect(reservation.slots[0]).toHaveProperty("ignored", true);
    expect(schedule[0]).toHaveProperty("ignored", true);
  });

  it("retains detailed Zod failures for malformed responses", () => {
    expect(() =>
      parseAcademicAvailabilityPayload({
        buildings: {
          cif: {
            name: "CIF",
            coordinates: { latitude: Number.NaN, longitude: -88.23 },
          },
        },
      }),
    ).toThrow(
      expect.objectContaining({
        name: "ExternalResponseError",
        message: expect.stringContaining(
          "academic availability response at buildings.cif.coordinates.latitude",
        ),
      }),
    );

    expect(() =>
      parseReservationResponse({
        slots: [{ itemId: "25428", start: "a", end: "b" }],
      }),
    ).toThrow(ExternalResponseError);
    expect(() =>
      parseRoomSchedule([
        { start: "09:00:00", end: "10:00:00", status: "unknown" },
      ]),
    ).toThrow(ExternalResponseError);
  });
});
