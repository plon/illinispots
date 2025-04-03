import moment from "moment-timezone";

export interface LibraryHours {
  [key: string]: {
    [day: string]: {
      open: string;
      close: string;
      nextDay?: boolean;
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

export const isLibraryOpen = (libraryName: string): boolean => {
  const now = moment().tz("America/Chicago");
  const currentTime = now.format("HH:mm");
  const dayOfWeek = now.format("dddd");

  const hours = LIBRARY_HOURS[libraryName]?.[dayOfWeek];
  if (!hours) return false;

  // Get previous day's hours to check if library is still open from previous day (Funk ACES case)
  const previousDay = moment().tz("America/Chicago").subtract(1, "day");
  const previousDayOfWeek = previousDay.format("dddd");
  const previousHours = LIBRARY_HOURS[libraryName]?.[previousDayOfWeek];

  // Check if we're in the early hours of the current day and the previous day's hours extend to today
  if (previousHours?.nextDay && currentTime <= previousHours.close) {
    return true;
  }

  const { open, close, nextDay } = hours;

  if (nextDay) {
    // If library closes after midnight
    if (currentTime >= open) {
      return true;
    }
  } else {
    // Normal same-day hours
    if (currentTime >= open && currentTime <= close) {
      return true;
    }
  }

  return false;
};

export const getLibraryHoursMessage = (libraryName: string): string => {
  const now = moment().tz("America/Chicago");
  const dayOfWeek = now.format("dddd");
  const hours = LIBRARY_HOURS[libraryName]?.[dayOfWeek];

  if (!hours) return "Hours not available";

  return `Today's reservable space hours: ${hours.open} - ${hours.close}${hours.nextDay ? " (next day)" : ""}`;
};
