import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import axios from "axios";
import moment from "moment-timezone";
import {
  Libraries,
  StudyRoom,
  TimeSlot,
  RoomReservations,
  FormattedLibraryData,
  ReservationResponse,
  RegexGroups,
  FacilityType,
  Facility,
  FacilityStatus,
  RoomStatus,
  AcademicRoom,
  LibraryRoom,
} from "@/types";
import { isLibraryOpen } from "@/utils/libraryHours";

export const dynamic = "force-dynamic";

// ===== Library Data Constants =====
const USER_AGENT = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/54.0.2840.98 Safari/537.36",
};

const libraries: Libraries = {
  "Funk ACES Library": {
    id: "3604",
    name: "Funk ACES Library",
    num_rooms: 6,
    address: "1101 S Goodwin Ave, Urbana, IL 61801",
  },
  "Grainger Engineering Library": {
    id: "3606",
    name: "Grainger Engineering Library",
    num_rooms: 15,
    address: "1301 W Springfield Ave, Urbana, IL 61801",
  },
  "Main Library": {
    id: "3608",
    name: "Main Library",
    num_rooms: 17,
    address: "1408 W Gregory Dr, Urbana, IL 61801",
  },
};

const pattern = new RegExp(
  "resources\\.push\\(\\{\\s*" +
    'id:\\s*"(?<id>[^"]+)",\\s*' +
    'title:\\s*"(?<title>[^"]+)",\\s*' +
    'url:\\s*"(?<url>[^"]+)",\\s*' +
    "eid:\\s*(?<eid>\\d+),\\s*" +
    "gid:\\s*(?<gid>\\d+),\\s*" +
    "lid:\\s*(?<lid>\\d+),\\s*" +
    'grouping:\\s*"(?<grouping>[^"]+)",\\s*' +
    "gtype:\\s*(?<gtype>\\d+),\\s*" +
    "gBookingSelectableTime:\\s*(?<selectable>true|false),\\s*" +
    "capacity:\\s*(?<capacity>\\d+),\\s*" +
    "hasInfo:\\s*(?<hasInfo>true|false),\\s*" +
    'thumbnail:\\s*"(?<thumbnail>[^"]*)",\\s*' +
    "filterIds:\\s*\\[(?<filterIds>[^\\]]*)\\],?\\s*" +
    "\\}\\);",
  "g",
);

// ===== Library Data Processing Functions =====

/**
 * Extracts study room information from HTML content
 */
function extractStudyRooms(htmlContent: string): StudyRoom[] {
  const matches = Array.from(htmlContent.matchAll(pattern));
  const resources: StudyRoom[] = [];

  for (const match of matches) {
    const groups = match.groups as RegexGroups;
    let thumbnail = groups.thumbnail;
    if (thumbnail.startsWith("//")) {
      thumbnail = "https:" + thumbnail;
    }
    let url = groups.url;
    if (!url.startsWith("https://")) {
      url = "https://uiuc.libcal.com" + url;
    }

    resources.push({
      id: groups.id,
      title: JSON.parse(`"${groups.title}"`),
      url,
      eid: parseInt(groups.eid),
      lid: parseInt(groups.lid),
      grouping: JSON.parse(`"${groups.grouping}"`),
      thumbnail,
    });
  }
  return resources;
}

/**
 * Retrieves reservation data for a specific library
 */
