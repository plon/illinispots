if (typeof document !== "undefined" && !("getElementsByTagName" in document)) {
  Object.defineProperty(document, "getElementsByTagName", {
    value: () => [],
    configurable: true,
  });
}

import { describe, expect, it } from "bun:test";
import { router } from "./router";

describe("router configuration", () => {
  it("disables router scroll restoration to prevent element scroll sharing across navigations", () => {
    // TanStack Router's scroll restoration tracks element-level scrolling across routes
    // and copies non-window scroll positions to new destinations. In this full-height app,
    // scrollRestoration must remain false so each facility view controls its own scroll position.
    expect(router.options.scrollRestoration).toBe(false);
  });
});
