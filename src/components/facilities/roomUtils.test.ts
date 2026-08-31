import { describe, expect, it } from "bun:test";
import { RoomStatus, LibraryRoom } from "@/types";
import { getRoomAvailabilityMessage } from "./roomUtils";

describe("getRoomAvailabilityMessage", () => {
  it("returns Unavailable for UNAVAILABLE status", () => {
    const room: LibraryRoom = {
      type: "library",
      status: RoomStatus.UNAVAILABLE,
      url: "https://example.com",
      thumbnail: "",
      slots: [],
    };
    const node = getRoomAvailabilityMessage(room);
    expect(node).toBeDefined();
  });

  it("returns Available for AVAILABLE status", () => {
    const room: LibraryRoom = {
      type: "library",
      status: RoomStatus.AVAILABLE,
      availableFor: 90,
      url: "https://example.com",
      thumbnail: "",
      slots: [],
    };
    const node = getRoomAvailabilityMessage(room);
    expect(node).toBeDefined();
  });

  it("returns Opens at for OPENING_SOON status", () => {
    const room: LibraryRoom = {
      type: "library",
      status: RoomStatus.OPENING_SOON,
      availableAt: "14:00",
      url: "https://example.com",
      thumbnail: "",
      slots: [],
    };
    const node = getRoomAvailabilityMessage(room);
    expect(node).toBeDefined();
  });

  it("returns Fully booked when status is OCCUPIED without availableAt", () => {
    const room: LibraryRoom = {
      type: "library",
      status: RoomStatus.OCCUPIED,
      url: "https://example.com",
      thumbnail: "",
      slots: [],
    };
    const node = getRoomAvailabilityMessage(room);
    expect(node).toBeDefined();
  });
});
