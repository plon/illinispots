export const CAMPUS_TIMEZONE = "America/Chicago";

const CAMPUS_CLOCK_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: CAMPUS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export interface CampusClock {
  date: string;
  time: string;
  hour: number;
  minute: number;
}

/** Returns campus wall-clock fields for an absolute instant. */
export function getCampusClock(date = new Date()): CampusClock {
  let year = "";
  let month = "";
  let day = "";
  let hour = "";
  let minute = "";
  let second = "";

  for (const part of CAMPUS_CLOCK_FORMATTER.formatToParts(date)) {
    if (part.type === "year") year = part.value;
    if (part.type === "month") month = part.value;
    if (part.type === "day") day = part.value;
    if (part.type === "hour") hour = part.value;
    if (part.type === "minute") minute = part.value;
    if (part.type === "second") second = part.value;
  }

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}:${second}`,
    hour: Number(hour),
    minute: Number(minute),
  };
}
