"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { supabaseBrowser } from "@/lib/supabase/client";
import {
  BLINDBOX_HOLDER_ROLES,
  ROLE_LABELS,
  type BlindBoxAssignment,
  type BlindBoxType,
  type UserRole,
} from "@/lib/types";

export interface Staff {
  id: string;
  full_name: string;
  role: UserRole;
  station_id: number | null;
}

export interface StationLite {
  id: number;
  code: string;
  name: string;
}

export interface ClaimLite {
  id: number;
  assignment_id: number | null;
  type_id: number;
  group_id: number;
  price: number;
  tokens: number;
}

export interface TypeStats {
  assigned: number;
  unassigned: number;
  opened: number;
  /** Assigned but not yet opened, still in sellers' hands. */
  left: number;
  assignments: number;
}

export interface Overview {
  stock: number;
  assigned: number;
  unassigned: number;
  opened: number;
  left: number;
  tokensIn: number;
  tokensOut: number;
  groupsAtCap: number;
}

export interface BlindBoxAdminData {
  loaded: boolean;
  types: BlindBoxType[];
  assignments: BlindBoxAssignment[];
  claims: ClaimLite[];
  staff: Staff[];
  stations: StationLite[];
  cap: number;
  /** Rehearsal mode is on (Admin → Live control): the test reset is allowed. */
  rehearsal: boolean;
  links: Record<number, { url: string; active: boolean }>;
  /** "error" when the links request failed, so rows don't sit on "loading…". */
  linksStatus: "loading" | "ready" | "error";
  typeStats: Record<number, TypeStats>;
  overview: Overview;
  sellerName: (a: BlindBoxAssignment) => string;
  sellerKind: (a: BlindBoxAssignment) => string;
  reload: () => Promise<void>;
}

const DEFAULT_CAP = 4;

