import { describe, expect, it } from "bun:test";
import type { FacilityStatus } from "@/types";
import { FacilityType } from "@/types";
import { indexFacilitiesById } from "./FavoritesSection";

describe("indexFacilitiesById", () => {
  it("indexes library facilities by their stored id rather than record key", () => {
    const facility = {
      id: "grainger",
      name: "Grainger Engineering Library",
      type: FacilityType.LIBRARY,
      coordinates: { latitude: 0, longitude: 0 },
      hours: { open: "08:00", close: "22:00" },
      rooms: {},
      isOpen: true,
      roomCounts: { available: 0, total: 0 },
    };
    const data: FacilityStatus = {
      timestamp: "2026-08-23T12:00:00Z",
      facilities: { "Grainger Engineering Library": facility },
    };

    expect(indexFacilitiesById(data).get("grainger")).toBe(facility);
  });
});
