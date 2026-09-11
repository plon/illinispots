import { describe, expect, it } from "bun:test";
import { resolveSidebarScrollTarget } from "./sidebarScroll";

describe("resolveSidebarScrollTarget", () => {
  it("resets to the top when opening a facility from the list", () => {
    expect(resolveSidebarScrollTarget(null, "cif", 480)).toEqual({
      type: "reset",
    });
  });

  it("resets to the top when switching between facilities", () => {
    expect(resolveSidebarScrollTarget("cif", "grainger", 120)).toEqual({
      type: "reset",
    });
  });

  it("restores the saved offset when returning to the list", () => {
    expect(resolveSidebarScrollTarget("cif", null, 480)).toEqual({
      type: "restore",
      offset: 480,
    });
  });

  it("leaves scroll alone for list-to-list renders", () => {
    expect(resolveSidebarScrollTarget(null, null, 480)).toEqual({
      type: "none",
    });
  });
});
