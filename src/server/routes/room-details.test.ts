import { describe, expect, it } from "bun:test";
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
});
