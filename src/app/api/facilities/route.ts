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
  FacilityRoom,
  FacilityStatus,
  RoomStatus,
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
 * Calculates the duration of continuous availability from a starting slot
 */
function calculateContinuousAvailability(
  startSlot: ReservationResponse["slots"][0],
  roomSpecificSlots: ReservationResponse["slots"],
  startIndex: number,
  tomorrowTwoAM: moment.Moment,
  isAcesLibrary: boolean,
): number {
  let duration = 0;
  let lastEndMoment = moment.tz(startSlot.end, "America/Chicago");
  let nextIndex = startIndex + 1;

  while (nextIndex < roomSpecificSlots.length) {
    const nextSlot = roomSpecificSlots[nextIndex];
    if (nextSlot.className === "s-lc-eq-checkout") break;

    const nextStartMoment = moment.tz(nextSlot.start, "America/Chicago");
    let nextEndMoment = moment.tz(nextSlot.end, "America/Chicago");

    // Skip if not continuous
    if (
      lastEndMoment.format("HH:mm:ss") !== nextStartMoment.format("HH:mm:ss")
    ) {
      break;
    }

    // For Funk ACES, only include slots up to 2 AM next day
    if (isAcesLibrary) {
      if (nextStartMoment.isAfter(tomorrowTwoAM)) {
        break;
      }
      if (nextEndMoment.isAfter(tomorrowTwoAM)) {
        nextEndMoment = tomorrowTwoAM;
      }
    }

    // Add this slot's duration
    duration += nextEndMoment.diff(nextStartMoment, "minutes");
    lastEndMoment = nextEndMoment;
    nextIndex++;
  }

  return duration;
}

/**
 * Calculates availability information for a room at a specific time
 */
function calculateCurrentAvailability(
  slot: ReservationResponse["slots"][0],
  roomSpecificSlots: ReservationResponse["slots"],
  currentSlotIndex: number,
  nowCST: moment.Moment,
  tomorrowTwoAM: moment.Moment,
  isAcesLibrary: boolean,
): { availableDuration: number } {
  const endTime = moment.tz(slot.end, "America/Chicago");
  let slotEndMoment = endTime;

  // For Funk ACES, cap the end time at 2 AM if slot extends beyond
  if (isAcesLibrary && slotEndMoment.isAfter(tomorrowTwoAM)) {
    slotEndMoment = tomorrowTwoAM;
  }

  // Calculate initial duration from current time to slot end
  const availableDuration = slotEndMoment.diff(nowCST, "minutes");

  // Add duration from continuous subsequent slots
  const continuousDuration = calculateContinuousAvailability(
    slot,
    roomSpecificSlots,
    currentSlotIndex,
    tomorrowTwoAM,
    isAcesLibrary,
  );

  return { availableDuration: availableDuration + continuousDuration };
}

/**
 * Calculates future availability information for a room
 */
function calculateFutureAvailability(
  slot: ReservationResponse["slots"][0],
  roomSpecificSlots: ReservationResponse["slots"],
  slotIndex: number,
  tomorrowTwoAM: moment.Moment,
  isAcesLibrary: boolean,
): { availableDuration: number } {
  const startMoment = moment.tz(slot.start, "America/Chicago");
  const endMoment = moment.tz(slot.end, "America/Chicago");

  // Calculate initial duration
  const availableDuration = endMoment.diff(startMoment, "minutes");

  // Add duration from continuous subsequent slots
  const continuousDuration = calculateContinuousAvailability(
    slot,
    roomSpecificSlots,
    slotIndex,
    tomorrowTwoAM,
    isAcesLibrary,
  );

  return { availableDuration: availableDuration + continuousDuration };
}

/**
 * Determines if a room will be available soon (within 20 minutes)
 */
