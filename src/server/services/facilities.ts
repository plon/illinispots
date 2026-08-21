import { createClient } from "@supabase/supabase-js";
import moment from "moment-timezone";
import {
  StudyRoom,
  TimeSlot,
  RoomReservations,
  FormattedLibraryData,
  ReservationResponse,
  FacilityType,
  Facility,
  FacilityStatus,
  RoomStatus,
  AcademicRoom,
  LibraryRoom,
  RoomReservation,
} from "../../types";
import { isLibraryOpen, LIBRARY_HOURS } from "../../utils/libraryHours";
import { getSupabaseConfig } from "../config";
import { Sentry } from "../observability";
import {
  LIBRARIES,
  STATIC_ROOMS_BY_LIBRARY,
} from "../data/library-catalog";

const LIBCAL_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Retrieves reservation data for a specific library for the relevant date(s)
 */
async function getReservation(
  lid: string,
  targetMoment: moment.Moment,
): Promise<ReservationResponse> {
  const url = "https://libcal.library.illinois.edu/spaces/availability/grid";
  const timezone = "America/Chicago";

  const targetDateCST = targetMoment.clone().tz(timezone).startOf("day");
  const nextDateCST = targetDateCST.clone().add(1, "day");

  const startDate = targetDateCST.format("YYYY-MM-DD");
  const fetchNextDay =
    lid === "3604" && targetMoment.hour() >= 22;
  const endDate = fetchNextDay
    ? nextDateCST.clone().add(1, "day").format("YYYY-MM-DD")
    : nextDateCST.format("YYYY-MM-DD");

  const payload = {
    lid: lid,
    gid: "0",
    eid: "-1",
    seat: "false",
    seatId: "0",
    zone: "0",
    start: startDate, // Fetch for the target date
    end: endDate, // Fetch until the start of the day after the target date when needed
    pageIndex: "0",
    pageSize: "10000",
  };

  const headers = {
    accept: "application/json, text/javascript, */*; q=0.01",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    origin: "https://libcal.library.illinois.edu",
    referer: "https://libcal.library.illinois.edu/allspaces",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
    "x-requested-with": "XMLHttpRequest",
  };

  const response = await Sentry.startSpan(
    {
      name: "Fetch LibCal availability",
      op: "app.library.availability",
      attributes: { "library.id": lid },
    },
    () =>
      fetch(url, {
        method: "POST",
        headers,
        body: new URLSearchParams(payload),
        signal: AbortSignal.timeout(LIBCAL_REQUEST_TIMEOUT_MS),
      }),
  );

  if (!response.ok) {
    throw new Error(
      `LibCal availability request failed with status ${response.status}`,
    );
  }

  return (await response.json()) as ReservationResponse;
}

/**
 * Calculates the total duration of continuous availability starting from a specific slot/time
 */
