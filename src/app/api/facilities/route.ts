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
  RoomReservation,
} from "@/types";
import { isLibraryOpen, LIBRARY_HOURS } from "@/utils/libraryHours";

export const dynamic = "force-dynamic";

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
 * Retrieves reservation data for a specific library for the relevant date(s)
 */
async function getReservation(
  lid: string,
  targetMoment: moment.Moment, // Use targetMoment
): Promise<ReservationResponse> {
  const url = "https://uiuc.libcal.com/spaces/availability/grid";
  const timezone = "America/Chicago";

  // Use the date part of targetMoment
  const targetDateCST = targetMoment.clone().tz(timezone).startOf("day");
  const nextDateCST = targetDateCST.clone().add(1, "day");

  const startDate = targetDateCST.format("YYYY-MM-DD");
  const endDate = nextDateCST.format("YYYY-MM-DD");

  const payload = {
    lid: lid,
    gid: "0",
    eid: "-1",
    seat: "false",
    seatId: "0",
    zone: "0",
    start: startDate, // Fetch for the target date
    end: endDate, // Fetch until the start of the next date
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

  // Funk ACES needs data for the *next* day as well because reservations run past midnight
  // Only fetch next day data if it's after 10 PM Chicago time (when users might need late night/early morning slots)
  if (lid === "3604" && targetMoment.hour() >= 22) {
    const dayAfterNextCST = nextDateCST.clone().add(1, "day");

    payload.start = endDate; // Start from the next date
    payload.end = dayAfterNextCST.format("YYYY-MM-DD"); // End at the start of the day after

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
 * Calculates the total duration of continuous availability starting from a specific slot/time
 */
function calculateAvailabilityDuration(
  slots: ReservationResponse["slots"],
  startIndex: number,
  fromTime: moment.Moment, // Time to calculate duration *from*
  libraryClosingTime: moment.Moment | null, // Pass closing time, null if not applicable
): number {
  const currentSlot = slots[startIndex];
  const timezone = "America/Chicago";
  let endTime = moment.tz(currentSlot.end, timezone);

  // Apply library closing time if provided and relevant
  if (libraryClosingTime && endTime.isAfter(libraryClosingTime)) {
    endTime = libraryClosingTime.clone();
  }

  // Ensure the slot actually ends after the 'fromTime'
  if (endTime.isSameOrBefore(fromTime)) {
    return 0;
  }

  // Initial duration (from 'fromTime' to the end of the current slot)
  let duration = endTime.diff(fromTime, "minutes");

  // Check for contiguous future slots
  let lastEnd = endTime.clone();
  let i = startIndex + 1;

  while (i < slots.length) {
    const nextSlot = slots[i];
    // Stop if the next slot is a reservation
    if (nextSlot.className === "s-lc-eq-checkout") break;

    const nextStart = moment.tz(nextSlot.start, timezone);
    let nextEnd = moment.tz(nextSlot.end, timezone);

    // Check if truly contiguous (start time matches the previous end time)
    if (!lastEnd.isSame(nextStart)) break;

    // Apply closing time cap if needed
    if (libraryClosingTime) {
      // If the next slot starts *after* closing, it's irrelevant
      if (nextStart.isSameOrAfter(libraryClosingTime)) break;
      // If the next slot ends after closing, cap it at the closing time
      if (nextEnd.isAfter(libraryClosingTime)) {
        nextEnd = libraryClosingTime.clone();
      }
    }

    // Add the duration of this contiguous slot
    duration += nextEnd.diff(nextStart, "minutes");
    lastEnd = nextEnd; // Update the end time for the next iteration
    i++;
  }

  return Math.max(0, duration); // Ensure duration is not negative
}

/**
 * Determines if a room will be available soon (within 20 minutes) based on the target time
 */
const isOpeningSoon = (
  availableAt: string, // HH:mm:ss format
  targetMoment: moment.Moment, // Use targetMoment
): boolean => {
  const timezone = "America/Chicago";
  // Construct the potential opening time on the targetMoment's date
  const availableTime = moment.tz(
    `${targetMoment.format("YYYY-MM-DD")} ${availableAt}`,
    "YYYY-MM-DD HH:mm:ss",
    timezone,
  );

  // If the calculated availableTime is *before* the targetMoment (on the same day),
  // it means the opening time must be on the *next* day.
  if (availableTime.isBefore(targetMoment)) {
    availableTime.add(1, "day");
  }

  const diffInMinutes = availableTime.diff(targetMoment, "minutes");
  // Check if it's opening within the next 20 minutes (inclusive of 0)
  return diffInMinutes <= 20 && diffInMinutes >= 0;
};

/**
 * Gets the closing time moment object for a library on a specific date.
 * Returns null if hours are not defined or invalid.
 */
function getLibraryClosingTime(
  libraryName: string,
  targetDate: moment.Moment,
): moment.Moment | null {
  const timezone = "America/Chicago";
  const dayOfWeek = targetDate.format("dddd");
  const hours = LIBRARY_HOURS[libraryName]?.[dayOfWeek];

  if (!hours || !hours.close) {
    return null;
  }

  const closingMoment = moment.tz(
    `${targetDate.format("YYYY-MM-DD")} ${hours.close}`,
    "YYYY-MM-DD HH:mm", // Assume HH:mm format from LIBRARY_HOURS
    timezone,
  );

  // If the closing time is on the next day (e.g., 02:00), add a day
  if (hours.nextDay) {
    closingMoment.add(1, "day");
  }

  return closingMoment.isValid() ? closingMoment : null;
}

/**
 * Links room data with reservation data to create a complete picture of room availability at a specific time
 */
function linkRoomsReservations(
  roomsData: StudyRoom[],
  reservationsData: ReservationResponse,
  targetMoment: moment.Moment,
): RoomReservations {
  const roomReservations: RoomReservations = {};
  const libraryIds = new Set(
    Object.values(libraries).map((lib) => parseInt(lib.id)),
  );
  const timezone = "America/Chicago";
  const targetDateCST = targetMoment.clone().tz(timezone).startOf("day");
  const targetMomentString = targetMoment.format("YYYY-MM-DD HH:mm:ss");

  for (const room of roomsData) {
    if (!libraryIds.has(room.lid)) continue;

    const libraryName = Object.values(libraries).find(
      (l) => l.id === room.lid.toString(),
    )?.name;
    if (!libraryName) continue; // Should not happen

    const roomId = room.eid;
    let availableAt: string | undefined = undefined;
    let availableDuration: number = 0;
    let isCurrentlyAvailable = false;
    let roomStatus: RoomStatus = RoomStatus.RESERVED; // Default status

    // Determine the relevant closing time for this library on the target date
    const libraryClosingTime = getLibraryClosingTime(
      libraryName,
      targetDateCST,
    );

    // Filter slots relevant to the room and sort them
    const roomSpecificSlots = reservationsData.slots
      .filter((slot) => slot.itemId === roomId)
      .sort((a, b) => moment(a.start).valueOf() - moment(b.start).valueOf());

    let nextAvailableSlotIndex = -1;
    let nextAvailableStartTime: moment.Moment | null = null;
    let currentStatusDetermined = false;

    // Loop through slots to determine the status and next availability
    for (let index = 0; index < roomSpecificSlots.length; index++) {
      const slot = roomSpecificSlots[index];
      const startTime = moment.tz(slot.start, timezone);
      const endTime = moment.tz(slot.end, timezone);
      const isAvailableSlot = slot.className !== "s-lc-eq-checkout";

      // Only determine status once
      if (!currentStatusDetermined) {
        // Check if the slot is currently available at targetMoment
        if (
          isAvailableSlot &&
          startTime.isSameOrBefore(targetMoment) &&
          endTime.isAfter(targetMoment)
        ) {
          // Check if it's actually within library hours if closing time is known
          if (
            !libraryClosingTime ||
            targetMoment.isBefore(libraryClosingTime)
          ) {
            isCurrentlyAvailable = true;
            roomStatus = RoomStatus.AVAILABLE;
            // Calculate duration from targetMoment until end of contiguous block or closing time
            availableDuration = calculateAvailabilityDuration(
              roomSpecificSlots,
              index,
              targetMoment, // Start calculating from targetMoment
              libraryClosingTime,
            );
            currentStatusDetermined = true; // Status found
            nextAvailableSlotIndex = -1; // Reset this as we are currently available
          }
        }

        // If not currently available, find the next available slot starting after targetMoment
        if (
          !isCurrentlyAvailable && // Only look if not already found available
          isAvailableSlot &&
          startTime.isAfter(targetMoment)
        ) {
          // Ensure the potential next slot starts before the library closes
          if (!libraryClosingTime || startTime.isBefore(libraryClosingTime)) {
            // If this is the first future available slot we've found
            if (nextAvailableSlotIndex === -1) {
              nextAvailableSlotIndex = index;
              nextAvailableStartTime = startTime;
            }
          }
        }
      }

      // If targetMoment is past the end of this slot, and we haven't found the status yet,
      // it means the targetMoment falls between slots (or after the last one).
      if (!currentStatusDetermined && targetMoment.isSameOrAfter(endTime)) {
        // Continue searching for the next available slot
      }
    }

    if (!isCurrentlyAvailable) {
      // If not currently available, check if we found a future available slot
      if (nextAvailableSlotIndex !== -1 && nextAvailableStartTime) {
        availableAt = nextAvailableStartTime.format("HH:mm:ss");
        // Calculate duration from the start of that future slot
        availableDuration = calculateAvailabilityDuration(
          roomSpecificSlots,
          nextAvailableSlotIndex,
          nextAvailableStartTime,
          libraryClosingTime,
        );

        if (
          availableAt &&
          isOpeningSoon(availableAt, targetMoment) &&
          availableDuration >= 30
        ) {
          roomStatus = RoomStatus.OPENING_SOON;
        } else {
          // It's available later, but not "soon", keep status as RESERVED/OCCUPIED for now
          roomStatus = RoomStatus.RESERVED;
        }
      } else {
        // Not available now and no future availability found within operating hours
        roomStatus = RoomStatus.RESERVED; // Or OCCUPIED, depending on context, RESERVED fits library
        availableDuration = 0; // Ensure duration is 0 if no future availability
        availableAt = undefined;
      }
    }

    availableDuration = Math.max(0, availableDuration);

    let firstRelevantSlotIndex = -1;
    for (let i = 0; i < roomSpecificSlots.length; i++) {
      // Find the first slot that ends after the targetMoment.
      // This includes the currently active slot or the next future slot.
      if (roomSpecificSlots[i].end > targetMomentString) {
        firstRelevantSlotIndex = i;
        break;
      }
    }

    const relevantSlotsData =
      firstRelevantSlotIndex !== -1
        ? roomSpecificSlots.slice(firstRelevantSlotIndex)
        : [];

    const roomSlots: TimeSlot[] = relevantSlotsData
      .map((slot) => {
        const startTime = moment.tz(slot.start, timezone);
        let endTime = moment.tz(slot.end, timezone);
        const isAvailableSlot = slot.className !== "s-lc-eq-checkout";

        // Apply library closing time cap
        if (libraryClosingTime && endTime.isAfter(libraryClosingTime)) {
          endTime = libraryClosingTime;
        }

        // Only include the slot if its start time is before the (potentially capped) end time
        // and before the library closing time (if applicable)
        if (
          startTime.isBefore(endTime) &&
          (!libraryClosingTime || startTime.isBefore(libraryClosingTime))
        ) {
          return {
            start: startTime.format("HH:mm:ss"),
            end: endTime.format("HH:mm:ss"),
            available: isAvailableSlot,
          };
        }
        return null; // Exclude slots that start at or after closing or have invalid times
      })
      .filter((slot): slot is TimeSlot => slot !== null);

    roomReservations[room.title] = {
      id: roomId,
      url: room.url,
      lid: room.lid,
      grouping: room.grouping,
      thumbnail: room.thumbnail,
      slots: roomSlots,
      availableAt,
      availableDuration,
      status: roomStatus,
    } as RoomReservation;
  }

  return roomReservations;
}

// ===== Library Hours Functions =====

/**
 * Gets formatted library data with room availability for a specific time
 */
async function getFormattedLibraryData(
  openLibraries: string[], // Libraries determined to be open at targetMoment
  targetMoment: moment.Moment, // Use targetMoment
): Promise<FormattedLibraryData> {
  const result: FormattedLibraryData = {};

  if (openLibraries.length === 0) {
    return result; // No open libraries to process
  }

  try {
    // Fetching all spaces HTML is independent of time, still needed for room metadata
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

    // Process only the libraries that are open at targetMoment
    const libraryPromises = openLibraries.map(async (libraryName) => {
      const libraryInfo = libraries[libraryName];
      if (!libraryInfo) return null; // Should not happen if openLibraries is correct

      const lid = libraryInfo.id;
      // Get reservation data relevant to the targetMoment
      const reservationData = await getReservation(lid, targetMoment);
      const libraryRooms = roomsByLibrary[lid] || [];
      // Link reservations using targetMoment
      const roomReservations = linkRoomsReservations(
        libraryRooms,
        reservationData,
        targetMoment,
      );

      // Count available rooms AT targetMoment based on the status set by linkRoomsReservations
      let availableCount = 0;
      for (const room of Object.values(roomReservations)) {
        if (room.status === RoomStatus.AVAILABLE) {
          availableCount++;
        }
      }

      return {
        libraryName,
        data: {
          room_count: Object.keys(roomReservations).length,
          currently_available: availableCount, // Reflects availability AT targetMoment
          rooms: roomReservations,
          address: libraryInfo.address,
        },
      };
    });

    const libraryResults = await Promise.all(libraryPromises);

    // Combine results
    libraryResults.forEach((libraryResult) => {
      if (libraryResult) {
        result[libraryResult.libraryName] = libraryResult.data;
      }
    });
  } catch (error) {
    console.error("Error fetching library data:", error);
    // Consider how to handle partial errors if needed
  }

  return result;
}

// ===== Main API Handler =====

/**
 * Fetches academic building data from Supabase for a specific time
 */
async function fetchAcademicBuildingData(
  targetMoment: moment.Moment,
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
      check_time: targetMoment.format("HH:mm:ss"),
      check_date: targetMoment.format("YYYY-MM-DD"),
      minimum_useful_minutes: 30,
    });

    if (error) {
      console.error("Error fetching building data from Supabase:", error);
      return facilities; // Return empty on error
    }

    // Process Supabase response
    if (buildingData?.buildings) {
      Object.entries(buildingData.buildings).forEach(([id, buildingInfo]) => {
        const building = buildingInfo as {
          name: string;
          coordinates: { latitude: number; longitude: number };
          hours: { open: string; close: string };
          rooms: Record<
            string,
            Omit<AcademicRoom, "type" | "status"> & {
              status: "available" | "occupied";
              available: boolean;
              passingPeriod?: boolean;
              availableAt?: string;
              availableFor?: number;
              availableUntil?: string;
              currentClass?: any;
              nextClass?: any;
            }
          >;
          isOpen: boolean;
          roomCounts: { available: number; total: number }; // Counts based on check_time
        };

        const academicFacility: Facility = {
          id,
          name: building.name,
          type: FacilityType.ACADEMIC,
          coordinates: building.coordinates,
          hours: building.hours, // These hours are for the *day*
          isOpen: building.isOpen, // This reflects if open AT targetMoment
          roomCounts: building.roomCounts, // Counts are based on targetMoment
          rooms: {},
        };

        Object.entries(building.rooms).forEach(([roomNumber, roomData]) => {
          let status: RoomStatus;
          if (roomData.status === "available") {
            if (roomData.passingPeriod) {
              status = RoomStatus.PASSING_PERIOD;
            } else {
              status = RoomStatus.AVAILABLE;
            }
          } else {
            if (
              roomData.availableAt &&
              isOpeningSoon(roomData.availableAt, targetMoment) &&
              roomData.availableFor &&
              roomData.availableFor >= 30
            ) {
              status = RoomStatus.OPENING_SOON;
            } else {
              status = RoomStatus.OCCUPIED;
            }
          }

          academicFacility.rooms[roomNumber] = {
            type: "academic",
            status: status,
            currentClass: roomData.currentClass,
            nextClass: roomData.nextClass,
            availableAt: roomData.availableAt,
            availableFor: roomData.availableFor
              ? Math.max(0, roomData.availableFor)
              : undefined, // Ensure non-negative
            availableUntil: roomData.availableUntil,
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
 * Initializes library facilities with basic information (independent of time)
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
      hours: { open: "", close: "" }, // Will be updated if needed
      rooms: {},
      isOpen: false, // Will be updated based on target time
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
 * Updates library facilities with room availability data for a specific time
 */
async function updateLibraryFacilities(
  libraryFacilities: Record<string, Facility>,
  targetMoment: moment.Moment, // Use targetMoment
): Promise<Record<string, Facility>> {
  try {
    // Update each library's isOpen status based on the targetMoment
    Object.entries(libraryFacilities).forEach(([libraryName, facility]) => {
      facility.isOpen = isLibraryOpen(libraryName, targetMoment);

      // Update facility.hours based on the day of targetMoment
      const dayOfWeek = targetMoment.format("dddd");
      const dailyHours = LIBRARY_HOURS[libraryName]?.[dayOfWeek];
      facility.hours.open = dailyHours?.open ?? "";
      facility.hours.close = dailyHours?.close ?? "";
    });

    // Filter libraries that are open AT targetMoment
    const openLibraryNames = Object.entries(libraryFacilities)
      .filter(([, facility]) => facility.isOpen)
      .map(([name]) => name);

    if (openLibraryNames.length > 0) {
      // Get library data for open libraries using targetMoment
      const libraryData = await getFormattedLibraryData(
        openLibraryNames,
        targetMoment,
      );

      // Add room data only for libraries that are open AT targetMoment
      Object.entries(libraryData).forEach(([name, data]) => {
        const libraryFacility = libraryFacilities[name];
        if (libraryFacility?.isOpen) {
          // Update counts based on availability AT targetMoment
          libraryFacility.roomCounts = {
            available: data.currently_available,
            total: data.room_count,
          };

          // Convert library rooms to FacilityRoom format using data from linkRoomsReservations
          Object.entries(data.rooms).forEach(([roomName, roomData]) => {
            libraryFacility.rooms[roomName] = {
              type: "library",
              status: roomData.status, // Use status calculated in linkRoomsReservations
              url: roomData.url,
              thumbnail: roomData.thumbnail,
              slots: roomData.slots, // Keep all slots for display
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
    const dateParam = url.searchParams.get("date");
    const timeParam = url.searchParams.get("time"); // Expect HH:mm:ss
    const includeAcademic = url.searchParams.get("academic") !== "false";
    const includeLibraries = url.searchParams.get("libraries") !== "false";

    let targetMoment: moment.Moment;
    const timezone = "America/Chicago";

    // Validate and parse date/time parameters
    if (
      dateParam &&
      timeParam &&
      moment(
        `${dateParam} ${timeParam}`,
        "YYYY-MM-DD HH:mm:ss", // Strict parsing
        true, // Use strict parsing
      ).isValid()
    ) {
      targetMoment = moment.tz(
        `${dateParam} ${timeParam}`,
        "YYYY-MM-DD HH:mm:ss",
        timezone,
      );
    } else {
      // Default to current time if params are missing or invalid
      targetMoment = moment().tz(timezone);
      if (dateParam || timeParam) {
        console.warn(
          `Invalid date/time parameters received (date: ${dateParam}, time: ${timeParam}). Defaulting to current time.`,
        );
      }
    }

    const timestamp = targetMoment.toISOString();

    const facilityStatus: FacilityStatus = {
      timestamp,
      facilities: {},
    };

    const fetchPromises: Promise<Record<string, Facility>>[] = [];

    if (includeAcademic) {
      fetchPromises.push(fetchAcademicBuildingData(targetMoment));
    }

    if (includeLibraries) {
      const libraryFacilities = initializeLibraryFacilities();
      fetchPromises.push(
        updateLibraryFacilities(libraryFacilities, targetMoment),
      );
    }

    const results = await Promise.all(fetchPromises);

    results.forEach((facilities) => {
      Object.assign(facilityStatus.facilities, facilities);
    });

    return NextResponse.json(facilityStatus);
  } catch (error) {
    console.error("Error in unified API:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Failed to fetch data";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
