import { supabaseBrowser } from "@/lib/supabase/client";
import type { ScheduleItem } from "@/lib/types";
import { friendlyError } from "@/lib/utils";

/** Calls fn_schedule_timer; used by the Now box on Live control. */
export async function scheduleTimer(
  item: Pick<ScheduleItem, "id" | "title">,
  action: "pause" | "resume" | "extend" | "set_end" | "end" | "reset",
  opts: { minutes?: number; endAt?: Date } = {}
) {
  const { error } = await supabaseBrowser().rpc("fn_schedule_timer", {
    p_item_id: item.id,
    p_action: action,
    p_minutes: opts.minutes ?? 0,
    p_end_at: opts.endAt ? opts.endAt.toISOString() : null,
  });
  return error ? friendlyError(error) : null;
}
