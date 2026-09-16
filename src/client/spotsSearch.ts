import { addDateDays, formatMinutesAsTime, parseTimeToMinutes } from "@/utils/time";

export interface SpotsSearch {
  facility?: string;
  room?: string;
  date?: string;
  time?: string;
  minDuration?: number;
  freeUntil?: string;
  q?: string;
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string") {return value;}
  if (typeof value === "number" && Number.isFinite(value)) {return String(value);}
  return undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  const text = textValue(value);
  if (text === undefined) {return undefined;}
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function searchText(value: unknown): string | undefined {
  const text = textValue(value);
  return text !== undefined && text.trim().length > 0
    ? text
    : undefined;
}

function normalizedTime(value: unknown): string | undefined {
  const raw = nonEmptyString(value);
  if (!raw) {return undefined;}
  const minutes = parseTimeToMinutes(raw);
  if (minutes === null || minutes >= 24 * 60) {
    return undefined;
  }
  return formatMinutesAsTime(minutes).slice(0, 5);
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function validateSpotsSearch(
  search: Record<string, unknown>,
): SpotsSearch {
  const facility = nonEmptyString(search.facility);
  const date = nonEmptyString(search.date);
  const time = normalizedTime(search.time);
  const hasValidDateTime =
    date !== undefined && addDateDays(date, 0) !== null && time !== undefined;

  return {
    facility,
    room: facility ? nonEmptyString(search.room) : undefined,
    date: hasValidDateTime ? date : undefined,
    time: hasValidDateTime ? time : undefined,
    minDuration: positiveInteger(search.minDuration),
    freeUntil: normalizedTime(search.freeUntil),
    q: searchText(search.q),
  };
}
