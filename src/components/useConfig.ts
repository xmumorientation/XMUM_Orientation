"use client";

import { useEffect, useMemo, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase/client";

export interface BrandConfig {
  eventName: string;
  eventTagline: string;
  brandPrimary: string;
  brandSecondary: string;
}

function unquote(v: unknown, fallback: string): string {
  if (typeof v === "string") return v;
  return fallback;
}

// Runtime event branding + game config (Admin-editable so future
// orientations rebrand without code changes).
export function useConfig() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase.from("game_config").select("key, value");
      if (!active || !data) return;
      const map: Record<string, unknown> = {};
      for (const row of data) {
        map[(row as { key: string }).key] = (row as { value: unknown }).value;
      }
      setConfig(map);
      setLoaded(true);
    }
    load();
    const channel = supabase
      .channel("config-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "game_config" },
        load
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const brand: BrandConfig = {
    eventName: unquote(config["event_name"], "Orientation"),
    eventTagline: unquote(config["event_tagline"], ""),
    // LOCAL PREVIEW ONLY (preview/red-white-soft): force the Modernist
    // mono-red accent regardless of what game_config holds, so auth/bigscreen
    // match the rest of the preview. Revert to unquote(config[...]) before
    // merging anywhere.
    brandPrimary: "#ec3013",
    brandSecondary: "#e15b47",
  };

  return { config, brand, loaded };
}

export function puzzleImageUrl(
  config: Record<string, unknown>,
  location: string
): string | null {
  const v = config[`puzzle_image_${location}`];
  return typeof v === "string" && v.length > 0 ? v : null;
}
