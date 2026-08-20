import { describe, expect, it } from "bun:test";
import moment from "moment-timezone";
import type { RoomScheduleBlock } from "../../types";
import { createApp } from "../app";

const schedule: RoomScheduleBlock[] = [
  {
    start: "09:00:00",
    end: "10:00:00",
    status: "class",
    details: { type: "class", title: "Morning class" },
  },
  {
    start: "10:00:00",
    end: "11:00:00",
    status: "available",
    details: null,
  },
];

describe("GET /api/room-schedule", () => {
  it("requires a building and room", async () => {
    const app = createApp();
    const response = await app.request("/api/room-schedule");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Missing required parameters: buildingId and roomNumber",
    });
  });

  it("validates the date before loading a schedule", async () => {
    let calls = 0;
    const app = createApp({
      roomSchedule: {
        loadRoomSchedule: async () => {
          calls += 1;
          return schedule;
        },
      },
    });

    const response = await app.request(
      "/api/room-schedule?buildingId=ABC&roomNumber=101&date=08-20-2026",
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid date format. Use YYYY-MM-DD.",
    });
    expect(calls).toBe(0);
  });

  it("returns the current and future blocks and truncates the active block", async () => {
    const queries: unknown[] = [];
    const app = createApp({
      roomSchedule: {
        now: () => moment.tz("2026-08-20 08:00:00", "America/Chicago"),
        loadRoomSchedule: async (query) => {
          queries.push(query);
          return schedule;
        },
      },
    });

    const response = await app.request(
      "/api/room-schedule?buildingId=ABC&roomNumber=101&date=2026-08-20&time=09%3A37%3A00",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(queries).toEqual([
      { buildingId: "ABC", roomNumber: "101", date: "2026-08-20" },
    ]);
    expect(await response.json()).toEqual([
      { ...schedule[0], start: "09:30:00" },
      schedule[1],
    ]);
  });

  it("returns an empty list after the final block", async () => {
    const app = createApp({
      roomSchedule: { loadRoomSchedule: async () => schedule },
    });
    const response = await app.request(
      "/api/room-schedule?buildingId=ABC&roomNumber=101&date=2026-08-20&time=23%3A00%3A00",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});
