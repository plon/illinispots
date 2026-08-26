import { describe, expect, test } from "bun:test";
import { parseNaturalLanguageSearch } from "@/utils/naturalLanguageSearch";

const WEDNESDAY_NOON_CAMPUS = new Date("2026-08-26T17:00:00.000Z");

describe("parseNaturalLanguageSearch", () => {
  test("leaves ordinary building and room searches unchanged", () => {
    expect(
      parseNaturalLanguageSearch("eceb 1102", WEDNESDAY_NOON_CAMPUS),
    ).toEqual({
      locationQuery: "eceb 1102",
      temporalText: null,
      dateTime: null,
      error: null,
    });
  });

  test("parses a relative duration from campus time", () => {
    expect(
      parseNaturalLanguageSearch(
        "siebel in 2 hours",
        WEDNESDAY_NOON_CAMPUS,
      ),
    ).toEqual({
      locationQuery: "siebel",
      temporalText: "in 2 hours",
      dateTime: { date: "2026-08-26", time: "14:00:00" },
      error: null,
    });
  });

  test("parses tomorrow with an explicit time", () => {
    expect(
      parseNaturalLanguageSearch(
        "eceb tomorrow at 2:30 pm",
        WEDNESDAY_NOON_CAMPUS,
      ),
    ).toEqual({
      locationQuery: "eceb",
      temporalText: "tomorrow at 2:30 pm",
      dateTime: { date: "2026-08-27", time: "14:30:00" },
      error: null,
    });
  });

  test("uses the upcoming weekday and preserves the room number", () => {
    expect(
      parseNaturalLanguageSearch(
        "eceb 1102 friday at 11 am",
        WEDNESDAY_NOON_CAMPUS,
      ),
    ).toEqual({
      locationQuery: "eceb 1102",
      temporalText: "friday at 11 am",
      dateTime: { date: "2026-08-28", time: "11:00:00" },
      error: null,
    });
  });

  test("uses the current campus time when only a date is provided", () => {
    const reference = new Date("2026-08-26T17:42:35.000Z");
    expect(parseNaturalLanguageSearch("dcl tomorrow", reference).dateTime).toEqual(
      { date: "2026-08-27", time: "12:42:00" },
    );
  });

  test("rejects ambiguous twelve-hour times", () => {
    expect(
      parseNaturalLanguageSearch("eceb tomorrow at 2", WEDNESDAY_NOON_CAMPUS),
    ).toMatchObject({
      locationQuery: "eceb",
      temporalText: "tomorrow at 2",
      dateTime: null,
      error: "ambiguous-time",
    });
  });

  test("allows a date and time without a building or room", () => {
    expect(
      parseNaturalLanguageSearch("tomorrow at 2 pm", WEDNESDAY_NOON_CAMPUS),
    ).toEqual({
      locationQuery: "",
      temporalText: "tomorrow at 2 pm",
      dateTime: { date: "2026-08-27", time: "14:00:00" },
      error: null,
    });
  });

  test("preserves elapsed relative time across the spring DST transition", () => {
    const beforeSpringForward = new Date("2026-03-08T07:30:00.000Z");
    expect(
      parseNaturalLanguageSearch(
        "siebel in 2 hours",
        beforeSpringForward,
      ).dateTime,
    ).toEqual({ date: "2026-03-08", time: "04:30:00" });
  });
});
