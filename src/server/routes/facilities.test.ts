import { describe, expect, it } from "bun:test";
import { DateTime } from "luxon";
import type { FacilityStatus } from "../../types";
import type { FacilityScope } from "../services/facilities";
import { createApp } from "../app";

describe("GET /api/facilities", () => {
  it("rejects an unsupported facility type before loading data", async () => {
    let calls = 0;
    const app = createApp({
      facilities: {
        getFacilityStatus: async () => {
          calls += 1;
          return { timestamp: "unused", facilities: {} };
        },
      },
    });

    const response = await app.request("/api/facilities?type=cafeteria");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Invalid type. Expected "academic", "library", or "all".',
    });
    expect(calls).toBe(0);
  });

  it("parses campus time and passes the requested scope to the service", async () => {
    const calls: Array<{ timestamp: string; scope: FacilityScope }> = [];
    const expected: FacilityStatus = {
      timestamp: "2026-08-20T15:30:00.000-05:00",
      facilities: {},
    };
    const app = createApp({
      facilities: {
        getFacilityStatus: async (target, scope) => {
          calls.push({ timestamp: target.toISO({ suppressMilliseconds: true })!, scope });
          return expected;
        },
      },
    });

    const response = await app.request(
      "/api/facilities?date=2026-08-20&time=15%3A30%3A00&type=academic",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual(expected);
    expect(calls).toEqual([
      { timestamp: "2026-08-20T15:30:00-05:00", scope: "academic" },
    ]);
  });

  it("falls back to the injected clock for incomplete date/time input", async () => {
    const fixedNow = DateTime.fromFormat(
      "2026-01-15 09:45:00",
      "yyyy-MM-dd HH:mm:ss",
      { zone: "America/Chicago" },
    );
    let receivedTimestamp = "";
    const app = createApp({
      facilities: {
        now: () => fixedNow,
        getFacilityStatus: async (target) => {
          receivedTimestamp = target.toISO({ suppressMilliseconds: true })!;
          return { timestamp: target.toISO()! ?? target.toString(), facilities: {} };
        },
      },
    });

    const response = await app.request("/api/facilities?date=not-a-date");

    expect(response.status).toBe(200);
    expect(receivedTimestamp).toBe("2026-01-15T09:45:00-06:00");
  });
});
