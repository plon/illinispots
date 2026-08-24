import { describe, expect, it } from "bun:test";
import {
  clockDurationMinutes,
  formatClockTimeSeconds,
  parseClockTimeSeconds,
} from "./clockTime";

describe("clockDurationMinutes", () => {
  it("calculates same-day and overnight durations", () => {
    expect(clockDurationMinutes("08:15:30", "09:45:30")).toBe(90);
    expect(clockDurationMinutes("23:30:00", "00:15:00")).toBe(45);
    expect(clockDurationMinutes("23:30:00", "24:00:00")).toBe(30);
  });

  it("preserves the end-of-day boundary", () => {
    expect(parseClockTimeSeconds("24:00:00")).toBe(24 * 60 * 60);
    expect(formatClockTimeSeconds(24 * 60 * 60)).toBe("24:00:00");
  });

  it("truncates partial minutes and rejects malformed clocks", () => {
    expect(clockDurationMinutes("08:00:30", "08:01:29")).toBe(0);
    expect(clockDurationMinutes("not-a-time", "09:00:00")).toBe(0);
    expect(parseClockTimeSeconds("24:00:01")).toBeNull();
  });
});
