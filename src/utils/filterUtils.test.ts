import { describe, expect, test } from "bun:test";
import { isRoomAvailable } from "@/utils/filterUtils";
import { type AcademicRoom, type FacilityRoom, RoomStatus } from "@/types";

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
    const room = createRoom({ availableFor: 120 });
    const nowMinutes = 14 * 60;

    expect(isRoomAvailable(room, { freeUntil: "15:30", nowMinutes })).toBe(true);

    expect(isRoomAvailable(room, { freeUntil: "16:00", nowMinutes })).toBe(true);

    expect(isRoomAvailable(room, { freeUntil: "16:30", nowMinutes })).toBe(false);

    expect(isRoomAvailable(room, { freeUntil: "13:00", nowMinutes })).toBe(false);
  });

  test("combines minDuration and freeUntil", () => {
    const room = createRoom({ availableFor: 120 });
    const nowMinutes = 14 * 60;

    expect(isRoomAvailable(room, { minDuration: 60, freeUntil: "15:30", nowMinutes })).toBe(true);

    expect(isRoomAvailable(room, { minDuration: 150, freeUntil: "15:30", nowMinutes })).toBe(false);
  });
});
