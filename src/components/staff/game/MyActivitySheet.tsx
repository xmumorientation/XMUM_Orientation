"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import { groupSwatch } from "@/components/freshie/groupTheme";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";

import { Sheet } from "./parts";

// A GM's own token changes (token_transactions they made: the "actor reads
// own transactions" policy, 0002), newest first, in a sheet on the Station
// page. Group names and colours come from the page (a GM reads them with
// fn_scoreboard, not the groups table). Rows sit under their calendar date
// and keep the reason as written ("Day 1 station win"), so the GM can tell the
// two days' stations apart. An undone row is marked Undone; the undo itself is
// a row of its own.

type Row = { id: number; group_id: number; delta: number; reason: string; reversed_by: number | null; created_at: string };
type GroupLite = { id: number; name: string; color: string | null };

const LIMIT = 50;

const dayOf = (iso: string) =>
  new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function MyActivitySheet({
  open,
  onClose,
  userId,
  groups,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  groups: GroupLite[];
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Read fresh each time it opens.
  useEffect(() => {
    if (!open) return;
    let active = true;
    setRows(null);
    setError(null);
    supabase
      .from("token_transactions")
      .select("id, group_id, delta, reason, reversed_by, created_at")
      .eq("actor", userId)
      .order("created_at", { ascending: false })
      .limit(LIMIT)
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err) setError(friendlyError(err));
        else setRows((data ?? []) as Row[]);
      });
    return () => {
      active = false;
    };
  }, [open, supabase, userId]);

  return (
    <Sheet open={open} onClose={onClose} title="My Activity">
      <div className="gc-form">
        <p className="gc-muted">Token changes you made, newest first{rows && rows.length === LIMIT ? ` (last ${LIMIT})` : ""}.</p>
        {error ? (
          <p className="gc-muted" role="alert">Could not load your activity: {error}</p>
        ) : rows === null ? (
          <p className="gc-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="gc-empty">Nothing yet.</p>
        ) : (
          <ul className="gc-list gc-act">
            {rows.map((r, i) => {
              const g = groups.find((x) => x.id === r.group_id);
              const day = dayOf(r.created_at);
              return (
                <Fragment key={r.id}>
                  {(i === 0 || dayOf(rows[i - 1].created_at) !== day) && <li className="gc-act-day">{day}</li>}
                  <li data-undone={r.reversed_by ? "" : undefined}>
                    <i className="gc-swatch" style={{ background: groupSwatch(r.group_id, g?.color ?? null) }} aria-hidden />
                    <span className="gc-act-what">
                      <b>{g?.name ?? `Group ${r.group_id}`}</b>
                      <small>
                        {r.reason || "Token change"} / {timeOf(r.created_at)}
                      </small>
                    </span>
                    {r.reversed_by && <span className="gc-chip">Undone</span>}
                    <b className="gc-act-delta" data-sign={r.delta > 0 ? "plus" : "minus"}>
                      {r.delta > 0 ? "+" : ""}
                      {r.delta}
                    </b>
                  </li>
                </Fragment>
              );
            })}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