async function getReservation(
  lid: string,
  nowCST: moment.Moment,
): Promise<ReservationResponse> {
  const url = "https://uiuc.libcal.com/spaces/availability/grid";

  const todayCST = nowCST.clone().startOf("day");
  const tomorrowCST = todayCST.clone().add(1, "day");

  const startDate = todayCST.format("YYYY-MM-DD");
  const endDate = tomorrowCST.format("YYYY-MM-DD");

  const payload = {
    lid: lid,
    gid: "0",
    eid: "-1",
    seat: "false",
    seatId: "0",
    zone: "0",
    start: startDate,
    end: endDate,
    pageIndex: "0",
    pageSize: "10000",
  };

  const headers = {
    accept: "application/json, text/javascript, */*; q=0.01",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    origin: "https://uiuc.libcal.com",
    referer: "https://uiuc.libcal.com/allspaces",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
    "x-requested-with": "XMLHttpRequest",
  };

  const responseToday = await axios.post(url, new URLSearchParams(payload), {
    headers,
  });
  const reservationsToday = responseToday.data as ReservationResponse;

  if (lid === "3604") {
    const dayAfterTomorrowCST = tomorrowCST.clone().add(1, "day");

    payload.start = endDate;
    payload.end = dayAfterTomorrowCST.format("YYYY-MM-DD");

    const responseTomorrow = await axios.post(
      url,
      new URLSearchParams(payload),
      {
        headers,
      },
    );
    const reservationsTomorrow = responseTomorrow.data as ReservationResponse;

    return {
      slots: [...reservationsToday.slots, ...reservationsTomorrow.slots],
    };
  }

  return reservationsToday;
}

/**
 * Calculates the total duration of continuous availability
 */
function calculateAvailabilityDuration(
  slots: ReservationResponse["slots"],
  startIndex: number,
  fromTime: moment.Moment,
  acesClosingTime: moment.Moment,
): number {
  // Initial slot
  const currentSlot = slots[startIndex];
  const isAcesLibrary = currentSlot.itemId === 3604;
  let endTime = moment.tz(currentSlot.end, "America/Chicago");

  // Apply library closing time if needed
  if (isAcesLibrary && endTime.isAfter(acesClosingTime)) {
    endTime = acesClosingTime.clone();
  }

  // Initial duration (either from current time or slot start)
  let duration = endTime.diff(fromTime, "minutes");

  // Check for contiguous future slots
  let lastEnd = endTime.clone();
  let i = startIndex + 1;

  while (i < slots.length) {
    const nextSlot = slots[i];
    if (nextSlot.className === "s-lc-eq-checkout") break;

    const nextStart = moment.tz(nextSlot.start, "America/Chicago");
    let nextEnd = moment.tz(nextSlot.end, "America/Chicago");

    // Check if truly contiguous
    if (!lastEnd.isSame(nextStart)) break;

    // Apply closing time cap if needed
    if (isAcesLibrary) {
      if (nextStart.isAfter(acesClosingTime)) break;
      if (nextEnd.isAfter(acesClosingTime)) {
        nextEnd = acesClosingTime.clone();
      }
    }

    duration += nextEnd.diff(nextStart, "minutes");
    lastEnd = nextEnd;
    i++;
  }

  return duration;
}

/**
 * Determines if a room will be available soon (within 20 minutes)
 */
const isOpeningSoon = (availableAt: string): boolean => {
  const now = moment().tz("America/Chicago");

  const availableTime = moment(availableAt, "HH:mm:ss").tz("America/Chicago");

  // If the available time is before now, assume it refers to the next day.
  if (availableTime.isBefore(now)) {
    availableTime.add(1, "day");
  }

  const diffInMinutes = availableTime.diff(now, "minutes");
  return diffInMinutes <= 20 && diffInMinutes > 0;
};

/**
 * Links room data with reservation data to create a complete picture of room availability
 */