function isOpeningSoon(availableAt: string): boolean {
  const [availableHours, availableMinutes] = availableAt.split(":");
  const now = moment().tz("America/Chicago");
  const availableTime = moment()
    .tz("America/Chicago")
    .hours(parseInt(availableHours, 10))
    .minutes(parseInt(availableMinutes, 10))
    .seconds(0);
  const diffInMinutes = availableTime.diff(now, "minutes");
  return diffInMinutes <= 20 && diffInMinutes > 0;
}

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
  const currentTime = nowCST.format("HH:mm:ss");
  const tomorrowTwoAM = todayCST
    .clone()
    .add(1, "day")
    .startOf("day")
    .add(2, "hours");

  for (const room of roomsData) {
    if (!libraryIds.has(room.lid)) continue;

    const roomId = room.eid;
    const roomSlots: TimeSlot[] = [];
    let availableAt: string | undefined = undefined;
    let availableDuration: number = 0;
    const isAcesLibrary = room.lid === 3604;

    const roomSpecificSlots = reservationsData.slots
      .filter((slot) => slot.itemId === roomId)
      .sort((a, b) => moment(a.start).valueOf() - moment(b.start).valueOf());

    for (let index = 0; index < roomSpecificSlots.length; index++) {
      const slot = roomSpecificSlots[index];
      const startTime = moment.tz(slot.start, "America/Chicago");
      const endTime = moment.tz(slot.end, "America/Chicago");
      const slotStartTime = startTime.format("HH:mm:ss");
      const slotEndTime = endTime.format("HH:mm:ss");
      const isAvailable = slot.className !== "s-lc-eq-checkout";

      // Check if slot should be included based on library and time
      if (
        startTime.isSame(todayCST, "day") ||
        (isAcesLibrary &&
          startTime.isAfter(todayCST) &&
          startTime.isBefore(tomorrowTwoAM))
      ) {
        roomSlots.push({
          start: slotStartTime,
          end: slotEndTime,
          available: isAvailable,
        });

        // Check current availability
        if (
          slotStartTime <= currentTime &&
          slotEndTime > currentTime &&
          isAvailable
        ) {
          const { availableDuration: duration } = calculateCurrentAvailability(
            slot,
            roomSpecificSlots,
            index,
            nowCST,
            tomorrowTwoAM,
            isAcesLibrary,
          );
          availableDuration = duration;
        }

        // Update availableAt for future availability
        if (
          isAvailable &&
          slotStartTime > currentTime &&
          (!availableAt || slotStartTime < availableAt)
        ) {
          availableAt = slotStartTime;
          const { availableDuration: duration } = calculateFutureAvailability(
            slot,
            roomSpecificSlots,
            index,
            tomorrowTwoAM,
            isAcesLibrary,
          );
          availableDuration = duration;
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

  // If no open libraries, return empty result
  if (openLibraries && openLibraries.length === 0) {
    return result;
  }

  try {
    // Fetch all rooms from the LibCal "All Spaces" page
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

    // Wait for all library data to be processed
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
          rooms: Record<string, FacilityRoom>;
          isOpen: boolean;
          roomCounts: { available: number; total: number };
        };

        facilities[id] = {
          id,
          name: building.name,
          type: FacilityType.ACADEMIC,
          coordinates: building.coordinates,
          hours: building.hours,
          rooms: building.rooms,
          isOpen: building.isOpen,
          roomCounts: building.roomCounts,
        };
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

    // Get names of open libraries
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

          // Set room counts
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
            };
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

    // Initialize the unified response object
    const facilityStatus: FacilityStatus = {
      timestamp,
      facilities: {},
    };

    // Create an array to hold all promises
    const fetchPromises: Promise<Record<string, Facility>>[] = [];

    // Add academic building fetch promise if requested
    if (includeAcademic) {
      fetchPromises.push(fetchAcademicBuildingData(nowCST));
    }

    // Add library fetch promise if requested
    if (includeLibraries) {
      const libraryFacilities = initializeLibraryFacilities();
      fetchPromises.push(updateLibraryFacilities(libraryFacilities, nowCST));
    }

    // Wait for all data to be fetched in parallel
    const results = await Promise.all(fetchPromises);

    // Combine all results into the facilities object
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
