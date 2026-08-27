import { createClient } from "@supabase/supabase-js";
import { DateTime } from "luxon";
import type { Database } from "../../types/database.types";
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
import {
  getActiveLibraryHours,
  isLibraryOpen,
} from "./library-hours";
import { LIBRARY_HOURS } from "../../utils/libraryHours";
import { CAMPUS_TIMEZONE } from "../../utils/time";
import { getSupabaseConfig } from "../config";
import { Sentry } from "../observability";
import { parseCampusTimestamp, wholeMinutesBetween } from "../time";
import {
  LIBRARIES,
  STATIC_ROOMS_BY_LIBRARY,
} from "../data/library-catalog";
import {
  parseAcademicAvailabilityPayload,
  parseReservationResponse,
  type AcademicAvailabilityPayload,
} from "./external-contracts";

const LIBCAL_REQUEST_TIMEOUT_MS = 10_000;

export interface AcademicAvailabilityRpcResult {
  data: unknown;
  error: unknown;
}

export interface AcademicAvailabilityRpcParameters {
  check_time_param: string;
  check_date_param: string;
  min_minutes_param: number;
}

export type FacilitiesFetch = (
  ...arguments_: Parameters<typeof globalThis.fetch>
) => ReturnType<typeof globalThis.fetch>;

export interface FacilitiesServiceDependencies {
  fetch?: FacilitiesFetch;
  executeAcademicAvailabilityRpc?: (
    procedure: "get_cached_spots",
    parameters: AcademicAvailabilityRpcParameters,
  ) => Promise<AcademicAvailabilityRpcResult>;
}

async function executeAcademicAvailabilityRpc(
  procedure: "get_cached_spots",
  parameters: AcademicAvailabilityRpcParameters,
): Promise<AcademicAvailabilityRpcResult> {
  const supabaseConfig = getSupabaseConfig();
  const supabase = createClient<Database>(
    supabaseConfig.url,
    supabaseConfig.key,
  );

  return await supabase.rpc(procedure, parameters);
}

/**
 * Retrieves reservation data for a specific library for the relevant date(s)
 */
