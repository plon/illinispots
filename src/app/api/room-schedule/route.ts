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
  let startTime = searchParams.get("startTime");

  const nowCST = moment().tz("America/Chicago");

  // Default to current date and time if not provided
  if (!date) {
    date = nowCST.format("YYYY-MM-DD");
  }
  if (!startTime) {
    startTime = nowCST.format("HH:mm:ss");
  }

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
  if (!/^\d{2}:\d{2}:\d{2}$/.test(startTime)) {
    return NextResponse.json(
      { error: "Invalid startTime format. Use HH:mm:ss." },
      { status: 400 },
    );
  }

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

    const { data, error } = await supabase.rpc("get_room_schedule", {
      building_id_param: buildingId,
      room_number_param: roomNumber,
      check_date: date,
      start_time_param: startTime,
    });

    if (error) {
      console.error(`Supabase error for ${buildingId} - ${roomNumber}:`, error);
      return NextResponse.json(
        { error: "Database error fetching schedule" },
        { status: 500 },
      );
    }

    const scheduleBlocks: RoomScheduleBlock[] = Array.isArray(data) ? data : [];

    return NextResponse.json(scheduleBlocks);
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
