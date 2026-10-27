"use client";

import { useMemo } from "react";

import { supabaseBrowser } from "@/lib/supabase/client";
import { projectorPlaces } from "@/lib/projectorPlaces";
import { useSharedFeed, type FeedSource } from "@/lib/sharedFeed";

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

// game_config as a key → value map, shared by every caller on the page (one
// query and one realtime channel; see src/lib/sharedFeed.ts).
function configSource(): FeedSource<Record<string, unknown>> {
  const supabase = supabaseBrowser();
  return {
    async load() {
      const { data } = await supabase.from("game_config").select("key, value");
      if (!data) return undefined;
      const map: Record<string, unknown> = {};
      for (const row of data) {
        map[(row as { key: string }).key] = (row as { value: unknown }).value;
      }
      return map;
    },
    listen(reload) {
      const channel = supabase
        .channel(`config-live-${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "game_config" }, reload)
        .subscribe();
      return () => void supabase.removeChannel(channel);
    },
  };
}

const EMPTY: Record<string, unknown> = {};

// Runtime event branding + game config (Admin-editable so future
// orientations rebrand without code changes).
export function useConfig() {
  const shared = useSharedFeed("game_config", configSource);
  const config = shared ?? EMPTY;
  const loaded = shared !== undefined;

  const brand: BrandConfig = {
    eventName: unquote(config["event_name"], "Orientation"),
    eventTagline: unquote(config["event_tagline"], ""),
    brandPrimary: unquote(config["brand_primary"], "#0891b2"),
    brandSecondary: unquote(config["brand_secondary"], "#7c3aed"),
  };

  return { config, brand, loaded };
}

/** Each projector's place (src/lib/projectorPlaces.ts), live. */
export function useProjectorPlaces() {
  const { config } = useConfig();
  return useMemo(() => projectorPlaces(config), [config]);
}

export function puzzleImageUrl(
  config: Record<string, unknown>,
  location: string
): string | null {
  const v = config[`puzzle_image_${location}`];
  return typeof v === "string" && v.length > 0 ? v : null;
}
