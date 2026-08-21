import { describe, expect, it } from "bun:test";
import { shouldTraceServerPath } from "./observability";

describe("server observability", () => {
  it("samples only dynamic API routes", () => {
    expect(shouldTraceServerPath("/api/facilities")).toBe(true);
    expect(shouldTraceServerPath("/api/room-schedule")).toBe(true);
    expect(shouldTraceServerPath("/api/health")).toBe(false);
    expect(shouldTraceServerPath("/api/facilities/details")).toBe(false);
    expect(shouldTraceServerPath("/api/facilities-probe")).toBe(false);
    expect(shouldTraceServerPath("/assets/index.js")).toBe(false);
  });
});
