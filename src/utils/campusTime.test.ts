import { describe, expect, it } from "bun:test";
import moment from "moment-timezone";
import { CAMPUS_TIMEZONE, getCampusClock } from "./campusTime";

describe("getCampusClock", () => {
  it("matches Moment on both sides of Chicago DST transitions", () => {
    const instants = [
      // Spring: 01:59 CST jumps to 03:00 CDT.
      "2026-03-08T07:59:59.000Z",
      "2026-03-08T08:00:00.000Z",
      // Fall: 01:30 occurs once in CDT and once in CST.
      "2026-11-01T06:30:00.000Z",
      "2026-11-01T07:30:00.000Z",
      "2026-11-01T08:00:00.000Z",
    ];

    for (const instant of instants) {
      const date = new Date(instant);
      const nativeClock = getCampusClock(date);
      const momentClock = moment(date).tz(CAMPUS_TIMEZONE);

      expect(`${nativeClock.date} ${nativeClock.time}`).toBe(
        momentClock.format("YYYY-MM-DD HH:mm:ss"),
      );
      expect(nativeClock.hour).toBe(momentClock.hour());
      expect(nativeClock.minute).toBe(momentClock.minute());
    }
  });
});
