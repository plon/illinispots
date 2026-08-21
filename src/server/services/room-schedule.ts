import { createClient } from "@supabase/supabase-js";
import type moment from "moment-timezone";
import type { RoomScheduleBlock } from "../../types";
import { getSupabaseConfig } from "../config";
import { Sentry } from "../observability";

export interface RoomScheduleQuery {
  buildingId: string;
  roomNumber: string;
  date: string;
}

export class RoomScheduleDatabaseError extends Error {
  constructor(options?: ErrorOptions) {
    super("Database error fetching schedule", options);
    this.name = "RoomScheduleDatabaseError";
  }
}

export async function loadRoomSchedule({
  buildingId,
  roomNumber,
  date,
}: RoomScheduleQuery): Promise<RoomScheduleBlock[]> {
  const config = getSupabaseConfig();
  const supabase = createClient(config.url, config.key);

  const { data, error } = await Sentry.startSpan(
    {
      name: "Supabase RPC get_room_schedule_cached",
      op: "db.rpc",
    },
    () =>
      supabase.rpc("get_room_schedule_cached", {
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

  return Array.isArray(data) ? (data as RoomScheduleBlock[]) : [];
}

/**
 * Returns the part of a room's schedule that is still relevant at the selected
 * time. The active block begins at the preceding ten-minute boundary so the UI
 * can render the partial current hour consistently.
 */
export function selectRelevantSchedule(
  schedule: RoomScheduleBlock[],
  target: moment.Moment,
): RoomScheduleBlock[] {
  const targetTime = target.format("HH:mm:ss");
  const flooredTargetTime = target
    .clone()
    .minutes(Math.floor(target.minutes() / 10) * 10)
    .seconds(0)
    .milliseconds(0)
    .format("HH:mm:ss");

  const firstRelevantIndex = schedule.findIndex((block) => {
    const containsTarget = block.start <= targetTime && block.end > targetTime;
    if (containsTarget) {
      return flooredTargetTime < block.end;
    }

    return block.start >= targetTime;
  });

  if (firstRelevantIndex === -1) {
    return [];
  }

  const relevantSchedule = schedule.slice(firstRelevantIndex);
  const firstBlock = relevantSchedule[0];
  const targetFallsInsideFirstBlock =
    firstBlock.start <= targetTime && firstBlock.end > targetTime;

  if (targetFallsInsideFirstBlock && flooredTargetTime < firstBlock.end) {
    relevantSchedule[0] = {
      ...firstBlock,
      start: flooredTargetTime,
    };
  }

  return relevantSchedule;
}
