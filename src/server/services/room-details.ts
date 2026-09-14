import { createClient } from "@supabase/supabase-js";
import type { RoomDetails } from "../../types";
import { getSupabaseConfig } from "../config";
import { Sentry } from "../observability";

export interface RoomDetailsQuery {
  buildingName: string;
}

export interface RoomDetailsTableResult {
  data: unknown;
  error: unknown;
}

export interface RoomDetailsServiceDependencies {
  queryRoomDetailsTable?: (
    buildingName: string,
  ) => Promise<RoomDetailsTableResult>;
}

export class RoomDetailsDatabaseError extends Error {
  constructor(options?: ErrorOptions) {
    super("Database error fetching room details", options);
    this.name = "RoomDetailsDatabaseError";
  }
}

function parseRow(row: unknown): RoomDetails | null {
  if (typeof row !== "object" || row === null || Array.isArray(row)) {
    return null;
  }

  const candidate = row as Record<string, unknown>;
  if (
    typeof candidate.building_name !== "string" ||
    typeof candidate.room_number !== "string" ||
    typeof candidate.capacity !== "number" ||
    typeof candidate.room_type !== "string"
  ) {
    return null;
  }
  return {
    buildingName: candidate.building_name,
    roomNumber: candidate.room_number,
    capacity: candidate.capacity,
    roomType: candidate.room_type,
    equipment: Array.isArray(candidate.equipment)
      ? candidate.equipment.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    photoUrls: Array.isArray(candidate.photo_urls)
      ? candidate.photo_urls.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    answersUrl:
      typeof candidate.answers_url === "string"
        ? candidate.answers_url
        : null,
  };
}

async function queryRoomDetailsTable(
  buildingName: string,
): Promise<RoomDetailsTableResult> {
  const config = getSupabaseConfig();
  const supabase = createClient(config.url, config.key);

  return await supabase
    .from("room_details")
    .select(
      "building_name, room_number, capacity, room_type, equipment, photo_urls, answers_url",
    )
    .eq("building_name", buildingName);
}

export async function loadRoomDetails(
  { buildingName }: RoomDetailsQuery,
  dependencies: RoomDetailsServiceDependencies = {},
): Promise<RoomDetails[]> {
  const query = dependencies.queryRoomDetailsTable ?? queryRoomDetailsTable;

  const { data, error } = await Sentry.startSpan(
    {
      name: "Supabase room_details select",
      op: "db.query",
    },
    () => query(buildingName),
  );

  if (error) {
    Sentry.captureException(error, {
      tags: { component: "supabase", operation: "room_details" },
    });
    console.error(`Supabase error for room details ${buildingName}:`, error);
    throw new RoomDetailsDatabaseError({ cause: error });
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map(parseRow)
    .filter((row): row is RoomDetails => row !== null);
}
