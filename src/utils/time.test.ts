import { describe, expect, it } from "bun:test";
import {
  addDateDays,
  differenceInCalendarDays,
  formatMinutesAsTime,
  formatShortMonthDay,
  formatTimeForDisplay,
  getCampusDateTimeParts,
  getDurationMinutes,
  getOvernightDurationMinutes,
  parseTimeToMinutes,
} from "./time";

describe("time helpers", () => {
  it("parses and formats wall-clock schedule times", () => {
    expect(parseTimeToMinutes("08:30:30")).toBe(510.5);
    expect(parseTimeToMinutes("24:00:00")).toBe(1440);
    expect(parseTimeToMinutes("24:01:00")).toBeNull();
    expect(formatMinutesAsTime(510.5)).toBe("08:30:30");
    expect(formatTimeForDisplay("13:05:00")).toBe("1:05 PM");
    expect(formatTimeForDisplay("24:00:00")).toBe("12:00 AM");
    expect(formatTimeForDisplay("8:05")).toBe("8:05 AM");
    expect(formatTimeForDisplay(undefined)).toBe("");
    expect(formatShortMonthDay("2026-03-08")).toBe("3/8");
    expect(formatShortMonthDay("2026-11-25")).toBe("11/25");
    expect(formatShortMonthDay("invalid")).toBe("invalid");
  });

  it("calculates ordinary and overnight durations", () => {
    expect(getDurationMinutes("08:30", "10:00")).toBe(90);
    expect(getDurationMinutes("23:30", "01:00")).toBe(0);
    expect(getOvernightDurationMinutes("23:30", "01:00")).toBe(90);
  });

  it("does date-only arithmetic without crossing DST boundaries", () => {
    expect(addDateDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(differenceInCalendarDays("2026-03-09", "2026-03-08")).toBe(1);
    expect(addDateDays("2026-02-30", 1)).toBeNull();
  });

  it("extracts campus wall time from an absolute timestamp", () => {
    const winter = getCampusDateTimeParts(
      new Date("2026-01-15T15:30:45.000Z"),
    );
    const summer = getCampusDateTimeParts(
      new Date("2026-08-15T15:30:45.000Z"),
    );

    expect({ date: winter.date, time: winter.time }).toEqual({
      date: "2026-01-15",
      time: "09:30:45",
    });
    expect({ date: summer.date, time: summer.time }).toEqual({
      date: "2026-08-15",
      time: "10:30:45",
    });
  });
});
