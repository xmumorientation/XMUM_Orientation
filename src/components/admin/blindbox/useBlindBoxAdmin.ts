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
}

export interface ClaimLite {
  id: number;
  assignment_id: number | null;
  type_id: number;
  group_id: number;
  price: number;
  /** Null until the box is opened. */
  tokens: number | null;
  /** A Spot box: does not count toward the group cap. */
  spot: boolean;
  /** An Admin gift (Live control → Game master): not a sale, no cap. */
  gift: boolean;
}

/** One seller (an account) with every box type they hold, and their one QR. */
export interface Seller {
  id: number;
  name: string;
  kind: string;
  rows: BlindBoxAssignment[];
}

/** The Spot box: its hidden type and its one assignment (null until set up). */
export interface Spot {
  type: BlindBoxType;
  assignment: BlindBoxAssignment;
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
  /** Assignments grouped by seller, for Codes & stock. */
  sellers: Seller[];
  spot: Spot | null;
  cap: number;
  /** Rehearsal mode is on (Admin → Live control): the test reset is allowed. */
  rehearsal: boolean;
  links: Record<number, { url: string; active: boolean }>;
  /** "error" when the links request failed, so rows don't sit on "loading…". */
  linksStatus: "loading" | "ready" | "error";
  typeStats: Record<number, TypeStats>;
  overview: Overview;
  reload: () => Promise<void>;
}

const DEFAULT_CAP = 4;

// Everything the Admin blind-box page reads, kept live. Writes go through the
// fn_bb_* RPCs from the steps; this hook only reads and recomputes the numbers.
// The Spot's hidden type and assignment are kept apart from the rest, and old
// station rows (history since 0100) are left out.
export function useBlindBoxAdmin(onError: (m: string | null) => void): BlindBoxAdminData {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [loaded, setLoaded] = useState(false);
  const [types, setTypes] = useState<BlindBoxType[]>([]);
  const [assignments, setAssignments] = useState<BlindBoxAssignment[]>([]);
  const [claims, setClaims] = useState<ClaimLite[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [cap, setCap] = useState(DEFAULT_CAP);
  const [rehearsal, setRehearsal] = useState(false);
  const [links, setLinks] = useState<Record<number, { url: string; active: boolean }>>({});
  const [linksStatus, setLinksStatus] = useState<"loading" | "ready" | "error">("loading");

  const reload = useCallback(async () => {
    const [t, a, c, st, cfg] = await Promise.all([
      supabase.from("blind_box_types").select("*").order("id"),
      supabase.from("blind_box_assignments").select("*").order("id"),
      supabase
        .from("blind_box_claims")
        .select("id, assignment_id, type_id, group_id, price, tokens, spot, gift"),
      supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", BLINDBOX_HOLDER_ROLES)
        .order("role")
        .order("full_name"),
      supabase
        .from("game_config")
        .select("key, value")
        .in("key", ["blindbox_group_cap", "rehearsal_mode"]),
    ]);
    const failed = [t, a, c, st].find((r) => r.error);
    if (failed?.error) {
      onError(failed.error.message);
      return;
    }
    const allTypes = (t.data as BlindBoxType[]) ?? [];
    const allRows = (a.data as BlindBoxAssignment[]) ?? [];
    const spotType = allTypes.find((x) => x.is_spot);
    const spotRow = spotType && allRows.find((x) => x.type_id === spotType.id);
    setSpot(spotType && spotRow ? { type: spotType, assignment: spotRow } : null);
    setTypes(allTypes.filter((x) => !x.is_spot));
    setAssignments(allRows.filter((x) => x.profile_id));
    setClaims((c.data as ClaimLite[]) ?? []);
    setStaff((st.data as Staff[]) ?? []);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "blind_box_sellers" }, reload)
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
      if (!c.spot && !c.gift) perGroup.set(c.group_id, (perGroup.get(c.group_id) ?? 0) + 1);
      tokensIn += c.price;
      tokensOut += c.tokens ?? 0;
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

  const sellers = useMemo<Seller[]>(() => {
    const out = new Map<number, Seller>();
    for (const a of assignments) {
      let s = out.get(a.seller_id);
      if (!s) {
        const who = staff.find((x) => x.id === a.profile_id);
        s = {
          id: a.seller_id,
          name: who?.full_name || a.profile_id!.slice(0, 8),
          kind: who ? ROLE_LABELS[who.role] : "Account",
          rows: [],
        };
        out.set(a.seller_id, s);
      }
      s.rows.push(a);
    }
    return [...out.values()].sort((x, y) => x.name.localeCompare(y.name));
  }, [assignments, staff]);

  return {
    loaded,
    types,
    assignments,
    claims,
    staff,
    sellers,
    spot,
    cap,
    rehearsal,
    links,
    linksStatus,
    typeStats,
    overview,
    reload,
  };
}
