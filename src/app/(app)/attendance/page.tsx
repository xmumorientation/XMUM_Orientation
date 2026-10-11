"use client";

import { useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { Card, ErrorBanner, PageTitle, Spinner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";

export default function AttendancePage() {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [headcount, setHeadcount] = useState("");
  const [savedHeadcount, setSavedHeadcount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile.group_id) {
      setLoading(false);
      return;
    }
    let active = true;
    async function loadHeadcount() {
      const { data: hc } = await supabase
        .from("group_headcounts")
        .select("headcount")
        .eq("group_id", profile.group_id!)
        .maybeSingle();
      if (!active) return;
      const count = (hc as { headcount: number } | null)?.headcount ?? null;
      setSavedHeadcount(count);
      setHeadcount(count == null ? "" : String(count));
      setLoading(false);
    }
    loadHeadcount();
    return () => {
      active = false;
    };
  }, [supabase, profile.group_id]);

  async function submitHeadcount(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const countVal = parseInt(headcount, 10);
    const { error: rpcError } = await supabase.rpc("fn_set_headcount", {
      p_count: countVal,
    });
    setSaving(false);
    if (rpcError) setError(friendlyError(rpcError));
    else setSavedHeadcount(countVal);
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
          <h2 className="mb-1 font-semibold">Group headcount</h2>
          <p className="mb-3 text-xs text-ink-faint">Enter the number of people with your group. You can change it any time.</p>
          <form onSubmit={submitHeadcount} className="flex gap-2">
            <input
              type="number"
              min="0"
              required
              className="input flex-1"
              placeholder="e.g. 24"
              value={headcount}
              onChange={(e) => setHeadcount(e.target.value)}
            />
            <button type="submit" disabled={saving} className="btn-secondary px-5">
              Save
            </button>
          </form>
          {savedHeadcount !== null && (
            <p className="mt-2 text-xs text-ink-soft">
              Saved headcount: <span className="font-semibold text-ink">{savedHeadcount}</span>
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
