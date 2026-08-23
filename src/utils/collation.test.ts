import { describe, expect, it } from "bun:test";
import { compareRoomNumbers } from "./collation";

describe("compareRoomNumbers", () => {
  it("sorts numeric room labels naturally and case-insensitively", () => {
    expect(["Room 10", "room 2", "Room 1"].sort(compareRoomNumbers)).toEqual([
      "Room 1",
      "room 2",
      "Room 10",
    ]);
  });
});