function linkRoomsReservations(
  roomsData: StudyRoom[],
  reservationsData: ReservationResponse,
  nowCST: moment.Moment,
): RoomReservations {
  const roomReservations: RoomReservations = {};
  const libraryIds = new Set(
    Object.values(libraries).map((lib) => parseInt(lib.id)),
  );
  const todayCST = nowCST.clone().startOf("day");

  // Compute the correct closing time for FUNK ACES Library.
  const acesClosingTime = nowCST.isBefore(todayCST.clone().add(2, "hours"))
    ? todayCST.clone().add(2, "hours")
    : todayCST.clone().add(1, "day").startOf("day").add(2, "hours");

  for (const room of roomsData) {
    if (!libraryIds.has(room.lid)) continue;

    const roomId = room.eid;
    const roomSlots: TimeSlot[] = [];
    let availableAt: string | undefined = undefined;
    let availableDuration: number = 0;
    let isCurrentlyAvailable = false;

    const roomSpecificSlots = reservationsData.slots
      .filter((slot) => slot.itemId === roomId)
      .sort((a, b) => moment(a.start).valueOf() - moment(b.start).valueOf());

    let availableAtDiff: number | null = null;

    for (let index = 0; index < roomSpecificSlots.length; index++) {
      const slot = roomSpecificSlots[index];
      const startTime = moment.tz(slot.start, "America/Chicago");
      const endTime = moment.tz(slot.end, "America/Chicago");
      const isAvailable = slot.className !== "s-lc-eq-checkout";

      // Condition to include the slot (for today or for ACES’s next-day hours)
      if (
        startTime.isSame(todayCST, "day") ||
        (room.lid === 3604 &&
          startTime.isAfter(todayCST) &&
          startTime.isBefore(acesClosingTime))
      ) {
        roomSlots.push({
          start: startTime.format("HH:mm:ss"),
          end: endTime.format("HH:mm:ss"),
          available: isAvailable,
        });

        // Check if the slot is currently in progress.
        if (
          startTime.isSameOrBefore(nowCST) &&
          endTime.isAfter(nowCST) &&
          isAvailable
        ) {
          isCurrentlyAvailable = true;
          availableDuration = calculateAvailabilityDuration(
            roomSpecificSlots,
            index,
            nowCST,
            acesClosingTime,
          );
        }

        const diffInMinutes = startTime.diff(nowCST, "minutes");
        if (
          !isCurrentlyAvailable &&
          isAvailable &&
          diffInMinutes > 0 &&
          (availableAtDiff === null || diffInMinutes < availableAtDiff)
        ) {
          availableAt = startTime.format("HH:mm:ss");
          availableAtDiff = diffInMinutes;
          availableDuration = calculateAvailabilityDuration(
            roomSpecificSlots,
            index,
            startTime,
            acesClosingTime,
          );
        }
      }
    }

    roomReservations[room.title] = {
      id: roomId,
      url: room.url,
      lid: room.lid,
      grouping: room.grouping,
      thumbnail: room.thumbnail,
      slots: roomSlots,
      availableAt,
      availableDuration,
    };
  }

  return roomReservations;
}

// ===== Library Hours Functions =====

/**
 * Gets formatted library data with room availability
 */
async function getFormattedLibraryData(
  openLibraries?: string[],
  nowCST?: moment.Moment,
): Promise<FormattedLibraryData> {
  const result: FormattedLibraryData = {};
  nowCST = nowCST || moment().tz("America/Chicago");

  if (openLibraries && openLibraries.length === 0) {
    return result;
  }

  try {
    const allSpacesUrl = "https://uiuc.libcal.com/allspaces";
    const allSpacesResponse = await axios.get(allSpacesUrl, {
      headers: USER_AGENT,
    });
    const htmlContent = allSpacesResponse.data;
    const studyRooms = extractStudyRooms(htmlContent);

    // Group rooms by library ID
    const roomsByLibrary: Record<string, StudyRoom[]> = {};
    studyRooms.forEach((room) => {
      const lid = room.lid.toString();
      if (!roomsByLibrary[lid]) {
        roomsByLibrary[lid] = [];
      }
      roomsByLibrary[lid].push(room);
    });

    // Process libraries we care about in parallel
    const libraryPromises = Object.entries(libraries).map(
      async ([libraryName, libraryInfo]) => {
        // Skip libraries that aren't open if we have a filtered list
        if (openLibraries && !openLibraries.includes(libraryName)) {
          return null;
        }

        const lid = libraryInfo.id;
        const reservationData = await getReservation(lid, nowCST);
        const libraryRooms = roomsByLibrary[lid] || [];
        const roomReservations = linkRoomsReservations(
          libraryRooms,
          reservationData,
          nowCST,
        );

        // Count available rooms
        let availableCount = 0;
        for (const room of Object.values(roomReservations)) {
          const currentlyAvailable = room.slots.some(
            (slot) =>
              slot.available &&
              slot.start <= nowCST.format("HH:mm:ss") &&
              slot.end > nowCST.format("HH:mm:ss"),
          );
          if (currentlyAvailable) {
            availableCount++;
          }
        }

        return {
          libraryName,
          data: {
            room_count: Object.keys(roomReservations).length,
            currently_available: availableCount,
            rooms: roomReservations,
            address: libraryInfo.address,
          },
        };
      },
    );

    const libraryResults = await Promise.all(libraryPromises);

    // Combine results
    libraryResults.forEach((libraryResult) => {
      if (libraryResult) {
        result[libraryResult.libraryName] = libraryResult.data;
      }
    });
  } catch (error) {
    console.error("Error fetching library data:", error);
  }

  return result;
}

