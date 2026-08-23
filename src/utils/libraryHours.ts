import moment from "moment-timezone";
import { LIBRARY_HOURS } from "./libraryHoursData";

export {
  getLibraryHoursMessage,
  LIBRARY_HOURS,
  type LibraryHours,
} from "./libraryHoursData";

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
