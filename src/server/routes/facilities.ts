import { Hono } from "hono";
import { DateTime } from "luxon";
import {
  getFacilityStatus,
  type FacilityScope,
} from "../services/facilities";
import { Sentry } from "../observability";
import { parseCampusRequestDateTime } from "../time";
import { CAMPUS_TIMEZONE } from "../../utils/time";
const FACILITY_SCOPES = new Set<FacilityScope>([
  "academic",
  "library",
  "all",
]);

type GetFacilityStatus = typeof getFacilityStatus;

export interface FacilitiesRouteDependencies {
  getFacilityStatus?: GetFacilityStatus;
  now?: () => DateTime;
}

function resolveTargetMoment(
  date: string | undefined,
  time: string | undefined,
  now: () => DateTime,
): DateTime {
  if (date && time) {
    const target = parseCampusRequestDateTime(date, time);
    if (target.isValid) return target;
  }

  if (date || time) {
    console.warn(
      `Invalid date/time parameters received (date: ${date ?? null}, time: ${time ?? null}). Defaulting to current time.`,
    );
  }

  return now().setZone(CAMPUS_TIMEZONE);
}

export function createFacilitiesRoutes(
  dependencies: FacilitiesRouteDependencies = {},
) {
  const loadFacilities = dependencies.getFacilityStatus ?? getFacilityStatus;
  const now = dependencies.now ?? DateTime.now;

  return new Hono().get("/", async (context) => {
    context.header("Cache-Control", "no-store");

    const facilityType = context.req.query("type");
    if (facilityType && !FACILITY_SCOPES.has(facilityType as FacilityScope)) {
      return context.json(
        { error: 'Invalid type. Expected "academic", "library", or "all".' },
        400,
      );
    }

    const targetMoment = resolveTargetMoment(
      context.req.query("date"),
      context.req.query("time"),
      now,
    );

    try {
      const data = await loadFacilities(
        targetMoment,
        (facilityType as FacilityScope | undefined) ?? "all",
      );
      return context.json(data);
    } catch (error) {
      Sentry.captureException(error, {
        tags: { component: "api", route: "/api/facilities" },
      });
      console.error("Error in unified API:", error);

      return context.json(
        {
          error:
            error instanceof Error ? error.message : "Failed to fetch data",
        },
        500,
      );
    }
  });
}
