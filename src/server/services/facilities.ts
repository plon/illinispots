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
import {
  getActiveLibraryHours,
  LIBRARY_HOURS,
} from "../../utils/libraryHours";
import { Sentry } from "../observability";
import {
  LIBRARIES,
  STATIC_ROOMS_BY_LIBRARY,
} from "../data/library-catalog";
import {
  parseAcademicAvailabilityPayload,
  parseReservationResponse,
  type AcademicAvailabilityPayload,
} from "./external-contracts";
import { getSupabaseClient } from "./supabase";

const LIBCAL_REQUEST_TIMEOUT_MS = 10_000;
const CAMPUS_TIMEZONE = "America/Chicago";
const MILLISECONDS_PER_MINUTE = 60_000;
const PARSED_DATE_TIME_CACHE_LIMIT = 2_048;
const LIBCAL_AVAILABILITY_URL =
  "https://libcal.library.illinois.edu/spaces/availability/grid";
const LIBCAL_REQUEST_HEADERS = {
  accept: "application/json, text/javascript, */*; q=0.01",
  "accept-language": "en-US,en;q=0.9",
  "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
  origin: "https://libcal.library.illinois.edu",
  referer: "https://libcal.library.illinois.edu/allspaces",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  "x-requested-with": "XMLHttpRequest",
} as const;

interface ParsedLocalDateTime {
  timestamp: number;
  time: string;
}

const parsedLocalDateTimeCache = new Map<string, ParsedLocalDateTime>();

interface IndexedReservationSlot {
  className?: string;
  startTime: ParsedLocalDateTime;
  endTime: ParsedLocalDateTime;
}

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
type AcademicAvailabilityExecutor = NonNullable<
  FacilitiesServiceDependencies["executeAcademicAvailabilityRpc"]
>;

async function executeAcademicAvailabilityRpc(
  procedure: "get_cached_spots",
  parameters: AcademicAvailabilityRpcParameters,
): Promise<AcademicAvailabilityRpcResult> {
  return await getSupabaseClient().rpc(procedure, parameters);
}

/**
 * Retrieves reservation data for a specific library for the relevant date(s)
 */
