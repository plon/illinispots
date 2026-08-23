import { formatTime } from "./format";

export interface LibraryHours {
  [key: string]: {
    [day: string]: {
      open: string; // HH:mm
      close: string; // HH:mm
      nextDay?: boolean; // closing time is on the next calendar day
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

const CAMPUS_WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  weekday: "long",
});

/** Describe one calendar day's reservable hours without loading date libraries. */
export function getLibraryHoursMessage(
  libraryName: string,
  dateForDay = new Date(),
): string {
  const dayOfWeek = CAMPUS_WEEKDAY_FORMATTER.format(dateForDay);
  const hours = LIBRARY_HOURS[libraryName]?.[dayOfWeek];

  if (!hours) return "Hours not available for this day";

  return `Reservable hours for ${dayOfWeek}: ${formatTime(hours.open)} - ${formatTime(hours.close)}${hours.nextDay ? " (next day)" : ""}`;
}
