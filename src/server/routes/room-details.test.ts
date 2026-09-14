import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { RoomDetails } from "../../types";
import { createApp } from "../app";

const details: RoomDetails[] = [
  {
    buildingName: "Campus Instructional Facility",
    roomNumber: "1025",
    capacity: 48,
    roomType: "Classroom",
    equipment: ["PC", "HDMI"],
    photoUrls: [],
    answersUrl: null,
  },
];

describe("GET /api/room-details", () => {
  afterEach(() => {
    mock.restore();
  });

  it("requires a building name", async () => {
    const app = createApp();
    const response = await app.request("/api/room-details");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Missing required parameter: buildingName",
    });
  });

  it("returns room details for a building", async () => {
    const queries: unknown[] = [];
    const app = createApp({
      roomDetails: {
        loadRoomDetails: async (query) => {
          queries.push(query);
          return details;
        },
      },
    });

    const response = await app.request(
      "/api/room-details?buildingName=Campus%20Instructional%20Facility",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(queries).toEqual([
      { buildingName: "Campus Instructional Facility" },
    ]);
    expect(await response.json()).toEqual(details);
  });

  it("does not expose unexpected loader errors", async () => {
    spyOn(console, "error").mockImplementation(() => {});
    const app = createApp({
      roomDetails: {
        loadRoomDetails: async () => {
          throw new Error("private database details");
        },
      },
    });

    const response = await app.request(
      "/api/room-details?buildingName=Campus%20Instructional%20Facility",
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      error: "Failed to fetch room details",
    });
  });
});
