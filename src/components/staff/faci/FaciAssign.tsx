"use client";

import { Check, History, Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { groupSwatch } from "@/components/freshie/groupTheme";
import { GroupBadge } from "@/components/GroupBadge";
import "@/components/staff/game/game-control.css";
import { Sheet, StatusLine, useStatus } from "@/components/staff/game/parts";
import { Card } from "@/components/ui";
import { clock } from "@/lib/faciLocation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Group } from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

// Ops → Facilitators (HOF and Admin): which Facilitators belong to each group.
// One row per group with its Facilitators; Edit opens a picker (search, picked
// first, a Faci already in another group says so and moves when saved), saved
// with fn_admin_set_group_facis (HOF + Admin, `is_faci_lead()`, migration
// 0080). The clock icon shows the group's recent Faci-related changes. The
// group's headcount, location, name, slogan and password are the other Ops tabs.

type Faci = { id: string; full_name: string | null; group_id: number | null };
type Change = { id: number; actor: string | null; action: string; detail: Record<string, unknown>; created_at: string };

// Faci-related changes recorded against a group (target "group:<id>").
const CHANGE_LABELS: Record<string, string> = {
  "group.faci_set": "Facilitators changed",
  "headcount.set": "Headcount saved",
  "headcount.clear": "Headcount cleared",
  "faci_location.edit": "Location corrected",
};

const faciName = (f: Faci | undefined) => f?.full_name || "Unnamed";

export function FaciAssign() {
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

  const byId = useMemo(() => Object.fromEntries(facis.map((f) => [f.id, f])), [facis]);
  const facisOf = (groupId: number) => facis.filter((f) => f.group_id === groupId);
  const groupLabel = (id: number | null) => groups.find((g) => g.id === id)?.name ?? `Group ${id}`;
  const assigned = facis.filter((f) => f.group_id != null).length;

  function openFacis(g: Group) {
    setPicked(facisOf(g.id).map((f) => f.id));
    setSearch("");
    setEditing(g);
  }

  async function saveFacis() {
    if (!editing) return;
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
      <p className="mb-2 text-sm text-ink-faint">
        {assigned} of {facis.length} Facilitators are in a group.
      </p>
      <StatusLine error={error} notice={notice} />
      <Card className="divide-y divide-paper-200 p-0">
        {groups.map((g) => {
          const own = facisOf(g.id);
          return (
            <div key={g.id} className="flex items-center gap-3 px-4 py-3">
              <GroupBadge id={g.id} color={groupSwatch(g.id, g.color)} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{g.display_name?.trim() || g.name}</p>
                <p className="text-sm text-ink-faint">
                  {own.length ? own.map((f) => faciName(f)).join(", ") : "No Facilitator yet"}
                </p>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-faint hover:text-ink"
                aria-label={`${g.name} recent changes`}
                title="Recent changes"
                onClick={() => setHistoryOf(g)}
              >
                <History size={17} aria-hidden />
              </button>
              <button
                type="button"
                className="btn-secondary min-h-[40px] shrink-0 px-3 text-xs"
                aria-label={`Edit ${g.name}'s Facilitators`}
                onClick={() => openFacis(g)}
              >
                <Pencil size={14} aria-hidden />
                Edit
              </button>
            </div>
          );
        })}
        {groups.length === 0 && <p className="px-4 py-3 text-sm text-ink-faint">No groups yet.</p>}
      </Card>

      <Sheet open={historyOf !== null} onClose={() => setHistoryOf(null)} title={historyOf ? `Recent changes · ${historyOf.name}` : "Recent changes"}>
        {historyOf && <GroupChanges groupId={historyOf.id} names={byId} />}
      </Sheet>

      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing ? `Facilitators · ${editing.name}` : "Facilitators"}>
        {editing && (
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
              Save · {picked.length} selected
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}

/** The group's recent Faci-related changes from the audit log, loaded when the sheet opens. */
function GroupChanges({ groupId, names }: { groupId: number; names: Record<string, Faci> }) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [rows, setRows] = useState<Change[] | null>(null);
  const [actors, setActors] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("audit_log")
        .select("id, actor, action, detail, created_at")
        .eq("target", `group:${groupId}`)
        .in("action", Object.keys(CHANGE_LABELS))
        .order("created_at", { ascending: false })
        .limit(8);
      const list = (data as Change[]) ?? [];
      const ids = [...new Set(list.map((r) => r.actor).filter((a): a is string => !!a))];
      const { data: people } = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [] };
      if (!active) return;
      setActors(Object.fromEntries(((people as { id: string; full_name: string | null }[]) ?? []).map((p) => [p.id, p.full_name || "Someone"])));
      setRows(list);
    })();
    return () => {
      active = false;
    };
  }, [supabase, groupId]);

  const what = (r: Change) => {
    if (r.action === "group.faci_set" && Array.isArray(r.detail.user_ids)) {
      const ids = r.detail.user_ids as string[];
      return ids.length ? ids.map((id) => faciName(names[id])).join(", ") : "none";
    }
    if (r.action === "headcount.set") {
      const after = r.detail.after as { total?: number } | undefined;
      return after?.total != null ? `${after.total} people` : "";
    }
    return "";
  };

  if (rows === null) return <p className="gc-muted">Loading…</p>;
  if (rows.length === 0) return <p className="gc-muted">No changes yet.</p>;
  return (
    <ul className="gc-hist">
      {rows.map((r) => (
        <li key={r.id}>
          <span>
            {CHANGE_LABELS[r.action] ?? r.action}
            {what(r) && <em> · {what(r)}</em>}
          </span>
          <small>{(r.actor && actors[r.actor]) || "System"} · {clock(r.created_at)}</small>
        </li>
      ))}
    </ul>
  );
}
