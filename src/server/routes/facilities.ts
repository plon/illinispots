import { Hono } from "hono";
import moment from "moment-timezone";
import {
  getFacilityStatus,
  type FacilityScope,
} from "../services/facilities";
import { Sentry } from "../observability";

const CAMPUS_TIMEZONE = "America/Chicago";
const FACILITY_SCOPES = new Set<FacilityScope>([
  "academic",
  "library",
  "all",
]);

type GetFacilityStatus = typeof getFacilityStatus;

export interface FacilitiesRouteDependencies {
  getFacilityStatus?: GetFacilityStatus;
  now?: () => moment.Moment;
}

function resolveTargetMoment(
  date: string | undefined,
  time: string | undefined,
  now: () => moment.Moment,
): moment.Moment {
  const value = date && time ? `${date} ${time}` : undefined;

  if (value) {
    const parsed = moment.tz(
      value,
      "YYYY-MM-DD HH:mm:ss",
      true,
      CAMPUS_TIMEZONE,
    );
    if (parsed.isValid()) return parsed;
  }

  if (date || time) {
    console.warn(
      `Invalid date/time parameters received (date: ${date ?? null}, time: ${time ?? null}). Defaulting to current time.`,
    );
  }

  return now().tz(CAMPUS_TIMEZONE);
}

export function createFacilitiesRoutes(
  dependencies: FacilitiesRouteDependencies = {},
) {
  const loadFacilities = dependencies.getFacilityStatus ?? getFacilityStatus;
  const now = dependencies.now ?? (() => moment());

  return new Hono().get("/", async (context) => {
    context.header("Cache-Control", "no-store");

    const query = context.req.query();
    const facilityType = query.type;
    if (facilityType && !FACILITY_SCOPES.has(facilityType as FacilityScope)) {
      return context.json(
        { error: 'Invalid type. Expected "academic", "library", or "all".' },
        400,
      );
    }

    const targetMoment = resolveTargetMoment(
      query.date,
      query.time,
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
