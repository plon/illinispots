import { describe, expect, it } from "bun:test";
import {
  markFacilityOpen,
  markRoomOpen,
  markSameViewPush,
} from "./spotsHistory";

describe("spots history markers", () => {
  it("tracks how far a nested view is from its list and facility parents", () => {
    const facility = markFacilityOpen(undefined, false);
    const room = markRoomOpen(facility, false);

    expect(facility).toEqual({ facilityBackSteps: 1 });
    expect(room).toEqual({ facilityBackSteps: 2, roomBackSteps: 1 });
  });

  it("replaces sibling views without changing their parent distance", () => {
    const room = { facilityBackSteps: 2, roomBackSteps: 1 };

    expect(markFacilityOpen(room, true)).toEqual({ facilityBackSteps: 2 });
    expect(markRoomOpen(room, true)).toEqual(room);
    expect(markFacilityOpen(undefined, true)).toBeUndefined();
    expect(markRoomOpen(undefined, true)).toBeUndefined();
  });

  it("accounts for new entries added while a nested view stays open", () => {
    expect(
      markSameViewPush({ facilityBackSteps: 2, roomBackSteps: 1 }),
    ).toEqual({ facilityBackSteps: 3, roomBackSteps: 2 });
    expect(markSameViewPush(undefined)).toBeUndefined();
  });
});
