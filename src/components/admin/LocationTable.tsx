"use client";

import { ChevronDown } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

import { Card, ErrorBanner, Spinner, SuccessBanner } from "@/components/ui";
import { withCurrent, useLocationOptions } from "@/components/useLocationOptions";
import {
  DETAILS_MAX,
  LOC_STATUSES,
  OTHER_TEXT_MAX,
  clock,
  describeLocation,
  type FaciLocation,
  type LocStatus,
} from "@/lib/faciLocation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Group } from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

type Draft = { status: LocStatus; other: string; building: string; details: string };

// Each group's manual location update (migrations 0073-0076): a status, a
// building and an optional comment, sent by any Facilitator in the group. Text
// only, no GPS. The group shares one latest update; Admin corrects it with the
// controls below (marked "edited" and audited). Earlier updates are history.
// A table from md up, one card per group on a phone.
export function LocationTable() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { names } = useLocationOptions();
  const [groups, setGroups] = useState<Group[]>([]);
  const [locs, setLocs] = useState<FaciLocation[]>([]);
  const [senders, setSenders] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [openHistory, setOpenHistory] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [g, l, f] = await Promise.all([
      supabase.from("groups").select("*").order("id"),
      supabase
        .from("faci_location_updates")
        .select("id, user_id, group_id, status, other_text, building, details, created_at, edited_by, edited_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1000),
      supabase.from("profiles").select("id, full_name").eq("role", "faci"),
    ]);
    setGroups((g.data as Group[]) ?? []);
    setLocs((l.data as FaciLocation[]) ?? []);
    setSenders(Object.fromEntries(((f.data as { id: string; full_name: string | null }[]) ?? []).map((x) => [x.id, x.full_name || "Facilitator"])));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`admin-location-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "faci_location_updates" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2500);
  }

  const dropDraft = (groupId: number) =>
    setDrafts((d) => {
      const next = { ...d };
      delete next[groupId];
      return next;
    });

  async function save(entry: FaciLocation, draft: Draft) {
    if (draft.status === "other" && !draft.other.trim()) return setError("Type the status for Other.");
    setSavingId(entry.id);
    setError(null);
    const { error: rpcError } = await supabase.rpc("fn_admin_edit_faci_location", {
      p_id: entry.id,
      p_status: draft.status,
      p_other_text: draft.status === "other" ? draft.other : null,
      p_building: draft.building,
      p_details: draft.details,
    });
    setSavingId(null);
    if (rpcError) return setError(friendlyError(rpcError));
    dropDraft(entry.group_id);
    flash("Location saved.");
    load();
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  const rows = groups.map((g) => {
    const list = locs.filter((l) => l.group_id === g.id);
    const latest = list[0];
    const draft = drafts[g.id];
    const shown: Draft | null = latest
      ? (draft ?? { status: latest.status, other: latest.other_text ?? "", building: latest.building, details: latest.details ?? "" })
      : null;
    return { g, latest, draft, shown, history: list.slice(1) };
  });

  const sentLine = (l: FaciLocation) => (
    <>
      <span className="tabular-nums">{clock(l.created_at)}</span> by {senders[l.user_id] ?? "a Facilitator"}
      {l.edited_at && (
        <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">edited</span>
      )}
    </>
  );

  const historyList = (g: Group, history: FaciLocation[]) => (
    <>
      <p className="mb-1 font-semibold">{g.name} history</p>
      <ul className="space-y-1">
        {history.map((h) => (
          <li key={h.id}>
            <span className="tabular-nums">{clock(h.created_at)}</span> {describeLocation(h)}
            {h.details ? `, "${h.details}"` : ""}, {senders[h.user_id] ?? "a Facilitator"}
            {h.edited_at ? " (edited)" : ""}
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <div className="space-y-3">
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      {/* Phone: one card per group */}
      <div className="space-y-2 md:hidden">
        {rows.map(({ g, latest, draft, shown, history }) => (
          <Card key={g.id} className="space-y-3 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-semibold">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: g.color || "#008CFF" }} aria-hidden />
                {g.name}
              </span>
              {latest && !draft && <span className="text-xs text-ink-faint">{sentLine(latest)}</span>}
            </div>
            {latest && shown ? (
              <>
                <Fields
                  name={g.name}
                  draft={shown}
                  highlight={!!draft}
                  disabled={savingId === latest.id}
                  buildings={withCurrent(names, shown.building)}
                  large
                  onChange={(next) => setDrafts((d) => ({ ...d, [g.id]: next }))}
                />
                {draft ? (
                  <div className="flex gap-2">
                    <button type="button" className="btn-primary min-h-[44px] flex-1" disabled={savingId === latest.id} onClick={() => save(latest, draft)}>
                      {savingId === latest.id ? "Saving" : "Save"}
                    </button>
                    <button type="button" className="btn-secondary min-h-[44px] flex-1" onClick={() => dropDraft(g.id)}>
                      Undo
                    </button>
                  </div>
                ) : (
                  history.length > 0 && (
                    <button
                      type="button"
                      className="flex min-h-[36px] items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline"
                      aria-expanded={openHistory === g.id}
                      onClick={() => setOpenHistory(openHistory === g.id ? null : g.id)}
                    >
                      History ({history.length})
                      <ChevronDown size={12} className={cn("transition", openHistory === g.id && "rotate-180")} />
                    </button>
                  )
                )}
                {openHistory === g.id && history.length > 0 && (
                  <div className="rounded-lg bg-paper-100 p-2 text-xs text-ink-faint">{historyList(g, history)}</div>
                )}
              </>
            ) : (
              <p className="text-sm text-ink-faint">No location update yet</p>
            )}
          </Card>
        ))}
      </div>

      {/* md and up: a table */}
      <Card className="hidden overflow-x-auto p-0 md:block">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-paper-200 text-xs font-bold text-ink-faint">
              <th className="px-4 py-3">Group</th>
              <th className="px-3 py-3">Location</th>
              <th className="px-3 py-3">Sent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-paper-200">
            {rows.map(({ g, latest, draft, shown, history }) => (
              <Fragment key={g.id}>
                <tr>
                  <td className="px-4 py-2 align-top">
                    <span className="flex items-center gap-2 whitespace-nowrap pt-1 font-medium">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: g.color || "#008CFF" }} aria-hidden />
                      {g.name}
                    </span>
                  </td>
                  {latest && shown ? (
                    <>
                      <td className="px-3 py-2">
                        <Fields
                          name={g.name}
                          draft={shown}
                          highlight={!!draft}
                          disabled={savingId === latest.id}
                          buildings={withCurrent(names, shown.building)}
                          onChange={(next) => setDrafts((d) => ({ ...d, [g.id]: next }))}
                        />
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-ink-faint">
                        {draft ? (
                          <div className="flex gap-2">
                            <button type="button" className="btn-primary min-h-[36px] px-3 text-xs" disabled={savingId === latest.id} onClick={() => save(latest, draft)}>
                              {savingId === latest.id ? "..." : "Save"}
                            </button>
                            <button type="button" className="btn-secondary min-h-[36px] px-3 text-xs" onClick={() => dropDraft(g.id)}>
                              Undo
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="pt-1">{sentLine(latest)}</div>
                            {history.length > 0 && (
                              <button
                                type="button"
                                className="mt-1 flex items-center gap-1 font-semibold underline-offset-2 hover:underline"
                                aria-expanded={openHistory === g.id}
                                onClick={() => setOpenHistory(openHistory === g.id ? null : g.id)}
                              >
                                History ({history.length})
                                <ChevronDown size={12} className={cn("transition", openHistory === g.id && "rotate-180")} />
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </>
                  ) : (
                    <td colSpan={2} className="px-3 py-3 text-xs text-ink-faint">
                      No location update yet
                    </td>
                  )}
                </tr>
                {openHistory === g.id && history.length > 0 && (
                  <tr className="bg-paper-100">
                    <td colSpan={3} className="px-4 py-2 text-xs text-ink-faint">
                      {historyList(g, history)}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// Status and building on one line, the typed status (for Other) and the
// optional details under them. `large` gives phone-sized touch targets.
function Fields({
  name,
  draft,
  highlight,
  disabled,
  buildings,
  large = false,
  onChange,
}: {
  name: string;
  draft: Draft;
  highlight: boolean;
  disabled: boolean;
  buildings: string[];
  large?: boolean;
  onChange: (next: Draft) => void;
}) {
  const size = large ? "min-h-[44px] text-base" : "min-h-[36px] text-sm";
  const ring = highlight && "ring-2 ring-amber-400";
  return (
    <div className={cn("flex flex-col gap-1.5", large ? "w-full" : "w-64")}>
      <div className="grid grid-cols-2 gap-1.5">
        <select
          className={cn("input min-w-0 px-2", size, ring)}
          aria-label={`${name} location status`}
          value={draft.status}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, status: e.target.value as LocStatus })}
        >
          {LOC_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          className={cn("input min-w-0 px-2", size, ring)}
          aria-label={`${name} location building`}
          value={draft.building}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, building: e.target.value })}
        >
          {buildings.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>
      {draft.status === "other" && (
        <input
          className={cn("input w-full", size, ring)}
          aria-label={`${name} typed location status`}
          maxLength={OTHER_TEXT_MAX}
          placeholder="Typed status"
          value={draft.other}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, other: e.target.value })}
        />
      )}
      <input
        className={cn("input w-full", size, ring)}
        aria-label={`${name} location details`}
        maxLength={DETAILS_MAX}
        placeholder="Details (optional)"
        value={draft.details}
        disabled={disabled}
        onChange={(e) => onChange({ ...draft, details: e.target.value })}
      />
    </div>
  );
}
