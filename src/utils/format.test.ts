import { describe, expect, it } from "bun:test";
import { formatTime } from "./format";

describe("formatTime", () => {
  it("formats terminal 24:00 as midnight", () => {
    expect(formatTime("23:00:00")).toBe("11:00 PM");
    expect(formatTime("24:00:00")).toBe("12:00 AM");
  });
});
