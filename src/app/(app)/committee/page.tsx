"use client";

import { IdCard, MapPin, UserCheck, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { GroupBadge } from "@/components/GroupBadge";
import { useProfile } from "@/components/ProfileProvider";
import { FaciAssign } from "@/components/staff/faci/FaciAssign";
import { GameControl } from "@/components/staff/game/GameControl";
import { OpsShell, type OpsSection } from "@/components/staff/game/OpsShell";
import { clock, describeLocation, roomOf, type FaciLocation } from "@/lib/faciLocation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Group } from "@/lib/types";

type OpsView = "headcount" | "location" | "freshies" | "facis";

type Headcount = {
  group_id: number;
  headcount: number;
  local_count: number | null;
  international_count: number | null;
};

// Ops. HOGM runs the game here (Game control: Admin's game console). HOF,
// Committee and Admin get the overview below.
export default function CommitteePage() {
  const profile = useProfile();
  if (profile.role === "hogm") return <GameControl />;
  return <OpsOverview canAssignFacis={profile.role === "hof" || profile.role === "admin"} />;
}

// HOF, Committee and Admin: one row per group (its number on its colour) in
// three read-only, live sections, in the same frame as HOGM's Game control
// (OpsShell); Admin edits them in Admin → Freshies. HOF and Admin also get a
// fourth, Faci & Status, to choose each group's Facilitators and see its
// Recent changes (FaciAssign; fn_admin_set_group_facis allows only them).
//   Headcount  Local / International / Total, as Facilitators report it
//   Location   the group's latest manual location update
//   Freshies   the group's name, slogan and 4-digit password (migration 0092)
// The map is the Map tab, token totals are the Scores tab, and the account's
// own blind box QR is on Home ("My Blind Box").
function OpsOverview({ canAssignFacis }: { canAssignFacis: boolean }) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [groups, setGroups] = useState<Group[]>([]);
  const [headcounts, setHeadcounts] = useState<Record<number, Headcount>>({});
  const [locations, setLocations] = useState<Record<number, FaciLocation>>({});
  const [senders, setSenders] = useState<Record<string, string>>({});
  const [codes, setCodes] = useState<Record<number, string>>({});
  const [view, setView] = useState<OpsView>("headcount");

  // Home's Live floor tiles open a tab directly: /committee?view=headcount.
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    if (v === "headcount" || v === "location" || v === "freshies") setView(v);
    else if (v === "facis" && canAssignFacis) setView(v);
    else if (v === "attendance") setView("headcount"); // older links
  }, [canAssignFacis]);

  useEffect(() => {
    let active = true;

    async function load() {
      const [gs, hcs, locs, facis, logins] = await Promise.all([
        supabase.from("groups").select("*").order("id"),
        supabase.from("group_headcounts").select("group_id, headcount, local_count, international_count"),
        supabase
          .from("faci_location_updates")
          .select("id, user_id, group_id, status, other_text, building, details, created_at, edited_by, edited_at")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(500),
        supabase.from("profiles").select("id, full_name").eq("role", "faci"),
        supabase.from("group_login_codes").select("group_id, code"),
      ]);
      if (!active) return;
      setGroups((gs.data as Group[]) ?? []);
      setHeadcounts(Object.fromEntries(((hcs.data as Headcount[]) ?? []).map((h) => [h.group_id, h])));
      // newest first: keep each group's first (latest) update
      const latest: Record<number, FaciLocation> = {};
      for (const l of (locs.data as FaciLocation[]) ?? []) latest[l.group_id] ??= l;
      setLocations(latest);
      setSenders(
        Object.fromEntries(
          ((facis.data as { id: string; full_name: string | null }[]) ?? []).map((f) => [f.id, f.full_name || "Facilitator"])
        )
      );
      setCodes(Object.fromEntries(((logins.data as { group_id: number; code: string }[]) ?? []).map((c) => [c.group_id, c.code])));
    }
    load();

    const channel = supabase
      .channel(`ops-overview-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "group_headcounts" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "faci_location_updates" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, load)
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const sections: OpsSection<OpsView>[] = [
    { key: "headcount", label: "Headcount", Icon: Users },
    { key: "location", label: "Location", Icon: MapPin },
    { key: "freshies", label: "Freshies", Icon: IdCard },
    ...(canAssignFacis ? [{ key: "facis" as const, label: "Faci & Status", Icon: UserCheck }] : []),
  ];

  const name = (g: Group) => g.display_name?.trim() || g.name;
  const n = (v: number | null | undefined) => (v == null ? "—" : v);

  return (
    <OpsShell name="Overview" sections={sections} current={view} onPick={setView}>
      {view === "headcount" && (
        <div className="gc-card">
          <div className="gc-ops-hc gc-ops-head">
            <span>Group</span>
            <span>Local</span>
            <span>Intl</span>
            <span>Total</span>
          </div>
          <ul className="gc-ops-rows">
            {groups.map((g) => {
              const h = headcounts[g.id];
              return (
                <li key={g.id} className="gc-ops-hc">
                  <span className="gc-ops-group">
                    <GroupBadge id={g.id} color={g.color} />
                    <span className="gc-ops-name" title={name(g)}>
                      {name(g)}
                    </span>
                  </span>
                  <span className="gc-ops-num">{n(h?.local_count)}</span>
                  <span className="gc-ops-num">{n(h?.international_count)}</span>
                  <span className="gc-ops-num gc-ops-total">{n(h?.headcount)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {view === "location" && (
        <ul className="gc-card gc-ops-rows">
          {groups.map((g) => {
            const l = locations[g.id];
            const room = l ? roomOf(l.details) : null;
            return (
              <li key={g.id} className="gc-ops-row gc-ops-top">
                <GroupBadge id={g.id} color={g.color} />
                <div className="gc-ops-body">
                  <p className="gc-ops-name">{name(g)}</p>
                  {l ? (
                    <>
                      <p className="gc-ops-main">
                        {describeLocation(l)}
                        {room && `-${room}`}
                      </p>
                      {l.details && !room && <p className="gc-ops-sub">{l.details}</p>}
                      <p className="gc-ops-meta">
                        {senders[l.user_id] ?? "Facilitator"} · {clock(l.created_at)}
                        {l.edited_at ? " · edited by Admin" : ""}
                      </p>
                    </>
                  ) : (
                    <p className="gc-ops-sub">No update yet</p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {view === "freshies" && (
        <ul className="gc-card gc-ops-rows">
          {groups.map((g) => (
            <li key={g.id} className="gc-ops-row">
              <GroupBadge id={g.id} color={g.color} />
              <div className="gc-ops-body">
                <p className="gc-ops-name">{name(g)}</p>
                <p className="gc-ops-sub">{g.slogan?.trim() || "No slogan yet"}</p>
              </div>
              <div className="gc-ops-code">
                <small>Password</small>
                <b>{codes[g.id] ?? "—"}</b>
              </div>
            </li>
          ))}
        </ul>
      )}

      {view === "facis" && canAssignFacis && <FaciAssign />}
    </OpsShell>
  );
}
