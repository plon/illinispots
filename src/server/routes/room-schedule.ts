import { Hono } from "hono";
import moment from "moment-timezone";
import { ServerConfigurationError } from "../config";
import { Sentry } from "../observability";
import {
  loadRoomSchedule,
  RoomScheduleDatabaseError,
  selectRelevantSchedule,
  type RoomScheduleQuery,
} from "../services/room-schedule";
import type { RoomScheduleBlock } from "../../types";

const CAMPUS_TIMEZONE = "America/Chicago";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface RoomScheduleRouteDependencies {
  loadRoomSchedule?: (
    query: RoomScheduleQuery,
  ) => Promise<RoomScheduleBlock[]>;
  now?: () => moment.Moment;
}

export function createRoomScheduleRoutes(
  dependencies: RoomScheduleRouteDependencies = {},
) {
  const loadSchedule = dependencies.loadRoomSchedule ?? loadRoomSchedule;
  const now = dependencies.now ?? (() => moment());

  return new Hono().get("/", async (context) => {
    context.header("Cache-Control", "no-store");

    const buildingId = context.req.query("buildingId");
    const roomNumber = context.req.query("roomNumber");
    const nowAtCampus = now().tz(CAMPUS_TIMEZONE);
    const date = context.req.query("date") ?? nowAtCampus.format("YYYY-MM-DD");
    const time = context.req.query("time");

    if (!buildingId || !roomNumber) {
      return context.json(
        { error: "Missing required parameters: buildingId and roomNumber" },
        400,
      );
    }

    if (!DATE_PATTERN.test(date)) {
      return context.json(
        { error: "Invalid date format. Use YYYY-MM-DD." },
        400,
      );
    }

    let target = nowAtCampus.clone();
    if (time) {
      const requestedTarget = moment.tz(`${date}T${time}`, CAMPUS_TIMEZONE);
      if (requestedTarget.isValid()) {
        target = requestedTarget;
      } else {
        console.warn("Invalid time parameter, using current time instead");
      }
    }

    try {
      const schedule = await loadSchedule({ buildingId, roomNumber, date });
      return context.json(selectRelevantSchedule(schedule, target));
    } catch (error) {
      if (error instanceof ServerConfigurationError) {
        Sentry.captureMessage("Missing Supabase environment variables", {
          level: "error",
          tags: { component: "api", route: "/api/room-schedule" },
        });
        console.error(error.message);
        return context.json({ error: "Server configuration error" }, 500);
      }

      if (error instanceof RoomScheduleDatabaseError) {
        return context.json({ error: error.message }, 500);
      }

      Sentry.captureException(error, {
        tags: { component: "api", route: "/api/room-schedule" },
      });
      console.error(
        `Error in /api/room-schedule for ${buildingId} - ${roomNumber}:`,
        error,
      );

      return context.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch room schedule",
        },
        500,
      );
    }
  });
}
