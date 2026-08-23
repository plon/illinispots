import { describe, expect, it } from "bun:test";
import { millisecondsUntilNextMinute } from "@/hooks/useCurrentMinute";

describe("millisecondsUntilNextMinute", () => {
  it("waits one full minute when already on a minute boundary", () => {
    expect(millisecondsUntilNextMinute(120_000)).toBe(60_000);
  });

  it("aligns a timeout to the next minute boundary", () => {
    expect(millisecondsUntilNextMinute(120_001)).toBe(59_999);
    expect(millisecondsUntilNextMinute(179_999)).toBe(1);
  });
});