// ===== Main API Handler =====

/**
 * Fetches academic building data from Supabase
 */
async function fetchAcademicBuildingData(
  nowCST: moment.Moment,
): Promise<Record<string, Facility>> {
  const facilities: Record<string, Facility> = {};

  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      throw new Error(
        "Missing Supabase environment variables: SUPABASE_URL and/or SUPABASE_KEY",
      );
    }

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_KEY!,
    );

    const { data: buildingData, error } = await supabase.rpc("get_spots", {
      check_time: nowCST.format("HH:mm:ss"),
      check_date: nowCST.format("YYYY-MM-DD"),
      minimum_useful_minutes: 30,
    });

    if (error) {
      console.error("Error fetching building data:", error);
      return facilities;
    }

    if (buildingData?.buildings) {
      Object.entries(buildingData.buildings).forEach(([id, buildingData]) => {
        // Type assertion for building data
        const building = buildingData as {
          name: string;
          coordinates: { latitude: number; longitude: number };
          hours: { open: string; close: string };
          rooms: Record<string, Omit<AcademicRoom, "type">>; // Changed from FacilityRoom to any
          isOpen: boolean;
          roomCounts: { available: number; total: number };
        };

        // Create the academic facility
        const academicFacility: Facility = {
          id,
          name: building.name,
          type: FacilityType.ACADEMIC,
          coordinates: building.coordinates,
          hours: building.hours,
          isOpen: building.isOpen,
          roomCounts: building.roomCounts,
          rooms: {},
        };

        Object.entries(building.rooms).forEach(([roomNumber, roomData]) => {
          academicFacility.rooms[roomNumber] = {
            type: "academic",
            ...roomData,
          } as AcademicRoom;
        });

        facilities[id] = academicFacility;
      });
    }
  } catch (error) {
    console.error("Error in fetchAcademicBuildingData:", error);
  }

  return facilities;
}

/**
 * Initializes library facilities with basic information
 */
function initializeLibraryFacilities(): Record<string, Facility> {
  return {
    "Grainger Engineering Library": {
      id: "grainger",
      name: "Grainger Engineering Library",
      type: FacilityType.LIBRARY,
      coordinates: {
        latitude: 40.11247372608236,
        longitude: -88.2268586691797,
      },
      hours: { open: "", close: "" },
      rooms: {},
      isOpen: false,
      roomCounts: { available: 0, total: 0 },
      address: "1301 W Springfield Ave, Urbana, IL 61801",
    },
    "Funk ACES Library": {
      id: "aces",
      name: "Funk ACES Library",
      type: FacilityType.LIBRARY,
      coordinates: {
        latitude: 40.102836655077226,
        longitude: -88.22513280595481,
      },
      hours: { open: "", close: "" },
      rooms: {},
      isOpen: false,
      roomCounts: { available: 0, total: 0 },
      address: "1101 S Goodwin Ave, Urbana, IL 61801",
    },
    "Main Library": {
      id: "main",
      name: "Main Library",
      type: FacilityType.LIBRARY,
      coordinates: {
        latitude: 40.1047194114613,
        longitude: -88.22883490200387,
      },
      hours: { open: "", close: "" },
      rooms: {},
      isOpen: false,
      roomCounts: { available: 0, total: 0 },
      address: "1408 W Gregory Dr, Urbana, IL 61801",
    },
  };
}

