import { describe, expect, it } from "bun:test";
import moment from "moment-timezone";
import { isLibraryOpen } from "./libraryHours";

const CAMPUS_TIMEZONE = "America/Chicago";

describe("isLibraryOpen", () => {
  it("keeps overnight hours open until, but not including, closing time", () => {
    const atCampusTime = (value: string) =>
      moment.tz(value, "YYYY-MM-DD HH:mm:ss", CAMPUS_TIMEZONE);

    expect(
      isLibraryOpen("Funk ACES Library", atCampusTime("2026-08-24 22:30:00")),
    ).toBe(true);
    expect(
      isLibraryOpen("Funk ACES Library", atCampusTime("2026-08-25 01:59:00")),
    ).toBe(true);
    expect(
      isLibraryOpen("Funk ACES Library", atCampusTime("2026-08-25 02:00:00")),
    ).toBe(false);
  });
});
