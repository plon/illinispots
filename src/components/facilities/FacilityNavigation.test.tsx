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
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DateTimeProvider } from "@/contexts/DateTimeContext";
import { FacilityListItem } from "./FacilityListItem";
import { FacilityListView } from "./FacilityListView";
import { FacilityDetailPage } from "./FacilityDetailPage";
import { RoomRow, restoreOriginalImage } from "./RoomRow";
import {
  type Facility,
  type RoomDetails,
  FacilityType,
  RoomStatus,
} from "@/types";

function renderDetailPage(
  props: React.ComponentProps<typeof FacilityDetailPage>,
  queryClient = new QueryClient(),
) {
  return renderToStaticMarkup(
    <QueryClientProvider client={queryClient}>
      <DateTimeProvider>
        <FacilityDetailPage {...props} />
      </DateTimeProvider>
    </QueryClientProvider>,
  );
}

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
    const html = renderDetailPage({
      facility: mockAcademicFacility,
      onBack: () => {},
    });

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
    const html = renderDetailPage({
      facility: mockAcademicFacility,
      onBack: () => {},
      roomSearchQuery: "1025",
    });

    expect(html).toContain("1025");
    expect(html).not.toContain("3025");
    expect(html).not.toContain("2035");
  });

  it("shows a deep-linked occupied room on its matching tab", () => {
    const html = renderDetailPage({
      facility: mockAcademicFacility,
      onBack: () => {},
      selectedRoomId: "2035",
      onSelectRoom: () => {},
    });

    expect(html).toContain(
      'aria-label="Room 2035 in Campus Instructional Facility"',
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toContain(
      'aria-label="Room 1025 in Campus Instructional Facility"',
    );
  });

  it("lets an explicit room search hide a different deep-linked room", () => {
    const html = renderDetailPage({
      facility: mockAcademicFacility,
      onBack: () => {},
      roomSearchQuery: "9999",
      selectedRoomId: "1025",
      onSelectRoom: () => {},
    });

    expect(html).toContain("No matching rooms");
    expect(html).not.toContain(
      'aria-label="Room 1025 in Campus Instructional Facility"',
    );
  });

  it("keeps occupied and all-room counts when availability filters are active", () => {
    const html = renderDetailPage({
      facility: mockAcademicFacility,
      onBack: () => {},
      filterCriteria: { minDuration: 75 },
    });

    expect(html).toContain("1 of 3 spots available");
    expect(html).toContain("Available (1)");
    expect(html).toContain("Occupied (1)");
    expect(html).toContain("All (3)");
  });

  it("uses filtered availability for a library badge and room list", () => {
    const html = renderDetailPage({
      facility: mockLibraryFacility,
      onBack: () => {},
      filterCriteria: { minDuration: 60 },
    });

    expect(html).toContain("1 of 3 spots available");
    expect(html).toContain("Study Room A");
    expect(html).not.toContain("Study Room B");
    expect(html).not.toContain("Study Room C");
  });

  it("keeps a deep-linked library room visible when filters exclude it", () => {
    const html = renderDetailPage({
      facility: mockLibraryFacility,
      onBack: () => {},
      filterCriteria: { minDuration: 60 },
      selectedRoomId: "Study Room B",
      onSelectRoom: () => {},
    });

    expect(html).toContain(
      'aria-label="Room Study Room B in Grainger Engineering Library"',
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).not.toContain(
      'aria-label="Room Study Room C in Grainger Engineering Library"',
    );
  });

  it("renders closed notice when facility is closed", () => {
    const html = renderDetailPage({
      facility: mockClosedFacility,
      onBack: () => {},
    });

    expect(html).toContain("Siebel Center for CS");
    expect(html).toContain("CLOSED");
    expect(html).toContain("Building is currently closed");
    expect(html).toContain("Opens at 8:00 AM");
  });

  it("overrides the shared infinite room-details cache policy", () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: Infinity,
          gcTime: Infinity,
          refetchOnMount: false,
        },
      },
    });

    renderDetailPage(
      { facility: mockAcademicFacility, onBack: () => {} },
      queryClient,
    );

    const query = queryClient.getQueryCache().find({
      queryKey: ["roomDetails", mockAcademicFacility.name],
    });
    const options = query?.options as
      | {
          staleTime?: number;
          gcTime?: number;
          refetchOnMount?: boolean;
        }
      | undefined;
    expect(options?.staleTime).toBe(10 * 60 * 1000);
    expect(options?.gcTime).toBe(10 * 60 * 1000);
    expect(options?.refetchOnMount).toBe(true);
  });
});

describe("RoomRow", () => {
  const roomDetails: RoomDetails = {
    buildingName: "Campus Instructional Facility",
    roomNumber: "1025",
    capacity: 36,
    roomType: "Classroom",
    equipment: ["PC", "HDMI input"],
    photoUrls: [],
    answersUrl: null,
  };

  it("renders equipment from room details", () => {
    const queryClient = new QueryClient();
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <DateTimeProvider>
          <RoomRow
            roomName="1025"
            room={mockAcademicFacility.rooms["1025"]}
            facilityId={mockAcademicFacility.id}
            facilityName={mockAcademicFacility.name}
            roomDetails={roomDetails}
            isExpanded
            onToggleExpand={() => {}}
          />
        </DateTimeProvider>
      </QueryClientProvider>,
    );

    expect(html).toContain("Equipment:");
    expect(html).toContain("PC, HDMI input");
  });

  it("allows each gallery photo to fall back independently", () => {
    const image = {
      dataset: {} as DOMStringMap,
      src: "optimized-first",
      srcset: "optimized-first 1x",
    };

    restoreOriginalImage({ currentTarget: image }, "original-first");
    expect(image.src).toBe("original-first");
    expect(image.srcset).toBe("");

    image.src = "optimized-second";
    image.srcset = "optimized-second 1x";
    restoreOriginalImage({ currentTarget: image }, "original-second");

    expect(image.src).toBe("original-second");
    expect(image.srcset).toBe("");
  });
});
