"use client";

import { useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { Card, ErrorBanner, PageTitle, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";

type Saved = { headcount: number; local_count: number | null; international_count: number | null };

export default function AttendancePage() {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [total, setTotal] = useState("");
  const [local, setLocal] = useState("");
  const [international, setInternational] = useState("");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const groupId = profile.group_id;

  useEffect(() => {
    if (!groupId) {
      setLoading(false);
      return;
    }
    let active = true;
    async function loadHeadcount() {
      const { data: hc } = await supabase
        .from("group_headcounts")
        .select("headcount, local_count, international_count")
        .eq("group_id", groupId!)
        .maybeSingle();
      if (!active) return;
      const row = hc as Saved | null;
      setSaved(row);
      setTotal(row ? String(row.headcount) : "");
      setLocal(row?.local_count == null ? "" : String(row.local_count));
      setInternational(row?.international_count == null ? "" : String(row.international_count));
      setLoading(false);
    }
    loadHeadcount();
    const channel = supabase
      .channel(`attendance-headcount-${groupId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_headcounts", filter: `group_id=eq.${groupId}` },
        loadHeadcount
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, groupId]);

  const optional = (v: string) => (v === "" ? null : parseInt(v, 10));
  const split =
    optional(local) !== null && optional(international) !== null
      ? (optional(local) as number) + (optional(international) as number)
      : null;
  const mismatch = split !== null && total !== "" && split !== parseInt(total, 10);

  async function submitHeadcount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const row: Saved = {
      headcount: parseInt(total, 10),
      local_count: optional(local),
      international_count: optional(international),
    };
    const { error: rpcError } = await supabase.rpc("fn_set_headcount", {
      p_count: row.headcount,
      p_local: row.local_count,
      p_international: row.international_count,
    });
    setSaving(false);
    if (rpcError) setError(friendlyError(rpcError));
    else setSaved(row);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Attendance" subtitle="How many people are in your group" />
      <ErrorBanner message={error} />

      {profile.group_id && (
        <Card>
          <h2 className="mb-1 font-semibold">Group Headcount</h2>
          <p className="mb-3 text-xs text-ink-faint">Enter the number of people with your group. Total is required; Local and International are optional. You can change it any time.</p>
          <form onSubmit={submitHeadcount} className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Local", value: local, set: setLocal, required: false },
                { label: "International", value: international, set: setInternational, required: false },
                { label: "Total", value: total, set: setTotal, required: true },
              ].map((f) => (
                <label key={f.label} className="block text-xs font-semibold text-ink-soft">
                  {f.label}
                  <input
                    type="number"
                    min="0"
                    required={f.required}
                    className="input mt-1 w-full"
                    placeholder={f.required ? "e.g. 24" : "optional"}
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                  />
                </label>
              ))}
            </div>
            {mismatch && (
              <p className="text-xs text-amber-600">
                Local + International = {split}, which differs from Total. You can still save.
              </p>
            )}
            <button type="submit" disabled={saving} className="btn-secondary px-5">
              Save
            </button>
          </form>
          {saved && (
            <p className="mt-2 text-xs text-ink-soft">
              Saved: Local <span className="font-semibold text-ink">{saved.local_count ?? "—"}</span> /
              International <span className="font-semibold text-ink">{saved.international_count ?? "—"}</span> /
              Total <span className="font-semibold text-ink">{saved.headcount}</span>
            </p>
          )}
        </Card>
      )}

      {!profile.group_id && (
        <Card>
          <p className="text-sm text-ink-faint">Your account is not in a group, so there is no headcount to record.</p>
        </Card>
      )}
    </div>
  );
}
