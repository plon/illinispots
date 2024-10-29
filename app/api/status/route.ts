import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import moment from "moment-timezone";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_KEY!,
  );

  const now = moment().utc().tz("America/Chicago");
  const dayMap: { [key: number]: string } = {
    0: "U",
    1: "M",
    2: "T",
    3: "W",
    4: "R",
    5: "F",
    6: "S",
  };

  const { data, error } = await supabase.rpc("get_current_building_status", {
    check_time: now.format("HH:mm:ss"),
    check_day: dayMap[now.day()],
    minimum_useful_minutes: 30,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
