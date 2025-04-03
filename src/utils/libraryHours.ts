import moment from "moment-timezone";
import { formatTime } from "@/utils/format";

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

/**
 * Checks if a library is considered "open" for reservations at a specific date and time.
 * @param libraryName The name of the library.
 * @param dateTimeToCheck Optional moment object for the date/time to check. Defaults to now.
 * @returns True if the library is open at the specified time, false otherwise.
 */
export const isLibraryOpen = (
  libraryName: string,
  dateTimeToCheck?: moment.Moment,
): boolean => {
  const targetMoment = (dateTimeToCheck || moment()).tz("America/Chicago");
  const targetTime = targetMoment.format("HH:mm"); // Compare HH:mm
  const targetDayOfWeek = targetMoment.format("dddd"); // Monday, Tuesday, etc.

  const hours = LIBRARY_HOURS[libraryName]?.[targetDayOfWeek];

  // If no hours defined for this day, it's closed.
  if (!hours) return false;

  const { open, close, nextDay } = hours;

  // --- Check against the hours for the targetMoment's day ---
  if (nextDay) {
    // Scenario 1: Opens today, closes after midnight tomorrow.
    // Is the target time between today's open time and midnight?
    if (targetTime >= open) {
      return true; // Open from open time until midnight
    }
    // Note: The case where targetTime is *after* midnight but *before* the close time
    // will be handled by checking the *previous* day's hours below.
  } else {
    // Scenario 2: Opens today, closes today (before midnight).
    // Is the target time between open and close? (Exclusive of close time)
    if (targetTime >= open && targetTime < close) {
      return true;
    }
  }

  // --- Check if we are currently within the hours of the *previous* day that extended past midnight ---
  const previousDayMoment = targetMoment.clone().subtract(1, "day");
  const previousDayOfWeek = previousDayMoment.format("dddd");
  const previousHours = LIBRARY_HOURS[libraryName]?.[previousDayOfWeek];

  if (previousHours?.nextDay) {
    // Scenario 3: Previous day opened and closed after midnight (on the targetMoment's calendar day).
    // Is the target time *before* the previous day's closing time? (Exclusive of close time)
    if (targetTime < previousHours.close) {
      return true;
    }
  }

  // If none of the above conditions met, the library is closed at the target time.
  return false;
};

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

