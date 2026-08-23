import {
  recordClientCount,
  recordClientDistribution,
} from "@/client/observability";

export type InitialLoadMilestone =
  | "academic_data_ready"
  | "library_data_ready"
  | "content_ready"
  | "loading_screen_exited"
  | "map_ready";

export type MapLoadResult =
  | "success"
  | "missing_configuration"
  | "initialization_error"
  | "load_error";

export function recordInitialLoadMilestone(
  milestone: InitialLoadMilestone,
  mapEnabled: boolean,
): void {
  if (typeof performance === "undefined") return;

  try {
    recordClientDistribution(
      "ui.initial_load.duration",
      performance.now(),
      {
        milestone,
        map_enabled: mapEnabled,
      },
    );
  } catch (error) {
    console.warn("Failed to record initial-load metric:", error);
  }
}

export function recordMapLoadDuration(
  duration: number,
  result: MapLoadResult,
  initialLoad: boolean,
): void {
  try {
    recordClientDistribution("ui.map.load.duration", duration, {
      result,
      initial_load: initialLoad,
    });

    if (result !== "success") {
      recordClientCount("ui.map.load.failure", 1, {
        reason: result,
        initial_load: initialLoad,
      });
    }
  } catch (error) {
    console.warn("Failed to record map-load metric:", error);
  }
}
