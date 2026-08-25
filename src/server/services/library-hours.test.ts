import { describe, expect, it } from "bun:test";
import { DateTime } from "luxon";
import { isLibraryOpen } from "./library-hours";

const CAMPUS_TIMEZONE = "America/Chicago";

describe("isLibraryOpen", () => {
  it("keeps overnight hours open until, but not including, closing time", () => {
    const atCampusTime = (value: string) =>
      DateTime.fromFormat(value, "yyyy-MM-dd HH:mm:ss", { zone: CAMPUS_TIMEZONE });

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
