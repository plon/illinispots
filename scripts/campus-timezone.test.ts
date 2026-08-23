import { describe, expect, it } from "bun:test";
import moment from "moment-timezone/moment-timezone.js";
import {
  CAMPUS_TIMEZONE,
  getPackedCampusTimezone,
} from "./campus-timezone.ts";

describe("campus-only timezone data", () => {
  it("keeps Chicago DST rules across historical and future dates", () => {
    const packedZone = getPackedCampusTimezone();
    expect(packedZone.startsWith(`${CAMPUS_TIMEZONE}|`)).toBe(true);

    moment.tz.add(packedZone);

    expect(moment.tz("1942-06-15", CAMPUS_TIMEZONE).format("Z z")).toBe(
      "-05:00 CWT",
    );
    expect(moment.tz("2026-01-15", CAMPUS_TIMEZONE).format("Z z")).toBe(
      "-06:00 CST",
    );
    expect(moment.tz("2026-07-15", CAMPUS_TIMEZONE).format("Z z")).toBe(
      "-05:00 CDT",
    );
    expect(moment.tz("2100-07-15", CAMPUS_TIMEZONE).format("Z z")).toBe(
      "-05:00 CDT",
    );
  });
});
