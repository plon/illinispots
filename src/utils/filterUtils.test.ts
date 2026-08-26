import { describe, expect, test } from "bun:test";
import { isRoomAvailable } from "@/utils/filterUtils";
import { AcademicRoom, FacilityRoom, RoomStatus } from "@/types";

const createRoom = (overrides: Partial<AcademicRoom> = {}): FacilityRoom => ({
  type: "academic",
  status: RoomStatus.AVAILABLE,
  availableFor: 120,
  passingPeriod: false,
  ...overrides,
});

describe("isRoomAvailable", () => {
  test("returns true when no criteria specified", () => {
    const room = createRoom();
    expect(isRoomAvailable(room, {})).toBe(true);
  });

  test("rejects unavailable or occupied rooms", () => {
    const room = createRoom({ status: RoomStatus.OCCUPIED });
    expect(isRoomAvailable(room, { minDuration: 30 })).toBe(false);
  });

  test("allows passing period rooms if duration matches", () => {
    const room = createRoom({ status: RoomStatus.PASSING_PERIOD, availableFor: 60 });
    expect(isRoomAvailable(room, { minDuration: 30 })).toBe(true);
    expect(isRoomAvailable(room, { minDuration: 90 })).toBe(false);
  });

  test("filters by minDuration", () => {
    const room = createRoom({ availableFor: 45 });
    expect(isRoomAvailable(room, { minDuration: 30 })).toBe(true);
    expect(isRoomAvailable(room, { minDuration: 45 })).toBe(true);
    expect(isRoomAvailable(room, { minDuration: 60 })).toBe(false);
  });

  test("filters by freeUntil time", () => {
    // Current time 14:00 (840 min), available for 120 min (until 16:00)
    const room = createRoom({ availableFor: 120 });
    const nowMinutes = 14 * 60; // 840

    // Free until 15:30 (90 min from now) -> valid
    expect(isRoomAvailable(room, { freeUntil: "15:30", nowMinutes })).toBe(true);

    // Free until 16:00 (120 min from now) -> valid
    expect(isRoomAvailable(room, { freeUntil: "16:00", nowMinutes })).toBe(true);

    // Free until 16:30 (150 min from now) -> invalid (only available 120 min)
    expect(isRoomAvailable(room, { freeUntil: "16:30", nowMinutes })).toBe(false);

    // Past time 13:00 -> invalid
    expect(isRoomAvailable(room, { freeUntil: "13:00", nowMinutes })).toBe(false);
  });

  test("combines minDuration and freeUntil", () => {
    const room = createRoom({ availableFor: 120 });
    const nowMinutes = 14 * 60;

    // Needs 60 min and free until 15:30 (90 min) -> passes both
    expect(isRoomAvailable(room, { minDuration: 60, freeUntil: "15:30", nowMinutes })).toBe(true);

    // Needs 150 min and free until 15:30 -> fails minDuration
    expect(isRoomAvailable(room, { minDuration: 150, freeUntil: "15:30", nowMinutes })).toBe(false);
  });
});
