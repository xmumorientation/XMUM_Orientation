"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { LOC_BUILDINGS } from "@/lib/faciLocation";
import { supabaseBrowser } from "@/lib/supabase/client";

export type LocOption = { id: number; name: string; sort_order: number; active: boolean };

/** Dispatched on window after Admin changes the options, so every list on the page reloads at once. */
export const LOC_OPTIONS_CHANGED = "loc-options-changed";

// The location options (A1, A3, ...) Admin manages (migration 0076). Live, so
// a change shows in the Facilitator form and the Admin table at once. Falls
// back to the original fixed list until the table is there.
export function useLocationOptions() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [options, setOptions] = useState<LocOption[] | null>(null);
  // The table could not be read (for example migration 0076 is not run yet).
  const [unavailable, setUnavailable] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("faci_location_options")
      .select("id, name, sort_order, active")
      .order("sort_order")
      .order("id");
    setUnavailable(!!error);
    setOptions(error ? [] : ((data as LocOption[]) ?? []));
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`loc-options-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "faci_location_options" }, load)
      .subscribe();
    // Realtime can miss a change (a page opened before the table existed, a
    // dropped connection), so also reload when Admin changes something on this
    // page and whenever the tab comes back into view.
    const onChanged = () => void load();
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener(LOC_OPTIONS_CHANGED, onChanged);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(LOC_OPTIONS_CHANGED, onChanged);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  const active = useMemo(() => (options ?? []).filter((o) => o.active), [options]);
  // The names a dropdown offers: the live options (or the original list if the table is missing).
  const names = useMemo(
    () => (options === null || options.length === 0 ? LOC_BUILDINGS : active.map((o) => o.name)),
    [options, active]
  );

  return { options: options ?? [], active, names, loaded: options !== null, unavailable, reload: load };
}

/** The dropdown names, plus the entry's current building if it is no longer a live option. */
export function withCurrent(names: string[], current: string | null | undefined): string[] {
  return current && !names.includes(current) ? [...names, current] : names;
}
