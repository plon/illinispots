import { describe, expect, test } from "bun:test";
import {
  getAccordionChildId,
  getFacilityAccordionId,
  getUpdatedAccordionItems,
} from "@/utils/accordion";

describe("accordion state", () => {
  test("supports hyphenated facility IDs", () => {
    const siebel = getFacilityAccordionId("building", "siebel-cs");
    const cif = getFacilityAccordionId("building", "cif");

    expect(getUpdatedAccordionItems(siebel, [cif])).toEqual([siebel]);
  });

  test("removes hidden child state when switching facilities", () => {
    const siebel = getFacilityAccordionId("building", "siebel-cs");
    const cif = getFacilityAccordionId("building", "cif");
    const cifAvailable = getAccordionChildId(cif, "group", "available");
    const cifRoom = getAccordionChildId(cif, "group", "available", "room", "0027");

    expect(
      getUpdatedAccordionItems(siebel, [cif, cifAvailable, cifRoom]),
    ).toEqual([siebel]);
  });

  test("keeps the other facility group open", () => {
    const mainLibrary = getFacilityAccordionId("library", "main-library");
    const libraryRoom = getAccordionChildId(
      mainLibrary,
      "room",
      "Orange Room: 1",
    );
    const cif = getFacilityAccordionId("building", "cif");

    expect(
      getUpdatedAccordionItems(cif, [mainLibrary, libraryRoom]),
    ).toEqual([mainLibrary, libraryRoom, cif]);
  });

  test("preserves child state when its own facility is simply collapsed", () => {
    const cif = getFacilityAccordionId("building", "cif");
    const room = getAccordionChildId(cif, "group", "available", "room", "0027");

    expect(getUpdatedAccordionItems(cif, [cif, room])).toEqual([room]);
  });
});
