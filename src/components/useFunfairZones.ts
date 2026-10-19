"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { FUNFAIR_ZONES, funfairMissing, zoneIsOn, type FunfairPreview, type FunfairZoneRow } from "@/lib/funfair";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { MapLightbulb, ProjectorLocation } from "@/lib/types";
import { friendlyError } from "@/lib/utils";

// Admin and HOGM: the funfair's setup (funfair_zones, migration 0088) and the
// lit bulbs, both live, and a way to change a zone (fn_set_funfair_zone). Used
// by Admin → Live control (FunfairZones) and HOGM's Game control
// (FunfairSection).

export function useFunfairZones() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [rows, setRows] = useState<FunfairZoneRow[] | null>(null);
  const [lit, setLit] = useState<Set<ProjectorLocation>>(() => new Set());
  // Migration 0088 is not applied yet: the map uses the default keys.
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [zones, bulbs] = await Promise.all([
      supabase.from("funfair_zones").select("zone, name, required, rule, manual, updated_at"),
      supabase.rpc("fn_map_lightbulbs"),
    ]);
    if (zones.error) {
      if (funfairMissing(zones.error)) setMissing(true);
      else setError(friendlyError(zones.error));
      return;
    }
    const list = (zones.data ?? []) as FunfairZoneRow[];
    setRows(FUNFAIR_ZONES.flatMap((z) => list.filter((r) => r.zone === z)));
    if (bulbs.data) {
      setLit(new Set((bulbs.data as MapLightbulb[]).filter((b) => b.activated_at).map((b) => b.location)));
    }
  }, [supabase]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("funfair-setup")
      .on("postgres_changes", { event: "*", schema: "public", table: "funfair_zones" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "projectors" }, () => void load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  /** Saves a zone's keys, rule and override. Shown at once, put back if the server refuses. */
  const save = useCallback(
    async (row: FunfairZoneRow) => {
      setBusy(true);
      setError(null);
      setRows((list) => list && list.map((r) => (r.zone === row.zone ? row : r)));
      const { error: e } = await supabase.rpc("fn_set_funfair_zone", {
        p_zone: row.zone,
        p_required: row.required,
        p_rule: row.rule,
        p_manual: row.manual,
      });
      setBusy(false);
      if (e) {
        setError(friendlyError(e));
        await load();
        return false;
      }
      return true;
    },
    [supabase, load],
  );

  const isOn = useCallback((row: FunfairZoneRow) => zoneIsOn(row, lit), [lit]);

  return { rows, lit, missing, error, busy, save, isOn };
}

/** A row with `loc` added to or taken off its keys. */
export function toggleKey(row: FunfairZoneRow, loc: ProjectorLocation): FunfairZoneRow {
  const required = row.required.includes(loc) ? row.required.filter((k) => k !== loc) : [...row.required, loc];
  return { ...row, required };
}

/**
 * Where a Preview button goes: the map opens on that zone and plays its power-up, or ("lakefront") on the lake
 * stage and plays the concert's opening. On that screen only.
 */
export const funfairPreviewHref = (zone: FunfairPreview) => `/map?funfair_preview=${zone}`;
