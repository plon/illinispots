import * as chrono from "chrono-node/en";
import { format } from "date-fns";
import { TZDate, tzOffset } from "@date-fns/tz";
import {
  CAMPUS_TIMEZONE,
  type CampusDateTime,
} from "@/utils/time";

export type NaturalLanguageSearchError =
  | "ambiguous-time"
  | "multiple-date-times";

export interface NaturalLanguageSearchResult {
  locationQuery: string;
  temporalText: string | null;
  dateTime: CampusDateTime | null;
  error: NaturalLanguageSearchError | null;
}

function removeMatchedText(
  query: string,
  matches: Array<{ index: number; text: string }>,
): string {
  let locationQuery = query;

  for (const match of [...matches].sort((a, b) => b.index - a.index)) {
    locationQuery =
      locationQuery.slice(0, match.index) +
      locationQuery.slice(match.index + match.text.length);
  }

  return locationQuery
    .replace(/^[\s,;|-]+|[\s,;|-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseNaturalLanguageSearch(
  query: string,
  referenceInstant: Date = new Date(),
): NaturalLanguageSearchResult {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return {
      locationQuery: "",
      temporalText: null,
      dateTime: null,
      error: null,
    };
  }

  const campusReference = TZDate.tz(CAMPUS_TIMEZONE, referenceInstant);
  const matches = chrono.parse(
    normalizedQuery,
    {
      instant: referenceInstant,
      timezone: tzOffset(CAMPUS_TIMEZONE, referenceInstant),
    },
    { forwardDate: true },
  );

  if (matches.length === 0) {
    return {
      locationQuery: normalizedQuery,
      temporalText: null,
      dateTime: null,
      error: null,
    };
  }

  const locationQuery = removeMatchedText(normalizedQuery, matches);
  const temporalText = matches.map((match) => match.text).join(", ");

  if (matches.length > 1) {
    return {
      locationQuery,
      temporalText,
      dateTime: null,
      error: "multiple-date-times",
    };
  }

  const match = matches[0];
  const hasExplicitHour = match.start.isCertain("hour");
  const hour = match.start.get("hour");
  if (
    hasExplicitHour &&
    hour !== null &&
    hour >= 1 &&
    hour <= 12 &&
    !match.start.isCertain("meridiem")
  ) {
    return {
      locationQuery,
      temporalText,
      dateTime: null,
      error: "ambiguous-time",
    };
  }

  let target: TZDate;
  if (match.start.isCertain("timezoneOffset")) {
    // Rebuilding relative durations from wall-clock parts loses time at DST boundaries.
    target = TZDate.tz(CAMPUS_TIMEZONE, match.start.date());
  } else {
    target = TZDate.tz(
      CAMPUS_TIMEZONE,
      match.start.get("year") ?? campusReference.getFullYear(),
      (match.start.get("month") ?? campusReference.getMonth() + 1) - 1,
      match.start.get("day") ?? campusReference.getDate(),
      hasExplicitHour
        ? (match.start.get("hour") ?? campusReference.getHours())
        : campusReference.getHours(),
      hasExplicitHour
        ? (match.start.get("minute") ?? 0)
        : campusReference.getMinutes(),
      0,
    );
  }

  if (Number.isNaN(target.getTime())) {
    return {
      locationQuery,
      temporalText,
      dateTime: null,
      error: "multiple-date-times",
    };
  }

  return {
    locationQuery,
    temporalText,
    dateTime: {
      date: format(target, "yyyy-MM-dd"),
      time: format(target, "HH:mm':00'"),
    },
    error: null,
  };
}
