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
  roomCounts: { available: 2, total: 3 },
  rooms: {
    "Study Room A": {
      type: "library",
      status: RoomStatus.AVAILABLE,
      availableFor: 120,
      url: "https://example.com/a",
      thumbnail: "",
      slots: [],
    },
    "Study Room B": {
      type: "library",
      status: RoomStatus.AVAILABLE,
      availableFor: 30,
      url: "https://example.com/b",
      thumbnail: "",
      slots: [],
    },
    "Study Room C": {
      type: "library",
      status: RoomStatus.OCCUPIED,
      url: "https://example.com/c",
      thumbnail: "",
      slots: [],
    },
  },
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

  it("announces academic loading errors", () => {
    const html = renderToStaticMarkup(
      <FacilityListView
        libraryFacilities={[]}
        academicFacilities={[]}
        onSelectFacility={() => {}}
        error="Unable to load facilities"
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain("Unable to load facilities");
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

  it("keeps occupied and all-room counts when availability filters are active", () => {
    const html = renderToStaticMarkup(
      <FacilityDetailPage
        facility={mockAcademicFacility}
        onBack={() => {}}
        filterCriteria={{ minDuration: 75 }}
      />,
    );

    expect(html).toContain("1 of 3 spots available");
    expect(html).toContain("Available (1)");
    expect(html).toContain("Occupied (1)");
    expect(html).toContain("All (3)");
  });

  it("uses filtered availability for a library badge and room list", () => {
    const html = renderToStaticMarkup(
      <FacilityDetailPage
        facility={mockLibraryFacility}
        onBack={() => {}}
        filterCriteria={{ minDuration: 60 }}
      />,
    );

    expect(html).toContain("1 of 3 spots available");
    expect(html).toContain("Study Room A");
    expect(html).not.toContain("Study Room B");
    expect(html).not.toContain("Study Room C");
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