function calculateAvailabilityDuration(
  slots: ReservationResponse["slots"],
  startIndex: number,
  fromTime: moment.Moment, // Time to calculate duration
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
    Object.values(LIBRARIES).map((lib) => parseInt(lib.id)),
  );
  const timezone = "America/Chicago";
  const targetDateCST = targetMoment.clone().tz(timezone).startOf("day");
  const targetMomentString = targetMoment.format("YYYY-MM-DD HH:mm:ss");

  for (const room of roomsData) {
    if (!libraryIds.has(room.lid)) continue;

    const libraryName = Object.values(LIBRARIES).find(
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

    if (roomSpecificSlots.length === 0) {
      // LibCal returns timeblocks even when every block is reserved. No blocks
      // means the room is not open/bookable for the selected date.
      roomStatus = RoomStatus.UNAVAILABLE;
      availableDuration = 0;
      availableAt = undefined;
    } else if (!isCurrentlyAvailable) {
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
    // Process only the libraries that are open at targetMoment
    const libraryPromises = openLibraries.map(async (libraryName) => {
      const libraryInfo = LIBRARIES[libraryName];
      if (!libraryInfo) return null; // Should not happen if openLibraries is correct

      const lid = libraryInfo.id;
      const libraryRooms = STATIC_ROOMS_BY_LIBRARY[lid] || [];
      if (libraryRooms.length === 0) {
        console.warn(`No static room metadata found for library ${libraryName} (lid ${lid})`);
        return null;
      }

      // Get reservation data relevant to the targetMoment
      const reservationData = await getReservation(lid, targetMoment);
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
    Sentry.captureException(error, {
      tags: { component: "libcal", operation: "fetch-availability" },
    });
    Sentry.getActiveSpan()?.setAttribute("result.partial", true);
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
    const supabaseConfig = getSupabaseConfig();
    const supabase = createClient(supabaseConfig.url, supabaseConfig.key);

    const { data: buildingData, error } = await Sentry.startSpan(
      {
        name: "Supabase RPC get_cached_spots",
        op: "db.rpc",
      },
      async (span) => {
        const response = await supabase.rpc("get_cached_spots", {
          check_time_param: targetMoment.format("HH:mm:ss"),
          check_date_param: targetMoment.format("YYYY-MM-DD"),
          min_minutes_param: 30,
        });

        const cacheMetadata = (
          response.data as {
            _cache?: {
              hit?: boolean;
              source?: string;
              reason?: string;
            };
          } | null
        )?._cache;
        const cacheResult = response.error
          ? "error"
          : cacheMetadata?.hit === true
            ? "hit"
            : cacheMetadata?.hit === false
              ? "fallback"
              : "unknown";

        try {
          span.setAttributes({
            "cache.result": cacheResult,
            "cache.hit": cacheMetadata?.hit,
            "cache.source": cacheMetadata?.source,
            "cache.fallback_reason": cacheMetadata?.reason,
            "availability.check_date": targetMoment.format("YYYY-MM-DD"),
          });

          if (cacheResult === "fallback") {
            span.addEvent("cache.fallback", {
              "fallback.operation": "get_spots",
              "fallback.reason": cacheMetadata?.reason ?? "unknown",
              "availability.check_date": targetMoment.format("YYYY-MM-DD"),
            });
          }

          Sentry.metrics.count("academic_availability.cache_lookup", 1, {
            attributes: { result: cacheResult },
          });
        } catch (telemetryError) {
          console.warn("Cache telemetry failed:", telemetryError);
        }

        return response;
      },
    );

    if (error) {
      Sentry.captureException(error, {
        tags: { component: "supabase", operation: "get_cached_spots" },
      });
      Sentry.getActiveSpan()?.setAttribute("result.partial", true);
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
          roomCounts: building.roomCounts || { available: 0, total: 0 }, // Counts are based on targetMoment
          rooms: {},
        };

        Object.entries(building.rooms || {}).forEach(([roomNumber, roomData]) => {
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
    Sentry.captureException(error, {
      tags: { component: "supabase", operation: "get_cached_spots" },
    });
    Sentry.getActiveSpan()?.setAttribute("result.partial", true);
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
              status: roomData.status,
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
    Sentry.captureException(error, {
      tags: { component: "libcal", operation: "update-facilities" },
    });
    Sentry.getActiveSpan()?.setAttribute("result.partial", true);
    console.error("Error in updateLibraryFacilities:", error);
  }

  return libraryFacilities;
}

export type FacilityScope = "academic" | "library" | "all";

/**
 * Builds the response shared by the HTTP route and direct tests. Keeping HTTP
 * parsing outside this service makes the data orchestration reusable and keeps
 * framework concerns out of the availability domain.
 */
export async function getFacilityStatus(
  targetMoment: moment.Moment,
  facilityScope: FacilityScope,
): Promise<FacilityStatus> {
  const includeAcademic =
    facilityScope === "all" || facilityScope === "academic";
  const includeLibraries =
    facilityScope === "all" || facilityScope === "library";

  const fetchPromises: Promise<Record<string, Facility>>[] = [];

  if (includeAcademic) {
    fetchPromises.push(fetchAcademicBuildingData(targetMoment));
  }

  if (includeLibraries) {
    fetchPromises.push(
      updateLibraryFacilities(initializeLibraryFacilities(), targetMoment),
    );
  }

  const results = await Promise.all(fetchPromises);
  const facilities = Object.assign({}, ...results);

  return {
    timestamp: targetMoment.toISOString(),
    facilities,
  };
}
