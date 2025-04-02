import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import moment from "moment-timezone";
import { RoomScheduleBlock } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const buildingId = searchParams.get("buildingId");
  const roomNumber = searchParams.get("roomNumber");
  let date = searchParams.get("date");

  const nowCST = moment().tz("America/Chicago");
  const nowTimeStr = nowCST.format("HH:mm:ss"); // For comparison

  // Calculate floored time (round down to nearest 10 minutes)
  const currentMinutes = nowCST.minutes();
  const flooredMinutes = Math.floor(currentMinutes / 10) * 10;
  const flooredNowCST = nowCST.clone().minutes(flooredMinutes).seconds(0).milliseconds(0);
  const flooredNowTimeStr = flooredNowCST.format("HH:mm:ss"); // For setting start time

  // Default to current date if not provided
  if (!date) {
    date = nowCST.format("YYYY-MM-DD");
  }

  // --- Parameter Validation ---
  if (!buildingId || !roomNumber) {
    return NextResponse.json(
      { error: "Missing required parameters: buildingId and roomNumber" },
      { status: 400 },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: "Invalid date format. Use YYYY-MM-DD." },
      { status: 400 },
    );
  }
  // --- End Validation ---

  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      console.error("Missing Supabase environment variables");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 },
      );
    }
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_KEY!,
    );

    // Call Supabase function for the full day schedule
    const { data, error } = await supabase.rpc("get_room_schedule", {
      building_id_param: buildingId,
      room_number_param: roomNumber,
      check_date: date,
    });

    if (error) {
      console.error(`Supabase error for ${buildingId} - ${roomNumber}:`, error);
      return NextResponse.json(
        { error: "Database error fetching schedule" },
        { status: 500 },
      );
    }

    const fullDaySchedule: RoomScheduleBlock[] = Array.isArray(data) ? data : [];

    if (fullDaySchedule.length === 0) {
      return NextResponse.json([]);
    }

    let firstRelevantIndex = -1;
    let needsTruncation = false;

    for (let i = 0; i < fullDaySchedule.length; i++) {
      const block = fullDaySchedule[i];

      // Condition 1: Current time is within this block
      if (block.start <= nowTimeStr && block.end > nowTimeStr) {
         // Check if flooring the time makes sense (doesn't push start >= end)
         if (flooredNowTimeStr < block.end) {
             firstRelevantIndex = i;
             needsTruncation = true; // Mark that the start time needs modification
             break;
         } else {
             // Flooring pushes start >= end, treat this block as finished, check next
             continue;
         }
      }

      // Condition 2: This block starts at or after the current time
      if (block.start >= nowTimeStr) {
        firstRelevantIndex = i;
        needsTruncation = false; // No truncation needed, start with original time
        break;
      }
    }

    let relevantSchedule: RoomScheduleBlock[] = [];

    if (firstRelevantIndex !== -1) {
      // Slice the array to get blocks from the relevant one onwards
      relevantSchedule = fullDaySchedule.slice(firstRelevantIndex);

      // Apply truncation if needed and if the slice is not empty
      if (needsTruncation && relevantSchedule.length > 0) {
        // Create a *new* object for the first block with the modified start time
        relevantSchedule[0] = {
          ...relevantSchedule[0], // Copy original block properties
          start: flooredNowTimeStr, // Set start to the floored time
        };
      }
    }
    // If firstRelevantIndex is -1, relevantSchedule remains empty

    return NextResponse.json(relevantSchedule);

  } catch (error: unknown) {
    console.error(
      `Error in /api/room-schedule for ${buildingId} - ${roomNumber}:`,
      error,
    );
    let errorMessage = "Failed to fetch room schedule";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
