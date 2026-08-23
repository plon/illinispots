import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { RoomScheduleBlock } from "../../types";
import {
  loadRoomSchedule,
  RoomScheduleDatabaseError,
} from "./room-schedule";
import { ExternalResponseError } from "./external-contracts";

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

  it("coalesces concurrent requests for the same room and date", async () => {
    const schedule: RoomScheduleBlock[] = [
      {
        start: "09:00:00",
        end: "10:00:00",
        status: "available",
        details: null,
      },
    ];
    let calls = 0;
    let releaseRpc:
      | ((value: { data: RoomScheduleBlock[]; error: null }) => void)
      | undefined;
    const executeRpc = async () => {
      calls += 1;
      return await new Promise<{
        data: RoomScheduleBlock[];
        error: null;
      }>((resolve) => {
        releaseRpc = resolve;
      });
    };
    const query = {
      buildingId: "CIF",
      roomNumber: "1101",
      date: "2026-08-24",
    };

    const first = loadRoomSchedule(query, {
      executeRoomScheduleRpc: executeRpc,
    });
    const second = loadRoomSchedule(query, {
      executeRoomScheduleRpc: executeRpc,
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);
    releaseRpc?.({ data: schedule, error: null });

    const results = await Promise.all([first, second]);
    expect(results).toEqual([schedule, schedule]);
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

  it("rejects malformed schedules at the RPC boundary", async () => {
    spyOn(console, "error").mockImplementation(() => {});

    const operation = loadRoomSchedule(
      { buildingId: "CIF", roomNumber: "1101", date: "2026-08-24" },
      {
        executeRoomScheduleRpc: async () => ({
          data: [{ unexpected: true }],
          error: null,
        }),
      },
    );

    await expect(operation).rejects.toMatchObject({
      cause: expect.any(ExternalResponseError),
    });
  });
});
