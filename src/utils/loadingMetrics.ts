import * as Sentry from "@sentry/nextjs";

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
    Sentry.metrics.distribution(
      "ui.initial_load.duration",
      performance.now(),
      {
        unit: "millisecond",
        attributes: {
          milestone,
          map_enabled: mapEnabled,
        },
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
    Sentry.metrics.distribution("ui.map.load.duration", duration, {
      unit: "millisecond",
      attributes: {
        result,
        initial_load: initialLoad,
      },
    });

    if (result !== "success") {
      Sentry.metrics.count("ui.map.load.failure", 1, {
        attributes: {
          reason: result,
          initial_load: initialLoad,
        },
      });
    }
  } catch (error) {
    console.warn("Failed to record map-load metric:", error);
  }
}
