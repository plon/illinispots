if (typeof globalThis.window !== "undefined") {
  if (!globalThis.window.addEventListener) {
    globalThis.window.addEventListener = () => {};
  }
  if (!globalThis.window.removeEventListener) {
    globalThis.window.removeEventListener = () => {};
  }
}

import { describe, expect, it, mock } from "bun:test";

mock.module("posthog-js", () => ({
  default: {
    init: () => {},
    capture: () => {},
    register: () => {},
    on: () => {},
  },
  posthog: {
    init: () => {},
    capture: () => {},
    register: () => {},
    on: () => {},
  },
}));

mock.module("@posthog/react", () => ({
  usePostHog: () => ({ capture: () => {} }),
  PostHogProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FacilityListItem } from "./FacilityListItem";
import { FacilityListView } from "./FacilityListView";
import { FacilityDetailPage } from "./FacilityDetailPage";
import { type Facility, FacilityType, RoomStatus } from "@/types";

const mockAcademicFacility: Facility = {
  id: "cif",
  name: "Campus Instructional Facility",
  type: FacilityType.ACADEMIC,
  isOpen: true,
  coordinates: { latitude: 40.1125, longitude: -88.2269 },
  hours: { open: "07:00", close: "23:00" },
  roomCounts: { available: 2, total: 3 },
  rooms: {
    "1025": {
      type: "academic",
      status: RoomStatus.AVAILABLE,
      availableFor: 90,
    },
    "2035": {
      type: "academic",
      status: RoomStatus.OCCUPIED,
      currentClass: { course: "CS 225", title: "Data Structures" },
    },
    "3025": {
      type: "academic",
      status: RoomStatus.AVAILABLE,
      availableFor: 60,
    },
  },
};

const mockClosedFacility: Facility = {
  id: "siebel",
  name: "Siebel Center for CS",
  type: FacilityType.ACADEMIC,
  isOpen: false,
  coordinates: { latitude: 40.1138, longitude: -88.2249 },
  hours: { open: "08:00", close: "22:00" },
  roomCounts: { available: 0, total: 5 },
  rooms: {},
};

const mockLibraryFacility: Facility = {
  id: "grainger",
  name: "Grainger Engineering Library",
  type: FacilityType.LIBRARY,
  isOpen: true,
  coordinates: { latitude: 40.1125, longitude: -88.2269 },
  hours: { open: "00:00", close: "23:59" },
  roomCounts: { available: 4, total: 10 },
  rooms: {},
};

describe("FacilityListItem", () => {
  it("renders facility name and available count badge", () => {
    const html = renderToStaticMarkup(
      <FacilityListItem
        facility={mockAcademicFacility}
        onSelect={() => {}}
      />,
    );

    expect(html).toContain("Campus Instructional Facility");
    expect(html).toContain("2/3");
    expect(html).toContain('aria-label="View Campus Instructional Facility details"');
  });

  it("renders CLOSED badge when facility is closed", () => {
    const html = renderToStaticMarkup(
      <FacilityListItem
        facility={mockClosedFacility}
        onSelect={() => {}}
      />,
    );

    expect(html).toContain("Siebel Center for CS");
    expect(html).toContain("CLOSED");
  });
});

describe("FacilityListView", () => {
  it("renders library and academic building sections as clean lists", () => {
    const html = renderToStaticMarkup(
      <FacilityListView
        libraryFacilities={[mockLibraryFacility]}
        academicFacilities={[mockAcademicFacility, mockClosedFacility]}
        onSelectFacility={() => {}}
      />,
    );

    expect(html).toContain("Library");
    expect(html).toContain("Academic");
    expect(html).toContain("Grainger Engineering Library");
    expect(html).toContain("Campus Instructional Facility");
    expect(html).toContain("Siebel Center for CS");
    // Should NOT contain accordion classes or accordion triggers
    expect(html).not.toContain("data-slot=\"accordion\"");
  });
});

describe("FacilityDetailPage", () => {
  it("renders building title, hours, and available rooms", () => {
    const html = renderToStaticMarkup(
      <FacilityDetailPage
        facility={mockAcademicFacility}
        onBack={() => {}}
      />,
    );

    expect(html).toContain("Campus Instructional Facility");
    expect(html).toContain("2 of 3 spots available");
    expect(html).toContain("Open today: 7:00 AM - 11:00 PM");
    expect(html).toContain("Available (2)");
    expect(html).toContain("Occupied (1)");
    expect(html).toContain("All (3)");
    expect(html).toContain("1025");
    expect(html).toContain("3025");
  });

  it("filters rooms by roomSearchQuery prop", () => {
    const html = renderToStaticMarkup(
      <FacilityDetailPage
        facility={mockAcademicFacility}
        onBack={() => {}}
        roomSearchQuery="1025"
      />,
    );

    expect(html).toContain("1025");
    expect(html).not.toContain("3025");
    expect(html).not.toContain("2035");
  });

  it("renders closed notice when facility is closed", () => {
    const html = renderToStaticMarkup(
      <FacilityDetailPage
        facility={mockClosedFacility}
        onBack={() => {}}
      />,
    );

    expect(html).toContain("Siebel Center for CS");
    expect(html).toContain("CLOSED");
    expect(html).toContain("Building is currently closed");
    expect(html).toContain("Opens at 8:00 AM");
  });
});
