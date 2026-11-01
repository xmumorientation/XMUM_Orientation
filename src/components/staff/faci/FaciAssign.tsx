"use client";

import { Check, History, Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { groupSwatch } from "@/components/freshie/groupTheme";
import { GroupBadge } from "@/components/GroupBadge";
import "@/components/staff/game/game-control.css";
import { Sheet, StatusLine, useStatus } from "@/components/staff/game/parts";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Group } from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

import { GroupLog } from "./GroupLog";

// Ops → Faci & Status (HOF and Admin): which Facilitators belong to each group.
// One row per group with its Facilitators; Edit opens a picker (search, picked
// first, a Faci already in another group says so and moves when saved), saved
// with fn_admin_set_group_facis (HOF + Admin, `is_faci_lead()`, migration
// 0080). The clock icon opens the group's Recent changes (GroupLog): every
// logged change to the group or by its people, the game included. The group's
// headcount, location, name, slogan and password are the other Ops tabs.

type Faci = { id: string; full_name: string | null; group_id: number | null };

const faciName = (f: Faci | undefined) => f?.full_name || "Unnamed";

export function FaciAssign({ readOnly = false }: { readOnly?: boolean }) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { error, setError, notice, flash } = useStatus();
  const [groups, setGroups] = useState<Group[]>([]);
  const [facis, setFacis] = useState<Faci[]>([]);
  const [editing, setEditing] = useState<Group | null>(null);
  const [historyOf, setHistoryOf] = useState<Group | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [g, f] = await Promise.all([
      supabase.from("groups").select("id, name, color, display_name").order("id"),
      supabase.from("profiles").select("id, full_name, group_id").eq("role", "faci").order("full_name"),
    ]);
    const failed = g.error ?? f.error;
    if (failed) setError(friendlyError(failed));
    setGroups((g.data as Group[]) ?? []);
    setFacis((f.data as Faci[]) ?? []);
  }, [supabase, setError]);

  useEffect(() => {
    load();
    // One channel per table: a table missing from the realtime publication
    // fails only its own channel. Also reload when the tab comes back.
    const channels = ["groups", "profiles"].map((table) =>
      supabase
        .channel(`fa-${table}-${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "*", schema: "public", table }, load)
        .subscribe()
    );
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      channels.forEach((c) => supabase.removeChannel(c));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [supabase, load]);

  const facisOf = (groupId: number) => facis.filter((f) => f.group_id === groupId);
  const groupLabel = (id: number | null) => groups.find((g) => g.id === id)?.name ?? `Group ${id}`;
  const assigned = facis.filter((f) => f.group_id != null).length;

  function openFacis(g: Group) {
    setPicked(facisOf(g.id).map((f) => f.id));
    setSearch("");
    setEditing(g);
  }

  async function saveFacis() {
    if (readOnly || !editing) return;
    setBusy(true);
    const { error } = await supabase.rpc("fn_admin_set_group_facis", { p_group_id: editing.id, p_user_ids: picked });
    setBusy(false);
    if (error) return setError(friendlyError(error));
    flash(`${editing.name}: Facilitators saved`);
    setEditing(null);
    load();
  }

  return (
    <>
      <p className="gc-muted">
        {assigned} of {facis.length} Facilitators are in a group.
      </p>
      <StatusLine error={error} notice={notice} />
      <ul className="gc-card gc-ops-rows">
        {groups.map((g) => {
          const own = facisOf(g.id);
          return (
            <li key={g.id} className="gc-ops-row">
              <GroupBadge id={g.id} color={groupSwatch(g.id, g.color)} />
              <div className="gc-ops-body">
                <p className="gc-ops-name">{g.display_name?.trim() || g.name}</p>
                <p className="gc-ops-sub">{own.length ? own.map((f) => faciName(f)).join(", ") : "No Facilitator yet"}</p>
              </div>
              <button
                type="button"
                className="gc-icon"
                aria-label={`${g.name} recent changes`}
                title="Recent changes"
                onClick={() => setHistoryOf(g)}
              >
                <History size={17} aria-hidden />
              </button>
              {!readOnly && <button type="button" className="gc-btn gc-ops-edit" aria-label={`Edit ${g.name}'s Facilitators`} onClick={() => openFacis(g)}>
                <Pencil size={14} aria-hidden />
                <span>Edit</span>
              </button>}
            </li>
          );
        })}
        {groups.length === 0 && <li className="gc-empty">No groups yet.</li>}
      </ul>

      <Sheet
        open={historyOf !== null}
        onClose={() => setHistoryOf(null)}
        title={historyOf ? `Recent Changes / ${historyOf.display_name?.trim() || historyOf.name}` : "Recent Changes"}
        wide
      >
        {historyOf && <GroupLog groupId={historyOf.id} />}
      </Sheet>

      <Sheet open={!readOnly && editing !== null} onClose={() => setEditing(null)} title={editing ? `Facilitators / ${editing.name}` : "Facilitators"}>
        {!readOnly && editing && (
          <div className="gc-form">
            <input
              className="gc-input"
              placeholder="Search"
              aria-label="Search Facilitators"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <ul className="gc-picks">
              {facis
                .filter((f) => faciName(f).toLowerCase().includes(search.trim().toLowerCase()))
                .sort((a, b) => {
                  // Picked first, then Facis with no group, then those in another group.
                  const rank = (f: Faci) => (picked.includes(f.id) ? 0 : f.group_id == null ? 1 : 2);
                  return rank(a) - rank(b) || faciName(a).localeCompare(faciName(b));
                })
                .map((f) => {
                  const on = picked.includes(f.id);
                  const elsewhere = f.group_id != null && f.group_id !== editing.id ? groupLabel(f.group_id) : null;
                  return (
                    <li key={f.id}>
                      <label className={cn("gc-pick", elsewhere && !on && "is-elsewhere")}>
                        <input
                          type="checkbox"
                          className="gc-sr"
                          checked={on}
                          onChange={() => setPicked((cur) => (on ? cur.filter((id) => id !== f.id) : [...cur, f.id]))}
                        />
                        <span className="gc-box" aria-hidden>{on && <Check size={14} />}</span>
                        <span className="gc-pick-name">{faciName(f)}</span>
                        {elsewhere && <small>{on ? `moves from ${elsewhere}` : `in ${elsewhere}`}</small>}
                      </label>
                    </li>
                  );
                })}
              {facis.length === 0 && <li className="gc-empty">No Facilitators yet.</li>}
            </ul>
            <button type="button" className="gc-btn gc-btn-primary" disabled={busy} onClick={saveFacis}>
              Save / {picked.length} selected
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}