async function getReservation(
  lid: string,
  targetMoment: moment.Moment,
  fetcher: FacilitiesFetch,
): Promise<ReservationResponse> {
  const targetDateCST = targetMoment
    .clone()
    .tz(CAMPUS_TIMEZONE)
    .startOf("day");
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

  return await Sentry.startSpan(
    {
      name: "Fetch LibCal availability",
      op: "app.library.availability",
      attributes: { "library.id": lid },
    },
    async () => {
      const response = await fetcher(LIBCAL_AVAILABILITY_URL, {
        method: "POST",
        headers: LIBCAL_REQUEST_HEADERS,
        body: new URLSearchParams(payload),
        signal: AbortSignal.timeout(LIBCAL_REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(
          `LibCal availability request failed with status ${response.status}`,
        );
      }

      return parseReservationResponse(await response.json());
    },
  );
}

function parseLocalDateTime(value: string): ParsedLocalDateTime {
  const cached = parsedLocalDateTimeCache.get(value);
  if (cached) return cached;

  const parsedMoment = moment.tz(value, CAMPUS_TIMEZONE);
  const parsed = {
    timestamp: parsedMoment.valueOf(),
    time: parsedMoment.format("HH:mm:ss"),
  };
  if (parsedLocalDateTimeCache.size >= PARSED_DATE_TIME_CACHE_LIMIT) {
    const oldestKey = parsedLocalDateTimeCache.keys().next().value;
    if (oldestKey !== undefined) {
      parsedLocalDateTimeCache.delete(oldestKey);
    }
  }
  parsedLocalDateTimeCache.set(value, parsed);
  return parsed;
}

function indexReservationSlots(
  slots: ReservationResponse["slots"],
): Map<number, IndexedReservationSlot[]> {
  const slotsByRoom = new Map<number, IndexedReservationSlot[]>();
  const outOfOrderRoomSlots = new Set<IndexedReservationSlot[]>();

  for (const slot of slots) {
    const indexedSlot: IndexedReservationSlot = {
      className: slot.className,
      startTime: parseLocalDateTime(slot.start),
      endTime: parseLocalDateTime(slot.end),
    };
    const roomSlots = slotsByRoom.get(slot.itemId);
    if (roomSlots) {
      if (
        roomSlots[roomSlots.length - 1].startTime.timestamp >
        indexedSlot.startTime.timestamp
      ) {
        outOfOrderRoomSlots.add(roomSlots);
      }
      roomSlots.push(indexedSlot);
    } else {
      slotsByRoom.set(slot.itemId, [indexedSlot]);
    }
  }

  for (const roomSlots of outOfOrderRoomSlots) {
    roomSlots.sort(
      (first, second) =>
        first.startTime.timestamp - second.startTime.timestamp,
    );
  }

  return slotsByRoom;
}

/**
 * Calculates the total duration of continuous availability starting from a specific slot/time
 */
function calculateAvailabilityDuration(
  slots: IndexedReservationSlot[],
  startIndex: number,
  fromTimestamp: number,
  libraryClosingTimestamp: number | null,
): number {
  const currentSlot = slots[startIndex];
  let endTimestamp = currentSlot.endTime.timestamp;

  if (
    libraryClosingTimestamp !== null &&
    endTimestamp > libraryClosingTimestamp
  ) {
    endTimestamp = libraryClosingTimestamp;
  }

  // Ensure the slot actually ends after the 'fromTime'
  if (endTimestamp <= fromTimestamp) {
    return 0;
  }

  // Initial duration (from 'fromTime' to the end of the current slot)
  let duration = Math.floor(
    (endTimestamp - fromTimestamp) / MILLISECONDS_PER_MINUTE,
  );

  // Check for contiguous future slots
  let lastEndTimestamp = endTimestamp;
  let i = startIndex + 1;

  while (i < slots.length) {
    const nextSlot = slots[i];
    // Stop if the next slot is a reservation
    if (nextSlot.className === "s-lc-eq-checkout") break;

    const nextStartTimestamp = nextSlot.startTime.timestamp;
    let nextEndTimestamp = nextSlot.endTime.timestamp;

    // Check if truly contiguous (start time matches the previous end time)
    if (lastEndTimestamp !== nextStartTimestamp) break;

    // Apply closing time cap if needed
    if (libraryClosingTimestamp !== null) {
      // If the next slot starts *after* closing, it's irrelevant
      if (nextStartTimestamp >= libraryClosingTimestamp) break;
      // If the next slot ends after closing, cap it at the closing time
      if (nextEndTimestamp > libraryClosingTimestamp) {
        nextEndTimestamp = libraryClosingTimestamp;
      }
    }

    // Add the duration of this contiguous slot
    duration += Math.floor(
      (nextEndTimestamp - nextStartTimestamp) / MILLISECONDS_PER_MINUTE,
    );
    lastEndTimestamp = nextEndTimestamp;
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
 * Links room data with reservation data to create a complete picture of room availability at a specific time
 */
function linkRoomsReservations(
  roomsData: StudyRoom[],
  reservationsData: ReservationResponse,
  targetMoment: moment.Moment,
  libraryClosingMoment: moment.Moment | null,
): RoomReservations {
  const roomReservations: RoomReservations = {};
  const targetTimestamp = targetMoment.valueOf();
  const slotsByRoom = indexReservationSlots(reservationsData.slots);
  const libraryClosingTime = libraryClosingMoment
    ? {
        timestamp: libraryClosingMoment.valueOf(),
        time: libraryClosingMoment.format("HH:mm:ss"),
      }
    : null;
  const libraryClosingTimestamp = libraryClosingTime?.timestamp ?? null;

  for (const room of roomsData) {
    const roomId = room.eid;
    let availableAt: string | undefined;
    let availableDuration = 0;
    let roomStatus: RoomStatus = RoomStatus.RESERVED; // Default status

    const roomSpecificSlots = slotsByRoom.get(roomId) ?? [];

    let currentAvailableSlotIndex = -1;
    let nextAvailableSlotIndex = -1;

    // Slots are indexed and sorted once for the entire LibCal response. Stop as
    // soon as the current or first future available interval is known.
    for (let index = 0; index < roomSpecificSlots.length; index++) {
      const slot = roomSpecificSlots[index];
      const startTimestamp = slot.startTime.timestamp;
      const endTimestamp = slot.endTime.timestamp;
      const isAvailableSlot = slot.className !== "s-lc-eq-checkout";

      if (
        isAvailableSlot &&
        startTimestamp <= targetTimestamp &&
        endTimestamp > targetTimestamp &&
        (libraryClosingTimestamp === null ||
          targetTimestamp < libraryClosingTimestamp)
      ) {
        currentAvailableSlotIndex = index;
        break;
      }

      if (
        isAvailableSlot &&
        startTimestamp > targetTimestamp &&
        (libraryClosingTimestamp === null ||
          startTimestamp < libraryClosingTimestamp)
      ) {
        nextAvailableSlotIndex = index;
        break;
      }
    }

    if (roomSpecificSlots.length === 0) {
      // LibCal returns timeblocks even when every block is reserved. No blocks
      // means the room is not open/bookable for the selected date.
      roomStatus = RoomStatus.UNAVAILABLE;
      availableDuration = 0;
      availableAt = undefined;
    } else if (currentAvailableSlotIndex !== -1) {
      roomStatus = RoomStatus.AVAILABLE;
      availableDuration = calculateAvailabilityDuration(
        roomSpecificSlots,
        currentAvailableSlotIndex,
        targetTimestamp,
        libraryClosingTimestamp,
      );
    } else {
      // If not currently available, check if we found a future available slot
      if (nextAvailableSlotIndex !== -1) {
        const nextAvailableStart =
          roomSpecificSlots[nextAvailableSlotIndex].startTime;
        availableAt = nextAvailableStart.time;
        // Calculate duration from the start of that future slot
        availableDuration = calculateAvailabilityDuration(
          roomSpecificSlots,
          nextAvailableSlotIndex,
          nextAvailableStart.timestamp,
          libraryClosingTimestamp,
        );
        const minutesUntilAvailable = Math.trunc(
          (nextAvailableStart.timestamp - targetTimestamp) /
            MILLISECONDS_PER_MINUTE,
        );

        if (
          minutesUntilAvailable >= 0 &&
          minutesUntilAvailable <= 20 &&
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

    const roomSlots: TimeSlot[] = [];
    for (const slot of roomSpecificSlots) {
      if (slot.endTime.timestamp <= targetTimestamp) continue;

      const endTimestamp =
        libraryClosingTimestamp !== null &&
        slot.endTime.timestamp > libraryClosingTimestamp
          ? libraryClosingTimestamp
          : slot.endTime.timestamp;

      if (
        slot.startTime.timestamp < endTimestamp &&
        (libraryClosingTimestamp === null ||
          slot.startTime.timestamp < libraryClosingTimestamp)
      ) {
        roomSlots.push({
          start: slot.startTime.time,
          end:
            endTimestamp === slot.endTime.timestamp
              ? slot.endTime.time
              : (libraryClosingTime?.time ?? slot.endTime.time),
          available: slot.className !== "s-lc-eq-checkout",
        });
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
  fetcher: FacilitiesFetch,
  closingTimes: ReadonlyMap<string, moment.Moment>,
): Promise<FormattedLibraryData> {
  const result: FormattedLibraryData = {};

  if (openLibraries.length === 0) {
    return result; // No open libraries to process
  }

  // Process only the libraries that are open at targetMoment. Keep failures
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
      reservationData = await getReservation(lid, targetMoment, fetcher);
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
      targetMoment,
      closingTimes.get(libraryName) ?? null,
    );
    let availableCount = 0;
    let roomCount = 0;
    for (const room of Object.values(roomReservations)) {
      roomCount += 1;
      if (room.status === RoomStatus.AVAILABLE) {
        availableCount += 1;
      }
    }

    return {
      libraryName,
      data: {
        room_count: roomCount,
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
  targetMoment: moment.Moment,
  executeRpc: AcademicAvailabilityExecutor,
): Promise<Record<string, Facility>> {
  const facilities: Record<string, Facility> = {};
  let buildingData: AcademicAvailabilityPayload;
  const checkTime = targetMoment.format("HH:mm:ss");
  const checkDate = targetMoment.format("YYYY-MM-DD");

  try {
    const { data, error } = await Sentry.startSpan(
      {
        name: "Supabase RPC get_cached_spots",
        op: "db.rpc",
      },
      async (span) => {
        const response = await executeRpc("get_cached_spots", {
          check_time_param: checkTime,
          check_date_param: checkDate,
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
            "availability.check_date": checkDate,
          });

          if (cacheResult === "fallback") {
            span.addEvent("cache.fallback", {
              "fallback.operation": "get_spots",
              "fallback.reason": cacheMetadata?.reason ?? "unknown",
              "availability.check_date": checkDate,
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

  const openingSoonByTime = new Map<string, boolean>();

  for (const id of Object.keys(buildingData.buildings)) {
    const building = buildingData.buildings[id];
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

    for (const roomNumber of Object.keys(building.rooms)) {
      const roomData = building.rooms[roomNumber];
      let status: RoomStatus;
      if (roomData.status === "available") {
        if (roomData.passingPeriod) {
          status = RoomStatus.PASSING_PERIOD;
        } else {
          status = RoomStatus.AVAILABLE;
        }
      } else {
        let openingSoon = false;
        if (roomData.availableAt) {
          const cached = openingSoonByTime.get(roomData.availableAt);
          openingSoon =
            cached ?? isOpeningSoon(roomData.availableAt, targetMoment);
          if (cached === undefined) {
            openingSoonByTime.set(roomData.availableAt, openingSoon);
          }
        }

        if (
          roomData.availableAt &&
          openingSoon &&
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
    }

    facilities[id] = academicFacility;
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
  fetcher: FacilitiesFetch,
): Promise<Record<string, Facility>> {
  const closingTimes = new Map<string, moment.Moment>();

  Object.entries(libraryFacilities).forEach(([libraryName, facility]) => {
    const activeHours = getActiveLibraryHours(libraryName, targetMoment);
    facility.isOpen = activeHours !== null;
    if (activeHours) {
      closingTimes.set(libraryName, activeHours.close);
    }

    const dayOfWeek = targetMoment.format("dddd");
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
    targetMoment,
    fetcher,
    closingTimes,
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
  targetMoment: moment.Moment,
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
    fetchPromises.push(fetchAcademicBuildingData(targetMoment, executeRpc));
  }

  if (includeLibraries) {
    fetchPromises.push(
      updateLibraryFacilities(
        initializeLibraryFacilities(),
        targetMoment,
        fetcher,
      ),
    );
  }

  const results = await Promise.all(fetchPromises);
  const facilities = Object.assign({}, ...results);

  return {
    timestamp: targetMoment.toISOString(),
    facilities,
  };
}
