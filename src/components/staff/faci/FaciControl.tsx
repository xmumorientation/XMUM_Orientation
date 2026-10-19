"use client";

import { Check, ChevronDown, History, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { groupSwatch } from "@/components/freshie/groupTheme";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import "@/components/staff/game/game-control.css";
import { Sheet, StatusLine, useStatus } from "@/components/staff/game/parts";
import { clock, describeLocation, type FaciLocation } from "@/lib/faciLocation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Group } from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

// HOF's Ops page (/committee): Faci control, in the same look as HOGM's Game
// control. One folding card per group, Group 1 to the last: name and slogan,
// Facilitators, headcount, latest location update and recent changes. The
// only thing HOF changes here is which Facilitators belong to the group
// (fn_admin_set_group_facis, HOF + Admin since migration 0080). Everything
// else is read through Committee-tier policies.

type Faci = { id: string; full_name: string | null; group_id: number | null };
type Headcount = {
  group_id: number;
  headcount: number;
  local_count: number | null;
  international_count: number | null;
  updated_at: string | null;
};
type Change = { id: number; actor: string | null; action: string; detail: Record<string, unknown>; created_at: string };

// Faci-related changes recorded against a group (target "group:<id>").
const CHANGE_LABELS: Record<string, string> = {
  "group.faci_set": "Facilitators changed",
  "headcount.set": "Headcount saved",
  "headcount.clear": "Headcount cleared",
  "faci_location.edit": "Location corrected",
};
const LOC_TONE = { arrived: "ok", heading_to: "warn", other: "live" } as const;

const faciName = (f: Faci | undefined) => f?.full_name || "Unnamed";
const ago = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  return clock(iso);
};

