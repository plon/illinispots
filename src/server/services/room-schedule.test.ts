import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { RoomScheduleBlock } from "../../types";
import {
  loadRoomSchedule,
  RoomScheduleDatabaseError,
} from "./room-schedule";

describe("loadRoomSchedule", () => {
  afterEach(() => {
    mock.restore();
  });

  it("uses the database contract and returns its schedule", async () => {
    const schedule: RoomScheduleBlock[] = [
      {
        start: "09:00:00",
        end: "10:00:00",
        status: "class",
        details: { type: "class", title: "Algorithms", course: "CS 374" },
      },
    ];
    const rpcCalls: unknown[] = [];

    const result = await loadRoomSchedule(
      { buildingId: "CIF", roomNumber: "1101", date: "2026-08-24" },
      {
        executeRoomScheduleRpc: async (procedure, parameters) => {
          rpcCalls.push({ procedure, parameters });
          return { data: schedule, error: null };
        },
      },
    );

    expect(rpcCalls).toEqual([
      {
        procedure: "get_room_schedule_cached",
        parameters: {
          building_id_param: "CIF",
          room_number_param: "1101",
          check_date_param: "2026-08-24",
        },
      },
    ]);
    expect(result).toEqual(schedule);
  });

  it("converts database failures into the service error contract", async () => {
    spyOn(console, "error").mockImplementation(() => {});
    const databaseError = new Error("connection unavailable");

    const operation = loadRoomSchedule(
      { buildingId: "CIF", roomNumber: "1101", date: "2026-08-24" },
      {
        executeRoomScheduleRpc: async () => ({
          data: null,
          error: databaseError,
        }),
      },
    );

    await expect(operation).rejects.toBeInstanceOf(RoomScheduleDatabaseError);
    await expect(operation).rejects.toMatchObject({ cause: databaseError });
  });
});
