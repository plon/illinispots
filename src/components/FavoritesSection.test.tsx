import { describe, expect, it } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FavoritesSection } from "./FavoritesSection";
import { FacilityType } from "@/types";

describe("FavoritesSection", () => {
  it("returns null when favorites list is empty", () => {
    const html = renderToStaticMarkup(
      <FavoritesSection
        favorites={[]}
        facilityData={null}
        onFavoriteClick={() => {}}
        onToggleFavorite={() => {}}
      />,
    );

    expect(html).toBe("");
  });

  it("renders remove button with unique accessible aria-label and title including favorite name", () => {
    const favorites = [
      { id: "grainger", name: "Grainger Engineering Library", type: "library" as const },
      { id: "siebel", name: "Siebel Center for CS", type: "academic" as const },
    ];

    const html = renderToStaticMarkup(
      <FavoritesSection
        favorites={favorites}
        facilityData={{
          timestamp: "2026-09-01T12:00:00Z",
          facilities: {
            grainger: {
              id: "grainger",
              name: "Grainger Engineering Library",
              type: FacilityType.LIBRARY,
              coordinates: { latitude: 40.1125, longitude: -88.2269 },
              hours: { open: "08:00", close: "23:00" },
              rooms: {},
              isOpen: true,
              roomCounts: { available: 5, total: 10 },
            },
          },
        }}
        onFavoriteClick={() => {}}
        onToggleFavorite={() => {}}
      />,
    );

    expect(html).toContain('aria-label="Remove Grainger Engineering Library from favorites"');
    expect(html).toContain('title="Remove Grainger Engineering Library from favorites"');
    expect(html).toContain('aria-label="Remove Siebel Center for CS from favorites"');
    expect(html).toContain('title="Remove Siebel Center for CS from favorites"');
  });
});
