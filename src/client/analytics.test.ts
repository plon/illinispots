import { describe, expect, it, mock } from "bun:test";
import { createBufferedAnalyticsClient } from "./analytics";

describe("createBufferedAnalyticsClient", () => {
  it("forwards captures queued before PostHog loads", () => {
    const analytics = createBufferedAnalyticsClient();
    const capture = mock(() => undefined);

    analytics.client.capture("facility_selected", { facilityId: "bif" });
    analytics.connect(capture);
    analytics.client.capture("room_schedule_viewed", { roomId: "1404" });

    expect(capture).toHaveBeenCalledTimes(2);
    expect(capture).toHaveBeenNthCalledWith(1, "facility_selected", {
      facilityId: "bif",
    });
    expect(capture).toHaveBeenNthCalledWith(2, "room_schedule_viewed", {
      roomId: "1404",
    });
  });

  it("drops queued and future captures when analytics is disabled", () => {
    const analytics = createBufferedAnalyticsClient();
    const capture = mock(() => undefined);

    analytics.client.capture("facility_selected");
    analytics.disable();
    analytics.connect(capture);
    analytics.client.capture("room_schedule_viewed");

    expect(capture).not.toHaveBeenCalled();
  });
});
