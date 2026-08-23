import { describe, expect, it } from "bun:test";
import { getLibraryHoursMessage } from "./libraryHoursData";

describe("getLibraryHoursMessage", () => {
  it("uses the campus weekday and marks overnight closing times", () => {
    const sundayInChicago = new Date("2026-08-24T00:30:00.000Z");

    expect(
      getLibraryHoursMessage("Funk ACES Library", sundayInChicago),
    ).toBe("Reservable hours for Sunday: 1:00 PM - 2:00 AM (next day)");
  });

  it("reports missing schedules", () => {
    expect(
      getLibraryHoursMessage("Unknown Library", new Date("2026-08-23")),
    ).toBe("Hours not available for this day");
  });
});
