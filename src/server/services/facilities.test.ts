import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import moment from "moment-timezone";
import { FacilityType, RoomStatus } from "../../types";
import { getFacilityStatus, type FacilitiesFetch } from "./facilities";

const CAMPUS_TIMEZONE = "America/Chicago";

describe("getFacilityStatus", () => {
  afterEach(() => {
    mock.restore();
  });

  it("maps the academic RPC contract into room availability", async () => {
    const target = moment.tz(
      "2026-08-24 10:00:00",
      "YYYY-MM-DD HH:mm:ss",
      CAMPUS_TIMEZONE,
    );
    const rpcCalls: unknown[] = [];
    const unexpectedFetch: FacilitiesFetch = async () => {
      throw new Error("LibCal should not be called for academic scope");
    };

    const result = await getFacilityStatus(target, "academic", {
      fetch: unexpectedFetch,
      executeAcademicAvailabilityRpc: async (procedure, parameters) => {
        rpcCalls.push({ procedure, parameters });
        return {
          data: {
            _cache: { hit: true, source: "room_availability_cache" },
            buildings: {
              siebel: {
                name: "Siebel Center",
                coordinates: { latitude: 40.114, longitude: -88.224 },
                hours: { open: "08:00:00", close: "22:00:00" },
                isOpen: true,
                roomCounts: { available: 2, total: 4 },
                rooms: {
                  "1101": {
                    status: "available",
                    passingPeriod: false,
                    availableFor: 90,
                  },
                  "1102": {
                    status: "available",
                    passingPeriod: true,
                    availableFor: 10,
                  },
                  "1103": {
                    status: "occupied",
                    availableAt: "10:15:00",
                    availableFor: 45,
                  },
                  "1104": {
                    status: "occupied",
                    availableAt: "11:00:00",
                    availableFor: -5,
                  },
                },
              },
            },
          },
          error: null,
        };
      },
    });

    expect(rpcCalls).toEqual([
      {
        procedure: "get_cached_spots",
        parameters: {
          check_time_param: "10:00:00",
          check_date_param: "2026-08-24",
          min_minutes_param: 30,
        },
      },
    ]);
    expect(result.timestamp).toBe(target.toISOString());

    const facility = result.facilities.siebel;
    expect(facility.type).toBe(FacilityType.ACADEMIC);
    expect(facility.rooms["1101"].status).toBe(RoomStatus.AVAILABLE);
    expect(facility.rooms["1102"].status).toBe(RoomStatus.PASSING_PERIOD);
    expect(facility.rooms["1103"].status).toBe(RoomStatus.OPENING_SOON);
    expect(facility.rooms["1104"]).toMatchObject({
      status: RoomStatus.OCCUPIED,
      availableFor: 0,
    });
  });

  it("rejects malformed academic responses instead of returning invalid facilities", async () => {
    spyOn(console, "error").mockImplementation(() => {});
    const target = moment.tz(
      "2026-08-24 10:00:00",
      "YYYY-MM-DD HH:mm:ss",
      CAMPUS_TIMEZONE,
    );

    const result = await getFacilityStatus(target, "academic", {
      executeAcademicAvailabilityRpc: async () => ({
        data: { buildings: { malformed: {} } },
        error: null,
      }),
    });

    expect(result.facilities).toEqual({});
  });

  it("maps LibCal slots into current, upcoming, and unavailable rooms", async () => {
    const target = moment.tz(
      "2026-08-24 08:15:00",
      "YYYY-MM-DD HH:mm:ss",
      CAMPUS_TIMEZONE,
    );
    const requests: Array<{ url: string; body: URLSearchParams }> = [];
    const fetchLibCal: FacilitiesFetch = async (input, init) => {
      requests.push({
        url: String(input),
        body: new URLSearchParams(String(init?.body)),
      });

      return Response.json({
        slots: [
          {
            itemId: 25428,
            start: "2026-08-24 08:00:00",
            end: "2026-08-24 09:00:00",
          },
          {
            itemId: 25436,
            start: "2026-08-24 08:00:00",
            end: "2026-08-24 08:30:00",
            className: "s-lc-eq-checkout",
          },
          {
            itemId: 25436,
            start: "2026-08-24 08:30:00",
            end: "2026-08-24 09:30:00",
          },
        ],
      });
    };
    const unexpectedRpc = async () => {
      throw new Error("Supabase should not be called for library scope");
    };

    const result = await getFacilityStatus(target, "library", {
      fetch: fetchLibCal,
      executeAcademicAvailabilityRpc: unexpectedRpc,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(
      "https://libcal.library.illinois.edu/spaces/availability/grid",
    );
    expect(Object.fromEntries(requests[0].body)).toMatchObject({
      lid: "3606",
      start: "2026-08-24",
      end: "2026-08-25",
      pageSize: "10000",
    });

    const grainger = result.facilities["Grainger Engineering Library"];
    expect(grainger).toMatchObject({
      isOpen: true,
      roomCounts: { available: 1, total: 9 },
    });
    expect(grainger.rooms["405"]).toMatchObject({
      status: RoomStatus.AVAILABLE,
      availableFor: 45,
    });
    expect(grainger.rooms["407"]).toMatchObject({
      status: RoomStatus.OPENING_SOON,
      availableAt: "08:30:00",
      availableFor: 60,
    });
    expect(grainger.rooms["408 collaboration"].status).toBe(
      RoomStatus.UNAVAILABLE,
    );
  });

  it("requests the additional calendar day needed for Funk's overnight hours", async () => {
    const target = moment.tz(
      "2026-08-24 22:30:00",
      "YYYY-MM-DD HH:mm:ss",
      CAMPUS_TIMEZONE,
    );
    const requestWindows: Record<string, { start: string; end: string }> = {};
    const fetchLibCal: FacilitiesFetch = async (_input, init) => {
      const body = new URLSearchParams(String(init?.body));
      requestWindows[body.get("lid") ?? "unknown"] = {
        start: body.get("start") ?? "",
        end: body.get("end") ?? "",
      };
      return Response.json({ slots: [] });
    };

    await getFacilityStatus(target, "library", { fetch: fetchLibCal });

    expect(requestWindows).toEqual({
      "3604": { start: "2026-08-24", end: "2026-08-26" },
      "3606": { start: "2026-08-24", end: "2026-08-25" },
    });
  });

  it("caps overnight availability at the active interval's closing time", async () => {
    const target = moment.tz(
      "2026-08-25 01:30:00",
      "YYYY-MM-DD HH:mm:ss",
      CAMPUS_TIMEZONE,
    );
    const fetchLibCal: FacilitiesFetch = async () =>
      Response.json({
        slots: [
          {
            itemId: 23939,
            start: "2026-08-25 01:00:00",
            end: "2026-08-25 03:00:00",
          },
        ],
      });

    const result = await getFacilityStatus(target, "library", {
      fetch: fetchLibCal,
    });

    expect(result.facilities["Funk ACES Library"].rooms["301"]).toMatchObject({
      status: RoomStatus.AVAILABLE,
      availableFor: 30,
      slots: [
        { start: "01:00:00", end: "02:00:00", available: true },
      ],
    });
  });

  it("preserves other facility results when one LibCal request times out", async () => {
    spyOn(console, "error").mockImplementation(() => {});
    const target = moment.tz(
      "2026-08-24 10:00:00",
      "YYYY-MM-DD HH:mm:ss",
      CAMPUS_TIMEZONE,
    );
    const partiallyTimedOutFetch: FacilitiesFetch = async (
      _input,
      init,
    ) => {
      const lid = new URLSearchParams(String(init?.body)).get("lid");
      if (lid === "3604") {
        throw new DOMException("The operation timed out", "TimeoutError");
      }

      return Response.json({
        slots:
          lid === "3606"
            ? [
                {
                  itemId: 25428,
                  start: "2026-08-24 10:00:00",
                  end: "2026-08-24 11:00:00",
                },
              ]
            : [],
      });
    };

    const result = await getFacilityStatus(target, "all", {
      fetch: partiallyTimedOutFetch,
      executeAcademicAvailabilityRpc: async () => ({
        data: {
          buildings: {
            cif: {
              name: "Campus Instructional Facility",
              coordinates: { latitude: 40.0, longitude: -88.0 },
              hours: { open: "07:00:00", close: "22:00:00" },
              isOpen: true,
              roomCounts: { available: 0, total: 0 },
              rooms: {},
            },
          },
        },
        error: null,
      }),
    });

    expect(result.facilities.cif.name).toBe(
      "Campus Instructional Facility",
    );
    expect(result.facilities["Grainger Engineering Library"].roomCounts).toEqual(
      { available: 1, total: 9 },
    );
    expect(result.facilities["Funk ACES Library"]).toBeUndefined();
  });
});
