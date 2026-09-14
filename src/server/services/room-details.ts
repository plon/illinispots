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

interface RoomDetailsRow {
  building_name: unknown;
  room_number: unknown;
  capacity: unknown;
  room_type: unknown;
  equipment: unknown;
  photo_urls: unknown;
  answers_url: unknown;
}

function parseRow(row: RoomDetailsRow): RoomDetails | null {
  if (
    typeof row.building_name !== "string" ||
    typeof row.room_number !== "string" ||
    typeof row.capacity !== "number" ||
    typeof row.room_type !== "string"
  ) {
    return null;
  }
  return {
    buildingName: row.building_name,
    roomNumber: row.room_number,
    capacity: row.capacity,
    roomType: row.room_type,
    equipment: Array.isArray(row.equipment)
      ? row.equipment.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    photoUrls: Array.isArray(row.photo_urls)
      ? row.photo_urls.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    answersUrl:
      typeof row.answers_url === "string" ? row.answers_url : null,
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

  return (data as RoomDetailsRow[])
    .map(parseRow)
    .filter((row): row is RoomDetails => row !== null);
}
