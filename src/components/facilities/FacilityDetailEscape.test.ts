import { describe, expect, it } from "bun:test";
import { shouldIgnoreEscapeForBack } from "./FacilityDetailPage";

const matchingTarget = () => ({
  closest: () => ({}),
});

describe("shouldIgnoreEscapeForBack", () => {
  it("ignores Escape from text inputs so room filtering keeps focus", () => {
    expect(shouldIgnoreEscapeForBack(matchingTarget())).toBe(true);
  });

  it("allows Escape from ordinary content to go back", () => {
    expect(shouldIgnoreEscapeForBack({ closest: () => null })).toBe(false);
    expect(shouldIgnoreEscapeForBack(null)).toBe(false);
    expect(shouldIgnoreEscapeForBack(undefined)).toBe(false);
  });

  it("checks inputs, dialogs, and menus in one query", () => {
    let observedQuery = "";
    const target = {
      closest: (query: string) => {
        observedQuery = query;
        return null;
      },
    };
    shouldIgnoreEscapeForBack(target);
    expect(observedQuery).toContain("input");
    expect(observedQuery).toContain('[role="dialog"]');
    expect(observedQuery).toContain('[role="menu"]');
  });
});