export function FaciControl() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { error, setError, notice, flash } = useStatus();
  const [groups, setGroups] = useState<Group[]>([]);
  const [facis, setFacis] = useState<Faci[]>([]);
  const [counts, setCounts] = useState<Record<number, Headcount>>({});
  const [locs, setLocs] = useState<FaciLocation[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Group | null>(null);
  const [historyOf, setHistoryOf] = useState<Group | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [g, f, h, l] = await Promise.all([
      supabase.from("groups").select("id, name, color, display_name, slogan, token_balance").order("id"),
      supabase.from("profiles").select("id, full_name, group_id").eq("role", "faci").order("full_name"),
      supabase.from("group_headcounts").select("group_id, headcount, local_count, international_count, updated_at"),
      supabase
        .from("faci_location_updates")
        .select("id, user_id, group_id, status, other_text, building, details, created_at, edited_by, edited_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1000),
    ]);
    const failed = g.error ?? f.error ?? h.error ?? l.error;
    if (failed) setError(friendlyError(failed));
    setGroups((g.data as Group[]) ?? []);
    setFacis((f.data as Faci[]) ?? []);
    setCounts(Object.fromEntries(((h.data as Headcount[]) ?? []).map((r) => [r.group_id, r])));
    setLocs((l.data as FaciLocation[]) ?? []);
  }, [supabase, setError]);

  useEffect(() => {
    load();
    // One channel per table: a table missing from the realtime publication
    // fails only its own channel, not the others. The page also reloads when
    // the tab comes back into view, in case an event was missed meanwhile.
    const channels = ["groups", "profiles", "group_headcounts", "faci_location_updates"].map((table) =>
      supabase
        .channel(`fc-${table}-${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "*", schema: "public", table }, load)
        .subscribe()
    );
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", load);
    return () => {
      channels.forEach((c) => supabase.removeChannel(c));
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", load);
    };
  }, [supabase, load]);

  const byId = useMemo(() => Object.fromEntries(facis.map((f) => [f.id, f])), [facis]);
  const facisOf = (groupId: number) => facis.filter((f) => f.group_id === groupId);
  const locsOf = (groupId: number) => locs.filter((l) => l.group_id === groupId);
  const groupLabel = (id: number | null) => groups.find((g) => g.id === id)?.name ?? `Group ${id}`;

  const totals = Object.values(counts).reduce(
    (t, c) => ({
      all: t.all + (c.headcount ?? 0),
      local: t.local + (c.local_count ?? 0),
      intl: t.intl + (c.international_count ?? 0),
    }),
    { all: 0, local: 0, intl: 0 }
  );
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
    <div className={cn("gc", vxDisplay.variable, vxSlab.variable)}>
      <div className="gc-bg" aria-hidden>
        <i className="gc-orb gc-orb-navy" />
        <i className="gc-orb gc-orb-pink" />
      </div>

      <header className="gc-top">
        <h1 className="gc-title gc-title-holo">OPS</h1>
        <p className="gc-sub">
          <i aria-hidden />
          Faci control · <b>Groups</b>
        </p>
      </header>

      <div className="gc-stack">
        <dl className="gc-stats">
          <div><dt>People</dt><dd>{totals.all}</dd></div>
          <div><dt>Local</dt><dd>{totals.local}</dd></div>
          <div><dt>International</dt><dd>{totals.intl}</dd></div>
          <div><dt>Facis in a group</dt><dd>{assigned}<small>/{facis.length}</small></dd></div>
        </dl>
        <StatusLine error={error} notice={notice} />

        <ul className="gc-list">
          {groups.map((g) => {
            const open = openId === g.id;
            const own = facisOf(g.id);
            const hc = counts[g.id];
            const [latest, ...older] = locsOf(g.id);
            return (
              <li key={g.id} className="gc-card gc-fold" data-open={open || undefined}>
                <button
                  type="button"
                  className="gc-fold-head"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? null : g.id)}
                >
                  <i className="gc-swatch" style={{ background: groupSwatch(g.id, g.color) }} aria-hidden />
                  <span className="gc-fold-name">
                    {g.name}
                    <small>
                      {g.display_name || "No name yet"} · {hc ? `${hc.headcount} people` : "no headcount"}
                    </small>
                  </span>
                  <span className="gc-chip" data-tone={latest ? LOC_TONE[latest.status] : "off"}>
                    {latest ? latest.building : "No update"}
                  </span>
                  <ChevronDown size={18} aria-hidden className="gc-fold-chev" />
                </button>
                {open && (
                  <div className="gc-fold-body">
                    <div className="gc-fold-top">
                      <dl className="gc-facts">
                        <div><dt>Name</dt><dd>{g.display_name || "—"}</dd></div>
                        <div><dt>Slogan</dt><dd>{g.slogan || "—"}</dd></div>
                      </dl>
                      <button
                        type="button"
                        className="gc-icon"
                        aria-label={`${g.name} recent changes`}
                        title="Recent changes"
                        onClick={() => setHistoryOf(g)}
                      >
                        <History size={17} aria-hidden />
                      </button>
                    </div>

                    <button type="button" className="gc-gms" onClick={() => openFacis(g)}>
                      <Users size={16} aria-hidden />
                      <span>{own.length ? own.map((f) => faciName(f)).join(", ") : "No Facilitator yet"}</span>
                      <b>Edit</b>
                    </button>

                    <dl className="gc-facts">
                      <div><dt>Local</dt><dd>{hc?.local_count ?? "—"}</dd></div>
                      <div><dt>International</dt><dd>{hc?.international_count ?? "—"}</dd></div>
                      <div><dt>Total</dt><dd>{hc?.headcount ?? "—"}</dd></div>
                      <div><dt>Counted</dt><dd>{hc?.updated_at ? ago(hc.updated_at) : "—"}</dd></div>
                    </dl>

                    <section className="gc-sub-block" aria-label={`${g.name} location`}>
                      <h3 className="gc-eyebrow">Location</h3>
                      {latest ? (
                        <div className="gc-loc">
                          <b>{describeLocation(latest)}</b>
                          {latest.details && <p>{latest.details}</p>}
                          <small>
                            {faciName(byId[latest.user_id])} · {ago(latest.created_at)}
                            {latest.edited_at && " · edited by Admin"}
                          </small>
                        </div>
                      ) : (
                        <p className="gc-muted">No location update yet.</p>
                      )}
                      {older.length > 0 && (
                        <details className="gc-more">
                          <summary>Earlier updates ({older.length})</summary>
                          <ul className="gc-hist">
                            {older.slice(0, 10).map((l) => (
                              <li key={l.id}>
                                <span>{describeLocation(l)}</span>
                                <small>{faciName(byId[l.user_id])} · {clock(l.created_at)}</small>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </section>
                  </div>
                )}
              </li>
            );
          })}
          {groups.length === 0 && <li className="gc-empty">No groups yet.</li>}
        </ul>
      </div>

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
    </div>
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