/**
 * Updates library facilities with room availability data
 */
async function updateLibraryFacilities(
  libraryFacilities: Record<string, Facility>,
  nowCST: moment.Moment,
): Promise<Record<string, Facility>> {
  try {
    // Update each library's isOpen status
    Object.entries(libraryFacilities).forEach(([libraryName, facility]) => {
      facility.isOpen = isLibraryOpen(libraryName);
    });

    const openLibraryNames = Object.entries(libraryFacilities)
      .filter(([, facility]) => facility.isOpen)
      .map(([name]) => name);

    if (openLibraryNames.length > 0) {
      // Get library data for open libraries only
      const libraryData = await getFormattedLibraryData(
        openLibraryNames,
        nowCST,
      );

      // Add room data only for libraries that are open
      Object.entries(libraryData).forEach(([name, data]) => {
        if (libraryFacilities[name]?.isOpen) {
          const libraryFacility = libraryFacilities[name];

          libraryFacility.roomCounts = {
            available: data.currently_available,
            total: data.room_count,
          };

          // Convert library rooms to FacilityRoom format
          Object.entries(data.rooms).forEach(([roomName, roomData]) => {
            const isAvailable = roomData.slots.some((slot) => {
              const currentTime = nowCST.format("HH:mm:ss");
              return (
                slot.available &&
                slot.start <= currentTime &&
                currentTime < slot.end
              );
            });

            const willBeAvailableSoon =
              !isAvailable &&
              roomData.availableAt &&
              isOpeningSoon(roomData.availableAt) &&
              roomData.availableDuration >= 30;

            libraryFacility.rooms[roomName] = {
              type: "library",
              status: isAvailable
                ? RoomStatus.AVAILABLE
                : willBeAvailableSoon
                  ? RoomStatus.OPENING_SOON
                  : RoomStatus.RESERVED,
              url: roomData.url,
              thumbnail: roomData.thumbnail,
              slots: roomData.slots,
              availableAt: roomData.availableAt,
              availableFor: roomData.availableDuration,
            } as LibraryRoom;
          });
        }
      });
    }
  } catch (error) {
    console.error("Error in updateLibraryFacilities:", error);
  }

  return libraryFacilities;
}

/**
 * Main API endpoint handler
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const includeAcademic = url.searchParams.get("academic") !== "false";
    const includeLibraries = url.searchParams.get("libraries") !== "false";

    const nowCST = moment().tz("America/Chicago");
    const timestamp = nowCST.format();

    const facilityStatus: FacilityStatus = {
      timestamp,
      facilities: {},
    };

    const fetchPromises: Promise<Record<string, Facility>>[] = [];

    if (includeAcademic) {
      fetchPromises.push(fetchAcademicBuildingData(nowCST));
    }

    if (includeLibraries) {
      const libraryFacilities = initializeLibraryFacilities();
      fetchPromises.push(updateLibraryFacilities(libraryFacilities, nowCST));
    }

    const results = await Promise.all(fetchPromises);

    results.forEach((facilities) => {
      Object.assign(facilityStatus.facilities, facilities);
    });

    return NextResponse.json(facilityStatus);
  } catch (error) {
    console.error("Error in unified API:", error);
    return NextResponse.json(
      { error: "Failed to fetch data" },
      { status: 500 },
    );
  }
}