async function getReservation(
  lid: string,
  targetDateTime: DateTime,
  fetcher: FacilitiesFetch,
): Promise<ReservationResponse> {
  const url = "https://libcal.library.illinois.edu/spaces/availability/grid";
  const targetDay = targetDateTime.setZone(CAMPUS_TIMEZONE).startOf("day");
  const nextDay = targetDay.plus({ days: 1 });

  const startDate = targetDay.toFormat("yyyy-MM-dd");
  const fetchNextDay =
    lid === "3604" && targetDateTime.hour >= 22;
  const endDate = fetchNextDay
    ? nextDay.plus({ days: 1 }).toFormat("yyyy-MM-dd")
    : nextDay.toFormat("yyyy-MM-dd");

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
      fetcher(url, {
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

  return parseReservationResponse(await response.json());
}

/**
 * Calculates the total duration of continuous availability starting from a specific slot/time
 */
function calculateAvailabilityDuration(
  slots: ReservationResponse["slots"],
  startIndex: number,
  fromTime: DateTime, // Time to calculate duration
  libraryClosingTime: DateTime | null, // Pass closing time, null if not applicable
): number {
  const currentSlot = slots[startIndex];
  let endTime = parseCampusTimestamp(currentSlot.end);

  if (libraryClosingTime && endTime > libraryClosingTime) {
    endTime = libraryClosingTime;
  }
  if (endTime <= fromTime) return 0;

  let duration = wholeMinutesBetween(endTime, fromTime);
  let lastEnd = endTime;
  let i = startIndex + 1;

  while (i < slots.length) {
    const nextSlot = slots[i];
    // Stop if the next slot is a reservation
    if (nextSlot.className === "s-lc-eq-checkout") break;

    const nextStart = parseCampusTimestamp(nextSlot.start);
    let nextEnd = parseCampusTimestamp(nextSlot.end);

    if (lastEnd.toMillis() !== nextStart.toMillis()) break;

    if (libraryClosingTime) {
      if (nextStart >= libraryClosingTime) break;
      if (nextEnd > libraryClosingTime) nextEnd = libraryClosingTime;
    }

    duration += wholeMinutesBetween(nextEnd, nextStart);
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
  targetDateTime: DateTime,
): boolean => {
  let availableTime = parseCampusTimestamp(
    `${targetDateTime.toFormat("yyyy-MM-dd")} ${availableAt}`,
  );
  if (availableTime < targetDateTime) {
    availableTime = availableTime.plus({ days: 1 });
  }

  const diffInMinutes = wholeMinutesBetween(availableTime, targetDateTime);
  // Check if it's opening within the next 20 minutes (inclusive of 0)
  return diffInMinutes <= 20 && diffInMinutes >= 0;
};

/**
 * Links room data with reservation data to create a complete picture of room availability at a specific time
 */
function linkRoomsReservations(
  roomsData: StudyRoom[],
  reservationsData: ReservationResponse,
  targetDateTime: DateTime,
): RoomReservations {
  const roomReservations: RoomReservations = {};
  const libraryIds = new Set(
    Object.values(LIBRARIES).map((lib) => parseInt(lib.id)),
  );
  const targetDateTimeString = targetDateTime.toFormat("yyyy-MM-dd HH:mm:ss");

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

    const libraryClosingTime = getActiveLibraryHours(
      libraryName,
      targetDateTime,
    )?.close ?? null;

    // Filter slots relevant to the room and sort them
    const roomSpecificSlots = reservationsData.slots
      .filter((slot) => slot.itemId === roomId)
      .sort((a, b) => parseCampusTimestamp(a.start).toMillis() - parseCampusTimestamp(b.start).toMillis());

    let nextAvailableSlotIndex = -1;
    let nextAvailableStartTime: DateTime | null = null;
    let currentStatusDetermined = false;

    // Loop through slots to determine the status and next availability
    for (let index = 0; index < roomSpecificSlots.length; index++) {
      const slot = roomSpecificSlots[index];
      const startTime = parseCampusTimestamp(slot.start);
      const endTime = parseCampusTimestamp(slot.end);
      const isAvailableSlot = slot.className !== "s-lc-eq-checkout";

      // Only determine status once
      if (!currentStatusDetermined) {
        // Check if the slot is currently available at targetDateTime
        if (
          isAvailableSlot &&
          startTime <= targetDateTime &&
          endTime > targetDateTime
        ) {
          // Check if it's actually within library hours if closing time is known
          if (
            !libraryClosingTime ||
            targetDateTime < libraryClosingTime
          ) {
            isCurrentlyAvailable = true;
            roomStatus = RoomStatus.AVAILABLE;
            // Calculate duration from targetDateTime until end of contiguous block or closing time
            availableDuration = calculateAvailabilityDuration(
              roomSpecificSlots,
              index,
              targetDateTime, // Start calculating from targetDateTime
              libraryClosingTime,
            );
            currentStatusDetermined = true; // Status found
            nextAvailableSlotIndex = -1; // Reset this as we are currently available
          }
        }

        // If not currently available, find the next available slot starting after targetDateTime
        if (
          !isCurrentlyAvailable && // Only look if not already found available
          isAvailableSlot &&
          startTime > targetDateTime
        ) {
          // Ensure the potential next slot starts before the library closes
          if (!libraryClosingTime || startTime < libraryClosingTime) {
            // If this is the first future available slot we've found
            if (nextAvailableSlotIndex === -1) {
              nextAvailableSlotIndex = index;
              nextAvailableStartTime = startTime;
            }
          }
        }
      }

      // If targetDateTime is past the end of this slot, and we haven't found the status yet,
      // it means the targetDateTime falls between slots (or after the last one).
      if (!currentStatusDetermined && targetDateTime >= endTime) {
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
        availableAt = nextAvailableStartTime.toFormat("HH:mm:ss");
        // Calculate duration from the start of that future slot
        availableDuration = calculateAvailabilityDuration(
          roomSpecificSlots,
          nextAvailableSlotIndex,
          nextAvailableStartTime,
          libraryClosingTime,
        );

        if (
          availableAt &&
          isOpeningSoon(availableAt, targetDateTime) &&
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
      // Find the first slot that ends after the targetDateTime.
      // This includes the currently active slot or the next future slot.
      if (roomSpecificSlots[i].end > targetDateTimeString) {
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
        const startTime = parseCampusTimestamp(slot.start);
        let endTime = parseCampusTimestamp(slot.end);
        const isAvailableSlot = slot.className !== "s-lc-eq-checkout";

        // Apply library closing time cap
        if (libraryClosingTime && endTime > libraryClosingTime) {
          endTime = libraryClosingTime;
        }

        // Only include the slot if its start time is before the (potentially capped) end time
        // and before the library closing time (if applicable)
        if (
          startTime < endTime &&
          (!libraryClosingTime || startTime < libraryClosingTime)
        ) {
          return {
            start: startTime.toFormat("HH:mm:ss"),
            end: endTime.toFormat("HH:mm:ss"),
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
  openLibraries: string[], // Libraries determined to be open at targetDateTime
  targetDateTime: DateTime,
  fetcher: FacilitiesFetch,
): Promise<FormattedLibraryData> {
  const result: FormattedLibraryData = {};

  if (openLibraries.length === 0) {
    return result; // No open libraries to process
  }

  // Process only the libraries that are open at targetDateTime. Keep failures
  // isolated so one unavailable LibCal calendar does not erase other results.
  const libraryPromises = openLibraries.map(async (libraryName) => {
    const libraryInfo = LIBRARIES[libraryName];
    if (!libraryInfo) return null; // Should not happen if openLibraries is correct

    const lid = libraryInfo.id;
    const libraryRooms = STATIC_ROOMS_BY_LIBRARY[lid] || [];
    if (libraryRooms.length === 0) {
      console.warn(
        `No static room metadata found for library ${libraryName} (lid ${lid})`,
      );
      return null;
    }

    let reservationData: ReservationResponse;
    try {
      reservationData = await getReservation(lid, targetDateTime, fetcher);
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          component: "libcal",
          operation: "fetch-availability",
          library: libraryName,
        },
      });
      Sentry.getActiveSpan()?.setAttribute("result.partial", true);
      console.error(`Error fetching library data for ${libraryName}:`, error);
      return null;
    }

    const roomReservations = linkRoomsReservations(
      libraryRooms,
      reservationData,
      targetDateTime,
    );
    const availableCount = Object.values(roomReservations).filter(
      (room) => room.status === RoomStatus.AVAILABLE,
    ).length;

    return {
      libraryName,
      data: {
        room_count: Object.keys(roomReservations).length,
        currently_available: availableCount,
        rooms: roomReservations,
        address: libraryInfo.address,
      },
    };
  });

  const libraryResults = await Promise.all(libraryPromises);

  libraryResults.forEach((libraryResult) => {
    if (libraryResult) {
      result[libraryResult.libraryName] = libraryResult.data;
    }
  });

  return result;
}

// ===== Main API Handler =====

/**
 * Fetches academic building data from Supabase for a specific time
 */
async function fetchAcademicBuildingData(
  targetDateTime: DateTime,
  executeRpc: NonNullable<
    FacilitiesServiceDependencies["executeAcademicAvailabilityRpc"]
  >,
): Promise<Record<string, Facility>> {
  const facilities: Record<string, Facility> = {};
  let buildingData: AcademicAvailabilityPayload;

  try {
    const { data, error } = await Sentry.startSpan(
      {
        name: "Supabase RPC get_cached_spots",
        op: "db.rpc",
      },
      async (span) => {
        const response = await executeRpc("get_cached_spots", {
          check_time_param: targetDateTime.toFormat("HH:mm:ss"),
          check_date_param: targetDateTime.toFormat("yyyy-MM-dd"),
          min_minutes_param: 30,
        });

        const parsedData = response.error
          ? null
          : parseAcademicAvailabilityPayload(response.data);
        const cacheMetadata = parsedData?._cache;
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
            "availability.check_date": targetDateTime.toFormat("yyyy-MM-dd"),
          });

          if (cacheResult === "fallback") {
            span.addEvent("cache.fallback", {
              "fallback.operation": "get_spots",
              "fallback.reason": cacheMetadata?.reason ?? "unknown",
              "availability.check_date": targetDateTime.toFormat("yyyy-MM-dd"),
            });
          }

          Sentry.metrics.count("academic_availability.cache_lookup", 1, {
            attributes: { result: cacheResult },
          });
        } catch (telemetryError) {
          console.warn("Cache telemetry failed:", telemetryError);
        }

        return { data: parsedData, error: response.error };
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
    if (!data) {
      return facilities;
    }
    buildingData = data;
  } catch (error) {
    Sentry.captureException(error, {
      tags: { component: "supabase", operation: "get_cached_spots" },
    });
    Sentry.getActiveSpan()?.setAttribute("result.partial", true);
    console.error("Error loading academic availability:", error);
    return facilities;
  }

  Object.entries(buildingData.buildings).forEach(([id, building]) => {
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
          isOpeningSoon(roomData.availableAt, targetDateTime) &&
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
        status,
        currentClass: roomData.currentClass,
        nextClass: roomData.nextClass,
        availableAt: roomData.availableAt,
        availableFor: roomData.availableFor
          ? Math.max(0, roomData.availableFor)
          : undefined,
        availableUntil: roomData.availableUntil,
      } as AcademicRoom;
    });

    facilities[id] = academicFacility;
  });

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
  targetDateTime: DateTime,
  fetcher: FacilitiesFetch,
): Promise<Record<string, Facility>> {
  Object.entries(libraryFacilities).forEach(([libraryName, facility]) => {
    facility.isOpen = isLibraryOpen(libraryName, targetDateTime);

    const dayOfWeek = targetDateTime.toFormat("cccc");
    const dailyHours = LIBRARY_HOURS[libraryName]?.[dayOfWeek];
    facility.hours.open = dailyHours?.open ?? "";
    facility.hours.close = dailyHours?.close ?? "";
  });

  const openLibraryNames = Object.entries(libraryFacilities)
    .filter(([, facility]) => facility.isOpen)
    .map(([name]) => name);

  if (openLibraryNames.length === 0) {
    return libraryFacilities;
  }

  const libraryData = await getFormattedLibraryData(
    openLibraryNames,
    targetDateTime,
    fetcher,
  );

  for (const libraryName of openLibraryNames) {
    if (!libraryData[libraryName]) {
      delete libraryFacilities[libraryName];
    }
  }

  Object.entries(libraryData).forEach(([name, data]) => {
    const libraryFacility = libraryFacilities[name];
    if (!libraryFacility?.isOpen) return;

    libraryFacility.roomCounts = {
      available: data.currently_available,
      total: data.room_count,
    };

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
  });

  return libraryFacilities;
}

export type FacilityScope = "academic" | "library" | "all";

/**
 * Builds the response shared by the HTTP route and direct tests. Keeping HTTP
 * parsing outside this service makes the data orchestration reusable and keeps
 * framework concerns out of the availability domain.
 */
export async function getFacilityStatus(
  targetDateTime: DateTime,
  facilityScope: FacilityScope,
  dependencies: FacilitiesServiceDependencies = {},
): Promise<FacilityStatus> {
  const includeAcademic =
    facilityScope === "all" || facilityScope === "academic";
  const includeLibraries =
    facilityScope === "all" || facilityScope === "library";

  const fetchPromises: Promise<Record<string, Facility>>[] = [];
  const fetcher = dependencies.fetch ?? globalThis.fetch;
  const executeRpc =
    dependencies.executeAcademicAvailabilityRpc ??
    executeAcademicAvailabilityRpc;

  if (includeAcademic) {
    fetchPromises.push(fetchAcademicBuildingData(targetDateTime, executeRpc));
  }

  if (includeLibraries) {
    fetchPromises.push(
      updateLibraryFacilities(
        initializeLibraryFacilities(),
        targetDateTime,
        fetcher,
      ),
    );
  }

  const results = await Promise.all(fetchPromises);
  const facilities = Object.assign({}, ...results);

  return {
    timestamp: targetDateTime.toUTC().toISO() ?? targetDateTime.toString(),
    facilities,
  };
}
