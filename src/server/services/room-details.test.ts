import { describe, expect, it } from "bun:test";
import { loadRoomDetails } from "./room-details";

describe("loadRoomDetails", () => {
  it("ignores non-object and malformed rows", async () => {
    const result = await loadRoomDetails(
      { buildingName: "Armory" },
      {
        queryRoomDetailsTable: async () => ({
          data: [
            null,
            "not a row",
            { building_name: "Armory" },
            {
              building_name: "Armory",
              room_number: "145",
              capacity: 24,
              room_type: "Classroom",
              equipment: ["Projector", null],
              photo_urls: ["https://example.com/room.jpg", 42],
              answers_url: "https://answers.uillinois.edu/57489",
            },
          ],
          error: null,
        }),
      },
    );

    expect(result).toEqual([
      {
        buildingName: "Armory",
        roomNumber: "145",
        capacity: 24,
        roomType: "Classroom",
        equipment: ["Projector"],
        photoUrls: ["https://example.com/room.jpg"],
        answersUrl: "https://answers.uillinois.edu/57489",
      },
    ]);
  });
});
