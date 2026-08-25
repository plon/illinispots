import { DateTime } from "luxon";
import { LIBRARY_HOURS } from "../../utils/libraryHours";
import { CAMPUS_TIMEZONE } from "../../utils/time";

export interface ActiveLibraryHours {
  open: DateTime<boolean>;
  close: DateTime<boolean>;
}

export function getActiveLibraryHours(
  libraryName: string,
  dateTimeToCheck: DateTime<boolean> = DateTime.now(),
): ActiveLibraryHours | null {
  const target = dateTimeToCheck.setZone(CAMPUS_TIMEZONE);

  for (const dayOffset of [0, -1]) {
    const scheduleDate = target.plus({ days: dayOffset }).startOf("day");
    const hours = LIBRARY_HOURS[libraryName]?.[scheduleDate.weekdayLong ?? ""];
    if (!hours) continue;

    const open = DateTime.fromFormat(
      `${scheduleDate.toFormat("yyyy-MM-dd")} ${hours.open}`,
      "yyyy-MM-dd HH:mm",
      { zone: CAMPUS_TIMEZONE },
    );
    let close = DateTime.fromFormat(
      `${scheduleDate.toFormat("yyyy-MM-dd")} ${hours.close}`,
      "yyyy-MM-dd HH:mm",
      { zone: CAMPUS_TIMEZONE },
    );
    if (hours.nextDay) close = close.plus({ days: 1 });

    if (open.isValid && close.isValid && target >= open && target < close) {
      return { open, close };
    }
  }

  return null;
}

export function isLibraryOpen(
  libraryName: string,
  dateTimeToCheck: DateTime<boolean> = DateTime.now(),
): boolean {
  return getActiveLibraryHours(libraryName, dateTimeToCheck) !== null;
}
