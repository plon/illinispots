import { describe, expect, it } from "bun:test";
import type { FacilityRoom } from "@/types";
import { RoomStatus } from "@/types";
import { isRoomAvailable } from "./filterUtils";

function academicRoom(
  status: RoomStatus,
  availableFor = 90,
): FacilityRoom {
  return { type: "academic", status, availableFor };
}

describe("isRoomAvailable", () => {
  const now = new Date(2026, 7, 23, 10, 0, 30, 500);

  it("skips status checks when no filters are active", () => {
    expect(isRoomAvailable(academicRoom(RoomStatus.OCCUPIED), {})).toBe(true);
  });

  it("requires an available status and sufficient duration", () => {
    const criteria = { minDuration: 60, now };

    expect(
      isRoomAvailable(academicRoom(RoomStatus.AVAILABLE, 60), criteria),
    ).toBe(true);
    expect(
      isRoomAvailable(academicRoom(RoomStatus.PASSING_PERIOD, 59), criteria),
    ).toBe(false);
    expect(
      isRoomAvailable(academicRoom(RoomStatus.OCCUPIED, 120), criteria),
    ).toBe(false);
  });

  it("matches Moment's truncated minute differences without mutating now", () => {
    const originalValue = now.getTime();
    const room = academicRoom(RoomStatus.AVAILABLE, 89);

    expect(
      isRoomAvailable(room, {
        now,
        startTime: "11:00",
        freeUntil: "11:30",
      }),
    ).toBe(true);
    expect(now.getTime()).toBe(originalValue);
    expect(
      isRoomAvailable(room, { now, freeUntil: "11:31" }),
    ).toBe(false);
    expect(
      isRoomAvailable(room, { now, startTime: "09:59" }),
    ).toBe(false);
  });

  it("preserves cloned-target millisecond cancellation at minute boundaries", () => {
    const exactSecond = new Date(2026, 7, 23, 10, 0, 0, 500);

    expect(
      isRoomAvailable(academicRoom(RoomStatus.AVAILABLE, 59), {
        now: exactSecond,
        startTime: "11:00",
      }),
    ).toBe(false);
    expect(
      isRoomAvailable(academicRoom(RoomStatus.AVAILABLE, 60), {
        now: exactSecond,
        startTime: "11:00",
      }),
    ).toBe(true);
  });
});
