import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AcademicRoom, LibraryRoom, RoomStatus } from "@/types";
import {
  getRoomAvailabilityMessage,
  groupAcademicRooms,
} from "./roomUtils";
import type { RoomEntry } from "./roomUtils";

const renderAvailabilityMessage = (room: LibraryRoom) =>
  renderToStaticMarkup(getRoomAvailabilityMessage(room));

describe("getRoomAvailabilityMessage", () => {
  it("returns Unavailable for UNAVAILABLE status", () => {
    const room: LibraryRoom = {
      type: "library",
      status: RoomStatus.UNAVAILABLE,
      url: "https://example.com",
      thumbnail: "",
      slots: [],
    };
    expect(renderAvailabilityMessage(room)).toContain("Unavailable");
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
    expect(renderAvailabilityMessage(room)).toContain("Available for 1h 30m");
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
    expect(renderAvailabilityMessage(room)).toContain("Opens at");
  });

  it("returns Fully booked when status is OCCUPIED without availableAt", () => {
    const room: LibraryRoom = {
      type: "library",
      status: RoomStatus.OCCUPIED,
      url: "https://example.com",
      thumbnail: "",
      slots: [],
    };
    expect(renderAvailabilityMessage(room)).toContain("Fully booked");
  });
});

describe("groupAcademicRooms", () => {
  const room = (status: RoomStatus): AcademicRoom => ({
    type: "academic",
    status,
  });

  it("uses explicit status groups without labeling reserved rooms occupied", () => {
    const rooms: RoomEntry[] = [
      ["available", room(RoomStatus.AVAILABLE)],
      ["passing", room(RoomStatus.PASSING_PERIOD)],
      ["occupied", room(RoomStatus.OCCUPIED)],
      ["opening", room(RoomStatus.OPENING_SOON)],
      ["reserved", room(RoomStatus.RESERVED)],
      ["unavailable", room(RoomStatus.UNAVAILABLE)],
    ];

    const groups = groupAcademicRooms(rooms);

    expect(groups.availableRooms.map(([name]) => name)).toEqual([
      "available",
      "passing",
    ]);
    expect(groups.occupiedRooms.map(([name]) => name)).toEqual([
      "occupied",
      "opening",
    ]);
  });
});
