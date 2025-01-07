import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import moment from "moment-timezone";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_KEY!,
  );

  const now = moment().tz("America/Chicago");

  const { data, error } = await supabase.rpc("get_spots", {
    check_time: now.format("HH:mm:ss"),
    check_date: now.format("YYYY-MM-DD"),
    minimum_useful_minutes: 30,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
