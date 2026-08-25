import { DateTime } from "luxon";
import { CAMPUS_TIMEZONE } from "../utils/time";

export function parseCampusTimestamp(value: string): DateTime {
  const sql = DateTime.fromSQL(value, { zone: CAMPUS_TIMEZONE });
  if (sql.isValid) return sql;

  return DateTime.fromISO(value, { zone: CAMPUS_TIMEZONE }).setZone(
    CAMPUS_TIMEZONE,
  );
}

export function parseCampusRequestDateTime(
  date: string,
  time: string,
): DateTime {
  return DateTime.fromFormat(`${date} ${time}`, "yyyy-MM-dd HH:mm:ss", {
    zone: CAMPUS_TIMEZONE,
  });
}

export function wholeMinutesBetween(end: DateTime, start: DateTime): number {
  return Math.trunc(end.diff(start, "minutes").minutes);
}