// Everything the Admin blind-box page reads, kept live. Writes go through the
// fn_bb_* RPCs from the tabs; this hook only reads and recomputes the numbers.
export function useBlindBoxAdmin(onError: (m: string | null) => void): BlindBoxAdminData {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [loaded, setLoaded] = useState(false);
  const [types, setTypes] = useState<BlindBoxType[]>([]);
  const [assignments, setAssignments] = useState<BlindBoxAssignment[]>([]);
  const [claims, setClaims] = useState<ClaimLite[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [stations, setStations] = useState<StationLite[]>([]);
  const [cap, setCap] = useState(DEFAULT_CAP);
  const [rehearsal, setRehearsal] = useState(false);
  const [links, setLinks] = useState<Record<number, { url: string; active: boolean }>>({});
  const [linksStatus, setLinksStatus] = useState<"loading" | "ready" | "error">("loading");

  const reload = useCallback(async () => {
    const [t, a, c, st, sn, cfg] = await Promise.all([
      supabase.from("blind_box_types").select("*").order("id"),
      supabase.from("blind_box_assignments").select("*").order("id"),
      supabase
        .from("blind_box_claims")
        .select("id, assignment_id, type_id, group_id, price, tokens"),
      supabase
        .from("profiles")
        .select("id, full_name, role, station_id")
        .in("role", BLINDBOX_HOLDER_ROLES)
        .order("role")
        .order("full_name"),
      supabase.from("stations").select("id, code, name").order("id"),
      supabase
        .from("game_config")
        .select("key, value")
        .in("key", ["blindbox_group_cap", "rehearsal_mode"]),
    ]);
    const failed = [t, a, c, st, sn].find((r) => r.error);
    if (failed?.error) {
      onError(failed.error.message);
      return;
    }
    setTypes((t.data as BlindBoxType[]) ?? []);
    setAssignments((a.data as BlindBoxAssignment[]) ?? []);
    setClaims((c.data as ClaimLite[]) ?? []);
    setStaff((st.data as Staff[]) ?? []);
    setStations((sn.data as StationLite[]) ?? []);
    const conf = new Map(
      ((cfg.data as { key: string; value: unknown }[] | null) ?? []).map((r) => [r.key, r.value])
    );
    const capValue = Number(conf.get("blindbox_group_cap"));
    setCap(Number.isFinite(capValue) && capValue > 0 ? capValue : DEFAULT_CAP);
    const rm = conf.get("rehearsal_mode");
    setRehearsal(rm === true || rm === "true");
    setLoaded(true);

    // Links are recomputed by the server on demand; asking never changes them.
    try {
      const res = await fetch("/api/blindbox/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const text = await res.text();
      let json: { links?: { id: number; url: string; active: boolean }[]; error?: string } = {};
      try {
        json = JSON.parse(text);
      } catch {
        // Not JSON: a redirect to /login, a 404 or a server error page.
      }
      if (res.ok && json.links) {
        const map: Record<number, { url: string; active: boolean }> = {};
        for (const l of json.links) map[l.id] = { url: l.url, active: l.active };
        setLinks(map);
        setLinksStatus("ready");
      } else {
        setLinksStatus("error");
        onError(
          `Couldn't load the QR links (HTTP ${res.status}${res.redirected ? ", redirected to " + new URL(res.url).pathname : ""}): ${json.error ?? (text.slice(0, 120).replace(/\s+/g, " ") || "empty response")}`
        );
      }
    } catch (e) {
      setLinksStatus("error");
      onError(`Couldn't load the QR links: ${String(e)}`);
    }
  }, [supabase, onError]);

  useEffect(() => {
    reload();
    // Unique name per mount: the browser client is shared across components.
    const channel = supabase
      .channel(`bb-admin-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "blind_box_types" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "blind_box_assignments" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "blind_box_claims" }, reload)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, reload]);

  const typeStats = useMemo(() => {
    const out: Record<number, TypeStats> = {};
    for (const t of types) {
      out[t.id] = { assigned: 0, unassigned: t.stock, opened: 0, left: 0, assignments: 0 };
    }
    for (const a of assignments) {
      const s = out[a.type_id];
      if (!s) continue;
      s.assigned += a.quantity;
      s.opened += a.opened;
      s.assignments += 1;
    }
    for (const t of types) {
      const s = out[t.id];
      s.unassigned = t.stock - s.assigned;
      s.left = s.assigned - s.opened;
    }
    return out;
  }, [types, assignments]);

  const overview = useMemo<Overview>(() => {
    let stock = 0;
    let assigned = 0;
    let opened = 0;
    for (const t of types) {
      if (t.archived) continue;
      stock += t.stock;
      assigned += typeStats[t.id]?.assigned ?? 0;
      opened += typeStats[t.id]?.opened ?? 0;
    }
    const perGroup = new Map<number, number>();
    let tokensIn = 0;
    let tokensOut = 0;
    for (const c of claims) {
      perGroup.set(c.group_id, (perGroup.get(c.group_id) ?? 0) + 1);
      tokensIn += c.price;
      tokensOut += c.tokens;
    }
    let groupsAtCap = 0;
    for (const n of perGroup.values()) if (n >= cap) groupsAtCap += 1;
    return {
      stock,
      assigned,
      unassigned: stock - assigned,
      opened,
      left: assigned - opened,
      tokensIn,
      tokensOut,
      groupsAtCap,
    };
  }, [types, typeStats, claims, cap]);

  const sellerName = useCallback(
    (a: BlindBoxAssignment) => {
      if (a.profile_id) {
        return staff.find((s) => s.id === a.profile_id)?.full_name || a.profile_id.slice(0, 8);
      }
      const st = stations.find((s) => s.id === a.station_id);
      return st ? `${st.code} · ${st.name}` : `Station ${a.station_id}`;
    },
    [staff, stations]
  );

  const sellerKind = useCallback(
    (a: BlindBoxAssignment) => {
      if (a.profile_id) {
        const role = staff.find((s) => s.id === a.profile_id)?.role;
        return role ? ROLE_LABELS[role] : "Account";
      }
      return "Station (shared pool)";
    },
    [staff]
  );

  return {
    loaded,
    types,
    assignments,
    claims,
    staff,
    stations,
    cap,
    rehearsal,
    links,
    linksStatus,
    typeStats,
    overview,
    sellerName,
    sellerKind,
    reload,
  };
}
