import type { SupabaseClient } from "@supabase/supabase-js";

import type { ProjectorLocation } from "@/lib/types";

// The three projectors (lightbulbs) for pages that are not Committee tier:
// Freshie Items and Guardian. fn_projector_states (migration 0096) gives who
// lit a projector only to Committee tier, or to the group that lit it; for
// everyone else activated_by_group is null. Until 0096 is applied, the
// projectors table is still readable by everyone and is read instead.

export type ProjectorState = {
  location: ProjectorLocation;
  name: string;
  activated_by_group: number | null;
  activated_at: string | null;
};

export async function loadProjectorStates(supabase: SupabaseClient): Promise<ProjectorState[] | null> {
  const { data, error } = await supabase.rpc("fn_projector_states");
  if (!error) return (data ?? []) as ProjectorState[];
  if (error.code !== "PGRST202") return null;
  const old = await supabase.from("projectors").select("location, name, activated_by_group, activated_at");
  return old.error ? null : ((old.data ?? []) as ProjectorState[]);
}
