import { NextResponse } from "next/server";
import axios from "axios";
import moment from "moment-timezone";
import {
  Libraries,
  StudyRoom,
  TimeSlot,
  RoomReservations,
  FormattedLibraryData,
  APIResponse,
  ReservationResponse,
  RegexGroups,
} from "@/types";

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

function decodeUnicodeEscapes(text: string): string {
  return JSON.parse(`"${text}"`);
}

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
      title: decodeUnicodeEscapes(groups.title),
      url,
      eid: parseInt(groups.eid),
      lid: parseInt(groups.lid),
      grouping: decodeUnicodeEscapes(groups.grouping),
      thumbnail,
    });
  }
  return resources;
}

async function getReservation(lid: string): Promise<ReservationResponse> {
  const url = "https://uiuc.libcal.com/spaces/availability/grid";

  const todayCST = moment().tz("America/Chicago");
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
      { headers },
    );
    const reservationsTomorrow = responseTomorrow.data as ReservationResponse;

    return {
      slots: [...reservationsToday.slots, ...reservationsTomorrow.slots],
    };
  }

  return reservationsToday;
}

function linkRoomsReservations(
  roomsData: StudyRoom[],
  reservationsData: ReservationResponse,
): RoomReservations {
  const roomReservations: RoomReservations = {};
  const libraryIds = new Set(
    Object.values(libraries).map((lib) => parseInt(lib.id)),
  );
  const todayCST = moment().tz("America/Chicago");
  const currentTime = todayCST.format("HH:mm:ss");

  for (const room of roomsData) {
    if (!libraryIds.has(room.lid)) continue;

    const roomId = room.eid;
    const roomSlots: TimeSlot[] = [];
    let nextAvailable: string | null = null;
    let available_duration: number = 0;
    let isCurrentlyBooked = false;

    // Sort slots chronologically
    const roomSpecificSlots = reservationsData.slots
      .filter((slot) => slot.itemId === roomId)
      .sort((a, b) => moment(a.start).valueOf() - moment(b.start).valueOf());

    // Process all slots for the day
    for (const slot of roomSpecificSlots) {
      const startTime = moment.tz(slot.start, "America/Chicago");
      const endTime = moment.tz(slot.end, "America/Chicago");
      const slotStartTime = startTime.format("HH:mm:ss");
      const slotEndTime = endTime.format("HH:mm:ss");
      const isAvailable = slot.className !== "s-lc-eq-checkout";

      // Add all slots for today (and early morning next day for Funk ACES)
      if (
        startTime.isSame(todayCST, "day") ||
        (room.lid === 3604 &&
          startTime.clone().subtract(1, "day").isSame(todayCST, "day") &&
          startTime.hour() < 2)
      ) {
        roomSlots.push({
          start: slotStartTime,
          end: slotEndTime,
          available: isAvailable,
        });
      }

      // Check current availability and calculate duration separately
      if (slotStartTime <= currentTime && slotEndTime > currentTime) {
        isCurrentlyBooked = !isAvailable;
        if (isAvailable) {
          available_duration = endTime.diff(todayCST, "minutes");
        }
      }
    }

    // Calculate next available time if currently booked
    if (isCurrentlyBooked) {
      for (const slot of roomSpecificSlots) {
        const startTime = moment.tz(slot.start, "America/Chicago");
        const isAvailable = slot.className !== "s-lc-eq-checkout";

        if (isAvailable && startTime.isAfter(todayCST)) {
          nextAvailable = startTime.format("HH:mm:ss");
          break;
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
      nextAvailable,
      available_duration,
    };
  }

  return roomReservations;
}

async function getFormattedLibraryData(): Promise<FormattedLibraryData> {
  const response = await axios.get("https://uiuc.libcal.com/allspaces", {
    headers: USER_AGENT,
  });
  const roomsData = extractStudyRooms(response.data);

  const libraryPromises = Object.entries(libraries).map(
    async ([libraryName, libraryInfo]) => {
      const reservationsData = await getReservation(libraryInfo.id);
      const roomReservations = linkRoomsReservations(
        roomsData,
        reservationsData,
      );

      const libraryRooms: RoomReservations = {};
      let availableCount = 0;
      const currentTime = moment().tz("America/Chicago");
      const currentTimeStr = currentTime.format("HH:mm:ss");

      for (const [roomTitle, data] of Object.entries(roomReservations)) {
        if (data.lid === parseInt(libraryInfo.id)) {
          libraryRooms[roomTitle] = data;

          // Check if room is currently available
          const isAvailable = data.slots.some((slot) => {
            return (
              slot.available &&
              slot.start <= currentTimeStr &&
              slot.end > currentTimeStr
            );
          });

          if (isAvailable) {
            availableCount++;
          }
        }
      }

      return [
        libraryName,
        {
          room_count: Object.keys(libraryRooms).length,
          currently_available: availableCount,
          rooms: libraryRooms,
          address: libraryInfo.address,
        },
      ] as const;
    },
  );

  const results = await Promise.all(libraryPromises);
  return Object.fromEntries(results);
}

export async function GET(): Promise<
  NextResponse<APIResponse | { error: string }>
> {
  try {
    const libraryData = await getFormattedLibraryData();
    return NextResponse.json({
      timezone: "America/Chicago",
      current_time: moment().tz("America/Chicago").format(),
      data: libraryData,
    });
  } catch (error) {
    console.error("Error fetching library data:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
