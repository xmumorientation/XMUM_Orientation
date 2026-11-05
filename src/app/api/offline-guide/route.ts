import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Public timetable only: no cookies, service key, live timers or role data.
export async function GET() {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim(),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const [items, days] = await Promise.all([
    client.from("schedule_items")
      .select("day_label,title,time_label,location,description")
      .order("sort_order").order("id"),
    client.from("schedule_days").select("day_label,day_date").order("day_date"),
  ]);
  if (items.error || days.error || !items.data || !days.data) {
    return NextResponse.json({ error: "Schedule unavailable" }, { status: 503 });
  }
  return NextResponse.json(
    { savedAt: new Date().toISOString(), items: items.data, days: days.data },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } }
  );
}
