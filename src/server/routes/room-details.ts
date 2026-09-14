import { Hono } from "hono";
import { ServerConfigurationError } from "../config";
import { Sentry } from "../observability";
import {
  loadRoomDetails,
  RoomDetailsDatabaseError,
  type RoomDetailsQuery,
} from "../services/room-details";
import type { RoomDetails } from "../../types";

export interface RoomDetailsRouteDependencies {
  loadRoomDetails?: (query: RoomDetailsQuery) => Promise<RoomDetails[]>;
}

export function createRoomDetailsRoutes(
  dependencies: RoomDetailsRouteDependencies = {},
) {
  const loadDetails = dependencies.loadRoomDetails ?? loadRoomDetails;

  return new Hono().get("/", async (context) => {
    context.header("Cache-Control", "no-store");

    const buildingName = context.req.query("buildingName");
    if (!buildingName) {
      return context.json(
        { error: "Missing required parameter: buildingName" },
        400,
      );
    }

    try {
      const details = await loadDetails({ buildingName });
      return context.json(details);
    } catch (error) {
      if (error instanceof ServerConfigurationError) {
        Sentry.captureMessage("Missing Supabase environment variables", {
          level: "error",
          tags: { component: "api", route: "/api/room-details" },
        });
        console.error(error.message);
        return context.json({ error: "Server configuration error" }, 500);
      }

      if (error instanceof RoomDetailsDatabaseError) {
        return context.json({ error: error.message }, 500);
      }

      Sentry.captureException(error, {
        tags: { component: "api", route: "/api/room-details" },
      });
      console.error(
        `Error in /api/room-details for ${buildingName}:`,
        error,
      );

      return context.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch room details",
        },
        500,
      );
    }
  });
}
