"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Card } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn, friendlyError } from "@/lib/utils";

import type { TabProps } from "./TypesTab";

// Group-wide blind box settings, plus the test reset. The cap is the most
// boxes any one group can open in total (across every seller); "one per
// seller" is fixed.
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function SettingsTab({ data, onError, onNotice }: TabProps) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [cap, setCap] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState("");
  // Default on: put each group's tokens back so repeated test runs don't drift.
  const [putBack, setPutBack] = useState(true);
  const value = cap ?? String(data.cap);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 1 || n > 50) {
      return onError("Enter a number from 1 to 50.");
    }
    setBusy(true);
    onError(null);
    const { error } = await supabase.rpc("fn_set_config", {
      p_key: "blindbox_group_cap",
      p_value: n,
    });
    setBusy(false);
    if (error) return onError(friendlyError(error));
    onNotice("Saved.");
    setCap(null);
    data.reload();
  }

  // What a reset would do, from the data already on screen.
  const preview = useMemo(() => {
    const net = new Map<number, number>();
    for (const c of data.claims) {
      net.set(c.group_id, (net.get(c.group_id) ?? 0) + (c.tokens - c.price));
    }
    return {
      claims: data.claims.length,
      groups: net.size,
      assignments: data.assignments.length,
      types: data.types.length,
    };
  }, [data.claims, data.assignments, data.types]);

  const unlocked = data.rehearsal;
  const confirmed = confirm === "RESET";

  async function reset(scope: "openings" | "all") {
    if (!unlocked || !confirmed) return;
    setBusy(true);
    onError(null);
    // p_refund_tokens is only sent when unchecked, so the default (checked)
    // call is the same as before migration 0057.
    const { data: res, error } = await supabase.rpc("fn_bb_reset", {
      p_scope: scope,
      p_confirm: confirm,
      ...(putBack ? {} : { p_refund_tokens: false }),
    });
    setBusy(false);
    if (error) return onError(friendlyError(error));
    const r = res as { claims: number; groups: number; clamped: number; tokens_put_back?: boolean };
    const tokens =
      r.tokens_put_back === false
        ? "tokens left as they are"
        : `tokens put back for ${plural(r.groups, "group", "groups")}${r.clamped ? ` (${r.clamped} could only be partly put back: they had spent the tokens)` : ""}`;
    onNotice(
      scope === "all"
        ? `Everything reset: openings, assignments and box types are cleared; ${tokens}.`
        : `Restored: ${plural(r.claims, "opened box", "opened boxes")} back to unopened; ${tokens}.`
    );
    setConfirm("");
    data.reload();
  }

  return (
    <div className="space-y-4">
      <Card className="max-w-xl space-y-3">
        <h2 className="font-semibold">Limits per group</h2>
        <form onSubmit={save} className="space-y-3">
          <div>
            <label className="label text-xs" htmlFor="bb-cap">
              Most blind boxes one group can open in total
            </label>
            <input
              id="bb-cap"
              type="number"
              min="1"
              max="50"
              required
              className="input w-32"
              value={value}
              onChange={(e) => setCap(e.target.value)}
            />
          </div>
          <p className="text-xs text-ink-faint">
            Counts every box type and every seller. Right now{" "}
            <b>{data.overview.groupsAtCap}</b> group
            {data.overview.groupsAtCap === 1 ? " has" : "s have"} reached the cap.
            Raising it lets those groups open more straight away.
          </p>
          <button disabled={busy} type="submit" className="btn-primary">
            Save
          </button>
        </form>
        <hr className="border-paper-200" />
        <p className="text-sm text-ink-faint">
          Also fixed: a group can open <b>one</b> box per seller, and a station
          counts as one seller however many GMs share it. To pause every blind
          box at once, use the &quot;Disable blind box&quot; kill-switch in{" "}
          <Link href="/admin" className="underline">
            Live control
          </Link>
          .
        </p>
      </Card>

      <Card className="max-w-xl space-y-3 border-red-200">
        <h2 className="font-semibold text-red-700">Reset for testing</h2>
        {!unlocked ? (
          <p className="rounded-md bg-paper-200 px-3 py-2 text-sm">
            Locked. The reset only works while <b>Rehearsal mode</b> is on, so
            it can&apos;t be used by accident during the event. Turn it on in{" "}
            <Link href="/admin" className="underline">
              Live control
            </Link>
            .
          </p>
        ) : (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Rehearsal mode is on. Don&apos;t let anyone open a box while you
            reset.
          </p>
        )}

        <ul className="space-y-2 text-sm text-ink-faint">
          <li>
            <b className="text-ink">Restore boxes</b>: {plural(preview.claims, "opened box goes", "opened boxes go")}{" "}
            back to unopened, so every seller has their full assigned number
            again. The groups&apos; opens are cleared, so they can open again.
            Box types, assignments and QR codes stay.
          </li>
          <li>
            <b className="text-ink">Reset everything</b>: does that, then also
            deletes {plural(preview.assignments, "assignment", "assignments")} and{" "}
            {plural(preview.types, "box type", "box types")}. QR codes stop
            working for good.
          </li>
        </ul>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={putBack}
            disabled={!unlocked}
            onChange={(e) => setPutBack(e.target.checked)}
          />
          <span>
            <b className="text-ink">Also put the groups&apos; tokens back</b>
            <span className="block text-xs text-ink-faint">
              {putBack
                ? `Each of the ${plural(preview.groups, "group", "groups")} with opened boxes gets back what it paid and won (a group that has already spent the tokens gets back what its balance allows).`
                : "Group balances and the token log stay exactly as they are. Only the openings are cleared."}
            </span>
          </span>
        </label>

        <div>
          <label
            className="mb-1 block text-xs font-semibold text-ink-faint"
            htmlFor="bb-reset-confirm"
          >
            Type RESET to enable the buttons
          </label>
          <input
            id="bb-reset-confirm"
            className="input w-40"
            autoComplete="off"
            value={confirm}
            disabled={!unlocked}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !unlocked || !confirmed}
            onClick={() => reset("openings")}
            className={cn(
              "btn border border-red-300 bg-white text-red-700",
              (!unlocked || !confirmed) && "opacity-50"
            )}
          >
            Restore boxes
          </button>
          <button
            type="button"
            disabled={busy || !unlocked || !confirmed}
            onClick={() => reset("all")}
            className={cn(
              "btn bg-red-600 text-white",
              (!unlocked || !confirmed) && "opacity-50"
            )}
          >
            Reset everything
          </button>
        </div>
      </Card>
    </div>
  );
}
