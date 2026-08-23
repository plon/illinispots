import { createClient } from "@supabase/supabase-js";
import type { RoomScheduleBlock } from "../../types";
import { getSupabaseConfig } from "../config";
import { Sentry } from "../observability";
import { parseRoomSchedule } from "./external-contracts";

export interface RoomScheduleQuery {
  buildingId: string;
  roomNumber: string;
  date: string;
}

export interface RoomScheduleRpcParameters {
  building_id_param: string;
  room_number_param: string;
  check_date_param: string;
}

export interface RoomScheduleRpcResult {
  data: unknown;
  error: unknown;
}

export interface RoomScheduleServiceDependencies {
  executeRoomScheduleRpc?: (
    procedure: "get_room_schedule_cached",
    parameters: RoomScheduleRpcParameters,
  ) => Promise<RoomScheduleRpcResult>;
}

export class RoomScheduleDatabaseError extends Error {
  constructor(options?: ErrorOptions) {
    super("Database error fetching schedule", options);
    this.name = "RoomScheduleDatabaseError";
  }
}

async function executeRoomScheduleRpc(
  procedure: "get_room_schedule_cached",
  parameters: RoomScheduleRpcParameters,
): Promise<RoomScheduleRpcResult> {
  const config = getSupabaseConfig();
  const supabase = createClient(config.url, config.key);

  return await supabase.rpc(procedure, parameters);
}

export async function loadRoomSchedule(
  { buildingId, roomNumber, date }: RoomScheduleQuery,
  dependencies: RoomScheduleServiceDependencies = {},
): Promise<RoomScheduleBlock[]> {
  const executeRpc =
    dependencies.executeRoomScheduleRpc ?? executeRoomScheduleRpc;

  const { data, error } = await Sentry.startSpan(
    {
      name: "Supabase RPC get_room_schedule_cached",
      op: "db.rpc",
    },
    () =>
      executeRpc("get_room_schedule_cached", {
        building_id_param: buildingId,
        room_number_param: roomNumber,
        check_date_param: date,
      }),
  );

  if (error) {
    Sentry.captureException(error, {
      tags: {
        component: "supabase",
        operation: "get_room_schedule_cached",
      },
    });
    console.error(`Supabase error for ${buildingId} - ${roomNumber}:`, error);
    throw new RoomScheduleDatabaseError({ cause: error });
  }

  try {
    return parseRoomSchedule(data);
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        component: "supabase",
        operation: "get_room_schedule_cached",
        failure: "invalid-response",
      },
    });
    console.error(
      `Invalid Supabase schedule response for ${buildingId} - ${roomNumber}:`,
      error,
    );
    throw new RoomScheduleDatabaseError({ cause: error });
  }
}
