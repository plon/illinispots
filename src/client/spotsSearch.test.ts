import { describe, expect, it } from "bun:test";
import { validateSpotsSearch } from "./spotsSearch";

describe("validateSpotsSearch", () => {
  it("normalizes supported search parameters", () => {
    expect(
      validateSpotsSearch({
        facility: " eceb ",
        room: " 3017 ",
        date: "2026-09-17",
        time: "4:05:00",
        minDuration: "60",
        freeUntil: "16:30:00",
        q: " outlets ",
        ignored: "value",
      }),
    ).toEqual({
      facility: "eceb",
      room: "3017",
      date: "2026-09-17",
      time: "04:05",
      minDuration: 60,
      freeUntil: "16:30",
      q: " outlets ",
    });
  });

  it("preserves spaces while a search query is being typed", () => {
    expect(validateSpotsSearch({ q: "civil engineering " }).q).toBe(
      "civil engineering ",
    );
  });

  it("keeps numeric room identifiers and search text", () => {
    expect(
      validateSpotsSearch({ facility: "Armory", room: 100, q: 10 }),
    ).toMatchObject({ room: "100", q: "10" });
  });

  it("normalizes second-bearing times instead of dropping the selection", () => {
    expect(
      validateSpotsSearch({ date: "2026-09-17", time: "14:30:30" }),
    ).toMatchObject({ date: "2026-09-17", time: "14:30" });
  });

  it("requires a complete, valid date and time pair", () => {
    expect(
      validateSpotsSearch({ date: "2026-02-29", time: "14:30" }),
    ).toEqual({
      facility: undefined,
      room: undefined,
      date: undefined,
      time: undefined,
      minDuration: undefined,
      freeUntil: undefined,
      q: undefined,
    });
    expect(validateSpotsSearch({ date: "2026-09-17" }).date).toBeUndefined();
    expect(validateSpotsSearch({ time: "14:30" }).time).toBeUndefined();
  });

  it("rejects invalid filters and rooms without a facility", () => {
    const result = validateSpotsSearch({
      room: "3017",
      minDuration: 0,
      freeUntil: "24:00",
    });

    expect(result.room).toBeUndefined();
    expect(result.minDuration).toBeUndefined();
    expect(result.freeUntil).toBeUndefined();
  });
});
