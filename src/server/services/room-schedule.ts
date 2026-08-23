import type { RoomScheduleBlock } from "../../types";
import { Sentry } from "../observability";
import { parseRoomSchedule } from "./external-contracts";
import { SingleFlight } from "./single-flight";
import { getSupabaseClient } from "./supabase";

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

type RoomScheduleExecutor = NonNullable<
  RoomScheduleServiceDependencies["executeRoomScheduleRpc"]
>;

const roomScheduleSingleFlight = new SingleFlight<
  RoomScheduleExecutor,
  RoomScheduleRpcResult
>();

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
  return await getSupabaseClient().rpc(procedure, parameters);
}

export async function loadRoomSchedule(
  { buildingId, roomNumber, date }: RoomScheduleQuery,
  dependencies: RoomScheduleServiceDependencies = {},
): Promise<RoomScheduleBlock[]> {
  const executeRpc =
    dependencies.executeRoomScheduleRpc ?? executeRoomScheduleRpc;
  const parameters = {
    building_id_param: buildingId,
    room_number_param: roomNumber,
    check_date_param: date,
  };

  const { data, error } = await Sentry.startSpan(
    {
      name: "Supabase RPC get_room_schedule_cached",
      op: "db.rpc",
    },
    () =>
      roomScheduleSingleFlight.run(
        executeRpc,
        JSON.stringify([buildingId, roomNumber, date]),
        () => executeRpc("get_room_schedule_cached", parameters),
      ),
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
