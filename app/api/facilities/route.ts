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
async function getReservation(lid: string, nowCST: moment.Moment): Promise<ReservationResponse> {
  const url = "https://uiuc.libcal.com/spaces/availability/grid";

  const todayCST = nowCST.clone().startOf('day');
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
 * Links room data with reservation data to create a complete picture of room availability
 */
function linkRoomsReservations(
  roomsData: StudyRoom[],
  reservationsData: ReservationResponse,
  nowCST: moment.Moment
): RoomReservations {
  const roomReservations: RoomReservations = {};
  const libraryIds = new Set(
    Object.values(libraries).map((lib) => parseInt(lib.id)),
  );
  const todayCST = nowCST.clone().startOf('day');
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

    const roomSpecificSlots = reservationsData.slots
      .filter((slot) => slot.itemId === roomId)
      .sort((a, b) => moment(a.start).valueOf() - moment(b.start).valueOf());

    for (const slot of roomSpecificSlots) {
      const startTime = moment.tz(slot.start, "America/Chicago");
      const endTime = moment.tz(slot.end, "America/Chicago");
      const slotStartTime = startTime.format("HH:mm:ss");
      const slotEndTime = endTime.format("HH:mm:ss");
      const isAvailable = slot.className !== "s-lc-eq-checkout";

      // Check if slot should be included based on library and time
      if (
        startTime.isSame(todayCST, "day") ||
        (room.lid === 3604 &&
          startTime.isAfter(todayCST) &&
          startTime.isBefore(tomorrowTwoAM))
      ) {
        roomSlots.push({
          start: slotStartTime,
          end: slotEndTime,
          available: isAvailable,
        });

        // Check current availability
        if (slotStartTime <= currentTime && slotEndTime > currentTime) {
          if (isAvailable) {
            const currentMoment = nowCST;
            let slotEndMoment = endTime;

            // For Funk ACES, cap the end time at 2 AM if slot extends beyond
            if (room.lid === 3604 && slotEndMoment.isAfter(tomorrowTwoAM)) {
              slotEndMoment = tomorrowTwoAM;
            }

            // Calculate initial duration from current time to slot end
            availableDuration = slotEndMoment.diff(currentMoment, "minutes");

            // Find current slot index
            const currentSlotIndex = roomSpecificSlots.findIndex(
              (s) => s === slot,
            );

            // Check subsequent slots for continuous availability
            if (currentSlotIndex !== -1) {
              let nextIndex = currentSlotIndex + 1;
              let lastEndMoment = slotEndMoment;

              while (nextIndex < roomSpecificSlots.length) {
                const nextSlot = roomSpecificSlots[nextIndex];
                if (nextSlot.className === "s-lc-eq-checkout") break;

                const nextStartMoment = moment.tz(
                  nextSlot.start,
                  "America/Chicago",
                );
                let nextEndMoment = moment.tz(nextSlot.end, "America/Chicago");

                // Skip if not continuous
                if (
                  lastEndMoment.format("HH:mm:ss") !==
                  nextStartMoment.format("HH:mm:ss")
                ) {
                  break;
                }

                // For Funk ACES, only include slots up to 2 AM next day
                if (room.lid === 3604) {
                  if (nextStartMoment.isAfter(tomorrowTwoAM)) {
                    break;
                  }
                  if (nextEndMoment.isAfter(tomorrowTwoAM)) {
                    nextEndMoment = tomorrowTwoAM;
                  }
                }

                // Add this slot's duration to availableDuration
                availableDuration += nextEndMoment.diff(
                  nextStartMoment,
                  "minutes",
                );
                lastEndMoment = nextEndMoment;
                nextIndex++;
              }
            }
          }
        }

        // Update availableAt if the slot is available in the future
        if (
          isAvailable &&
          slotStartTime > currentTime &&
          (availableAt === undefined ||
            slotStartTime < availableAt.toLowerCase())
        ) {
          availableAt = slotStartTime;
          
          // Calculate duration for future availability
          const startMoment = moment.tz(`1970-01-01T${slotStartTime}`, "America/Chicago");
          const endMoment = moment.tz(`1970-01-01T${slotEndTime}`, "America/Chicago");
          
          // Handle overnight slots
          if (endMoment.isBefore(startMoment)) {
            endMoment.add(1, "day");
          }
          
          // Set initial duration
          availableDuration = endMoment.diff(startMoment, "minutes");
          
          // Find the slot index
          const futureSlotIndex = roomSpecificSlots.findIndex(
            (s) => moment.tz(s.start, "America/Chicago").format("HH:mm:ss") === slotStartTime
          );
          
          // Check subsequent slots for continuous availability
          if (futureSlotIndex !== -1) {
            let nextIndex = futureSlotIndex + 1;
            let lastEndMoment = endMoment;

            while (nextIndex < roomSpecificSlots.length) {
              const nextSlot = roomSpecificSlots[nextIndex];
              if (nextSlot.className === "s-lc-eq-checkout") break;

              const nextStartMoment = moment.tz(
                nextSlot.start,
                "America/Chicago",
              );
              let nextEndMoment = moment.tz(nextSlot.end, "America/Chicago");
              
              // Normalize to 1970-01-01 for comparison
              const normalizedNextStart = moment.tz(
                `1970-01-01T${nextStartMoment.format("HH:mm:ss")}`,
                "America/Chicago"
              );
              const normalizedLastEnd = moment.tz(
                `1970-01-01T${lastEndMoment.format("HH:mm:ss")}`,
                "America/Chicago"
              );

              // Skip if not continuous
              if (normalizedLastEnd.format("HH:mm:ss") !== normalizedNextStart.format("HH:mm:ss")) {
                break;
              }

              // For Funk ACES, only include slots up to 2 AM next day
              if (room.lid === 3604) {
                if (nextStartMoment.isAfter(tomorrowTwoAM)) {
                  break;
                }
                if (nextEndMoment.isAfter(tomorrowTwoAM)) {
                  nextEndMoment = tomorrowTwoAM;
                }
              }

              // Add this slot's duration to availableDuration
              const nextStartNormalized = moment.tz(
                `1970-01-01T${nextStartMoment.format("HH:mm:ss")}`,
                "America/Chicago"
              );
              const nextEndNormalized = moment.tz(
                `1970-01-01T${nextEndMoment.format("HH:mm:ss")}`,
                "America/Chicago"
              );
              
              // Handle overnight slots
              if (nextEndNormalized.isBefore(nextStartNormalized)) {
                nextEndNormalized.add(1, "day");
              }
              
              availableDuration += nextEndNormalized.diff(
                nextStartNormalized,
                "minutes"
              );
              
              lastEndMoment = nextEndMoment;
              nextIndex++;
            }
          }
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
async function getFormattedLibraryData(openLibraries?: string[], nowCST?: moment.Moment): Promise<FormattedLibraryData> {
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

    // Process libraries we care about
    for (const [libraryName, libraryInfo] of Object.entries(libraries)) {
      // Skip libraries that aren't open if we have a filtered list
      if (openLibraries && !openLibraries.includes(libraryName)) {
        continue;
      }
      
      const lid = libraryInfo.id;
      const reservationData = await getReservation(lid, nowCST);
      const libraryRooms = roomsByLibrary[lid] || [];
      const roomReservations = linkRoomsReservations(
        libraryRooms,
        reservationData,
        nowCST
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

      result[libraryName] = {
        room_count: Object.keys(roomReservations).length,
        currently_available: availableCount,
        rooms: roomReservations,
        address: libraryInfo.address,
      };
    }
  } catch (error) {
    console.error("Error fetching library data:", error);
  }

  return result;
}

// ===== Main API Handler =====

/**
 * Main API endpoint handler
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const includeAcademic = url.searchParams.get('academic') !== 'false';
    const includeLibraries = url.searchParams.get('libraries') !== 'false';
    
    const nowCST = moment().tz("America/Chicago");
    const timestamp = nowCST.format();
    
    // Initialize the unified response object
    const facilityStatus: FacilityStatus = {
      timestamp,
      facilities: {}
    };

    // Get building data if requested
    if (includeAcademic) {
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
      } else if (buildingData?.buildings) {
        // Process academic buildings
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
          
          facilityStatus.facilities[id] = {
            id,
            name: building.name,
            type: FacilityType.ACADEMIC,
            coordinates: building.coordinates,
            hours: building.hours,
            rooms: building.rooms,
            isOpen: building.isOpen,
            roomCounts: building.roomCounts
          };
        });
      }
    }

    // Get library data if requested
    if (includeLibraries) {
      // Define library facilities with coordinates and check if they're open
      const libraryFacilities: Record<string, Facility> = {
        "Grainger Engineering Library": {
          id: "grainger",
          name: "Grainger Engineering Library",
          type: FacilityType.LIBRARY,
          coordinates: {
            latitude: 40.11247372608236,
            longitude: -88.2268586691797
          },
          hours: { open: "", close: "" },
          rooms: {},
          isOpen: false, // Will be determined by isLibraryOpen
          roomCounts: { available: 0, total: 0 },
          address: "1301 W Springfield Ave, Urbana, IL 61801"
        },
        "Funk ACES Library": {
          id: "aces",
          name: "Funk ACES Library",
          type: FacilityType.LIBRARY,
          coordinates: {
            latitude: 40.102836655077226,
            longitude: -88.22513280595481
          },
          hours: { open: "", close: "" },
          rooms: {},
          isOpen: false, // Will be determined by isLibraryOpen
          roomCounts: { available: 0, total: 0 },
          address: "1101 S Goodwin Ave, Urbana, IL 61801"
        },
        "Main Library": {
          id: "main",
          name: "Main Library",
          type: FacilityType.LIBRARY,
          coordinates: {
            latitude: 40.1047194114613,
            longitude: -88.22883490200387
          },
          hours: { open: "", close: "" },
          rooms: {},
          isOpen: false, // Will be determined by isLibraryOpen
          roomCounts: { available: 0, total: 0 },
          address: "1408 W Gregory Dr, Urbana, IL 61801"
        },
      };
      
      // Update each library's isOpen status based on its hours
      Object.entries(libraryFacilities).forEach(([libraryName, facility]) => {
        facility.isOpen = isLibraryOpen(libraryName);
      });
      
      // Add all library facilities to the response, even if they're closed
      Object.entries(libraryFacilities).forEach(([, facility]) => {
        facilityStatus.facilities[facility.id] = facility;
      });
      
      // Only fetch room data for libraries that are actually open
      const openLibraryNames = Object.entries(libraryFacilities)
        .filter(([, facility]) => facility.isOpen)
        .map(([name]) => name);

      if (openLibraryNames.length > 0) {
        // Get library data for open libraries only
        const libraryData = await getFormattedLibraryData(openLibraryNames, nowCST);
        
        // Add room data only for libraries that are open
        Object.entries(libraryData).forEach(([name, data]) => {
          if (libraryFacilities[name]?.isOpen) {
            const libraryFacility = libraryFacilities[name];
            
            // Set room counts
            libraryFacility.roomCounts = {
              available: data.currently_available,
              total: data.room_count
            };
            
            // Convert library rooms to FacilityRoom format
            Object.entries(data.rooms).forEach(([roomName, roomData]) => {
              const isAvailable = roomData.slots.some(slot => {
                const currentTime = nowCST.format("HH:mm:ss");
                return slot.available && slot.start <= currentTime && currentTime < slot.end;
              });
              
              libraryFacility.rooms[roomName] = {
                available: isAvailable,
                status: isAvailable ? "available" : "reserved",
                url: roomData.url,
                thumbnail: roomData.thumbnail,
                slots: roomData.slots,
                availableAt: roomData.availableAt,
                availableFor: roomData.availableDuration
              };
            });
            
            // Add to facilityStatus
            facilityStatus.facilities[libraryFacility.id] = libraryFacility;
          }
        });
      }
    }

    return NextResponse.json(facilityStatus);
  } catch (error) {
    console.error("Error in unified API:", error);
    return NextResponse.json(
      { error: "Failed to fetch data" },
      { status: 500 }
    );
  }
} 