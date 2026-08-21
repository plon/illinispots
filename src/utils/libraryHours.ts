import moment from "moment-timezone";
import { formatTime } from "./format";

export interface LibraryHours {
  [key: string]: {
    [day: string]: {
      open: string; // HH:mm
      close: string; // HH:mm
      nextDay?: boolean; // Indicates closing time is on the next calendar day
    };
  };
}

export const LIBRARY_HOURS: LibraryHours = {
  "Grainger Engineering Library": {
    Monday: { open: "08:00", close: "23:59" },
    Tuesday: { open: "08:00", close: "23:59" },
    Wednesday: { open: "08:00", close: "23:59" },
    Thursday: { open: "08:00", close: "23:59" },
    Friday: { open: "08:00", close: "23:00" },
    Saturday: { open: "10:00", close: "23:00" },
    Sunday: { open: "10:00", close: "23:59" },
  },
  "Funk ACES Library": {
    Monday: { open: "08:30", close: "02:00", nextDay: true },
    Tuesday: { open: "08:30", close: "02:00", nextDay: true },
    Wednesday: { open: "08:30", close: "02:00", nextDay: true },
    Thursday: { open: "08:30", close: "02:00", nextDay: true },
    Friday: { open: "08:30", close: "19:00" },
    Saturday: { open: "10:00", close: "21:00" },
    Sunday: { open: "13:00", close: "02:00", nextDay: true },
  },
  "Main Library": {
    Monday: { open: "09:15", close: "21:30" },
    Tuesday: { open: "09:15", close: "21:30" },
    Wednesday: { open: "09:15", close: "21:30" },
    Thursday: { open: "09:15", close: "21:30" },
    Friday: { open: "09:15", close: "17:30" },
    Saturday: { open: "13:15", close: "16:30" },
    Sunday: { open: "13:15", close: "21:30" },
  },
};

export interface ActiveLibraryHours {
  open: moment.Moment;
  close: moment.Moment;
}

/**
 * Resolves the opening interval containing the requested time. Checking the
 * previous calendar day is necessary for schedules that close after midnight.
 */
export const getActiveLibraryHours = (
  libraryName: string,
  dateTimeToCheck?: moment.Moment,
): ActiveLibraryHours | null => {
  const timezone = "America/Chicago";
  const targetMoment = (dateTimeToCheck ?? moment()).clone().tz(timezone);

  for (const dayOffset of [0, -1]) {
    const scheduleDate = targetMoment
      .clone()
      .add(dayOffset, "day")
      .startOf("day");
    const dayOfWeek = scheduleDate.format("dddd");
    const hours = LIBRARY_HOURS[libraryName]?.[dayOfWeek];
    if (!hours) continue;

    const open = moment.tz(
      `${scheduleDate.format("YYYY-MM-DD")} ${hours.open}`,
      "YYYY-MM-DD HH:mm",
      timezone,
    );
    const close = moment.tz(
      `${scheduleDate.format("YYYY-MM-DD")} ${hours.close}`,
      "YYYY-MM-DD HH:mm",
      timezone,
    );

    if (hours.nextDay) {
      close.add(1, "day");
    }

    if (
      open.isValid() &&
      close.isValid() &&
      targetMoment.isSameOrAfter(open) &&
      targetMoment.isBefore(close)
    ) {
      return { open, close };
    }
  }

  return null;
};

/**
 * Checks if a library is considered "open" for reservations at a specific date and time.
 * @param libraryName The name of the library.
 * @param dateTimeToCheck Optional moment object for the date/time to check. Defaults to now.
 * @returns True if the library is open at the specified time, false otherwise.
 */
export const isLibraryOpen = (
  libraryName: string,
  dateTimeToCheck?: moment.Moment,
): boolean => getActiveLibraryHours(libraryName, dateTimeToCheck) !== null;

/**
 * Gets a message describing the library's hours for a given day.
 * Note: This shows the hours for the *day* of the week, not whether it's open *now*.
 * @param libraryName The name of the library.
 * @param dateForDay Optional moment object to determine the day of the week. Defaults to today.
 * @returns A string describing the hours or indicating they aren't available.
 */
export const getLibraryHoursMessage = (
  libraryName: string,
  dateForDay?: moment.Moment,
): string => {
  const targetMoment = (dateForDay || moment()).tz("America/Chicago");
  const dayOfWeek = targetMoment.format("dddd");
  const hours = LIBRARY_HOURS[libraryName]?.[dayOfWeek];

  if (!hours) return "Hours not available for this day";

  const openFormatted = formatTime(hours.open); // formatTime expects HH:mm or HH:mm:ss
  const closeFormatted = formatTime(hours.close);

  return `Reservable hours for ${dayOfWeek}: ${openFormatted} - ${closeFormatted}${hours.nextDay ? " (next day)" : ""}`;
};
