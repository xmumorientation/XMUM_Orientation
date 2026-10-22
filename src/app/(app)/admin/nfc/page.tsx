"use client";

import { TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { Card, ErrorBanner, PageTitle } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  PROJECTOR_LABELS,
  PROJECTOR_LOCATIONS,
  type ProjectorLocation,
} from "@/lib/types";
import { cn } from "@/lib/utils";

interface NfcTokenRow {
  id: number;
  location: ProjectorLocation;
  label: string;
  used_at: string | null;
  used_by_group: number | null;
  created_at: string;
  test_run_id: string | null;
}

interface NfcTestRun {
  id: string;
  group_id: number;
  location: ProjectorLocation;
  created_at: string;
  reset_at: string | null;
  closed_at: string | null;
}

// FR-9.1: mint signed one-time URLs for physical stickers. Write them with
// the "NFC Tools" Android app as NDEF URL records (SRS A-2).
export default function AdminNfcPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [location, setLocation] = useState<ProjectorLocation>("B1");
  const [count, setCount] = useState(3);
  const [minted, setMinted] = useState<{ id: number; label: string; url: string }[]>([]);
  const [existing, setExisting] = useState<NfcTokenRow[]>([]);
  const [groups, setGroups] = useState<{ id: number; name: string }[]>([]);
  const [groupId, setGroupId] = useState(1);
  const [testRuns, setTestRuns] = useState<NfcTestRun[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<NfcTokenRow | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [projectorTokenIds, setProjectorTokenIds] = useState<Set<number>>(new Set());

  const load = useCallback(async () => {
    const { data, error: tokensError } = await supabase
      .from("nfc_tokens")
      .select("id, location, label, used_at, used_by_group, created_at, test_run_id")
      .order("id", { ascending: false });
    if (tokensError) setError(`Unable to load issued tokens. ${tokensError.message}`);
    else setExisting((data as NfcTokenRow[]) ?? []);
    const { data: projectors, error: projectorsError } = await supabase
      .from("projectors").select("activated_by_nfc_id");
    if (!projectorsError) {
      setProjectorTokenIds(new Set((projectors ?? []).flatMap((p) =>
        p.activated_by_nfc_id == null ? [] : [Number(p.activated_by_nfc_id)])));
    }
    const [{ data: runRows, error: runsError }, { data: groupRows }] = await Promise.all([
      supabase.from("nfc_test_runs").select("id, group_id, location, created_at, reset_at, closed_at").order("created_at", { ascending: false }),
      supabase.rpc("fn_list_groups"),
    ]);
    if (runsError) setError(`NFC test mode unavailable. Apply migration 0081 first. ${runsError.message}`);
    setTestRuns((runRows as NfcTestRun[]) ?? []);
    const listedGroups = (groupRows ?? []) as { id: number; name: string }[];
    setGroups(listedGroups);
    if (listedGroups.length && !listedGroups.some((g) => g.id === groupId)) setGroupId(listedGroups[0].id);
  }, [supabase, groupId]);

  useEffect(() => {
    load();
  }, [load]);

  function deleteReason(token: NfcTokenRow) {
    if (token.used_at || token.used_by_group !== null) return "Used cards cannot be deleted.";
    if (projectorTokenIds.has(token.id)) return "This card is linked to a projector.";
    return null;
  }

  async function deleteToken() {
    if (!pendingDelete || busy) return;
    setBusy(true);
    setDeleteError(null);
    try {
      const { error } = await supabase.rpc("fn_admin_delete_nfc_token", { p_token_id: pendingDelete.id });
      if (error) {
        const messages: Record<string, string> = {
          PERMISSION_DENIED: "Only an Admin can delete NFC cards.",
          NFC_TOKEN_USED: "This card has been used and cannot be deleted.",
          NFC_TOKEN_PROJECTOR_LINKED: "This card is linked to a projector and cannot be deleted.",
          NFC_TOKEN_GUARDIAN_LINKED: "This card has a Guardian verification and cannot be deleted.",
        };
        setDeleteError(messages[error.message] ?? error.message);
        return;
      }
      setPendingDelete(null);
      setMinted((tokens) => tokens.filter((token) => token.id !== pendingDelete.id));
      setError(null);
      await load();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function mint(testRun?: NfcTestRun) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/nfc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          location: testRun?.location ?? location,
          count,
          ...(testRun ? { testRunId: testRun.id, labelPrefix: `TEST G${testRun.group_id} ${testRun.location}` } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Failed");
      else {
        setMinted(data.tokens);
        load();
      }
    } catch (e) {
      setError(String(e));
    }
    setBusy(false);
  }

  async function startTestRun() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("fn_nfc_test_start", {
      p_group_id: groupId,
      p_location: location,
    });
    setBusy(false);
    if (error) setError(testRunError(error.message));
    else await load();
  }

  async function resetTestRun(run: NfcTestRun) {
    if (!window.confirm(`Reset NFC test for Group ${run.group_id} at ${run.location}? This re-arms its test sticker and restores the test redemption.`)) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("fn_nfc_test_reset", { p_test_run_id: run.id });
    setBusy(false);
    if (error) setError(testRunError(error.message));
    else await load();
  }

  async function finishTestRun(run: NfcTestRun) {
    if (!window.confirm(`Finish NFC test for Group ${run.group_id} at ${run.location}? This clears test activation. Stickers from this run will stop working.`)) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("fn_nfc_test_finish", { p_test_run_id: run.id });
    setBusy(false);
    if (error) setError(testRunError(error.message));
    else await load();
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="NFC activation tokens"
        subtitle="One-time signed URLs for the physical stickers"
      />
      <ErrorBanner message={error} />

      <Card className="space-y-3 border-2 border-amber-300">
        <div>
          <h2 className="font-semibold">NFC test mode</h2>
          <p className="mt-1 text-sm text-ink-soft">Creates a test-only Guardian redemption so the group can exercise the real sticker activation without waiting for Endgame. The group must scan while signed in to its account.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="label mb-0">Test group
            <select className="input mt-1" value={groupId} onChange={(e) => setGroupId(Number(e.target.value))}>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <label className="label mb-0">Projector
            <select className="input mt-1" value={location} onChange={(e) => setLocation(e.target.value as ProjectorLocation)}>
              {PROJECTOR_LOCATIONS.map((loc) => <option key={loc} value={loc}>{PROJECTOR_LABELS[loc]}</option>)}
            </select>
          </label>
          <button disabled={busy || groups.length === 0} onClick={startTestRun} className="btn-primary self-end">Prepare test</button>
        </div>
        <p className="text-xs text-ink-faint">Preparation is refused if the group or projector already has activation or redemption state. Reset re-arms the test sticker and restores only this test redemption. NFC kill-switch still applies.</p>
        {testRuns.length > 0 && <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead><tr className="border-b border-paper-200 text-xs font-bold uppercase tracking-wide text-ink-faint"><th className="py-2">Test run</th><th>State</th><th className="text-right">Actions</th></tr></thead>
            <tbody className="divide-y divide-paper-200">
              {testRuns.map((run) => <tr key={run.id}>
                <td className="py-2">Group {run.group_id} / {PROJECTOR_LABELS[run.location]}<span className="block text-xs text-ink-faint">{new Date(run.created_at).toLocaleString()}</span></td>
                <td>{run.closed_at ? `Finished / ${new Date(run.closed_at).toLocaleString()}` : run.reset_at ? `Active / reset ${new Date(run.reset_at).toLocaleString()}` : "Active"}</td>
                <td className="space-x-2 text-right">
                  {!run.closed_at && <>
                    <button disabled={busy} onClick={() => mint(run)} className="btn text-xs">Generate test sticker</button>
                    <button disabled={busy} onClick={() => resetTestRun(run)} className="btn text-xs">Reset and re-arm</button>
                    <button disabled={busy} onClick={() => finishTestRun(run)} className="btn-danger text-xs">Finish test</button>
                  </>}
                </td>
              </tr>)}
            </tbody>
          </table>
        </div>}
      </Card>

      {minted.length > 0 && (
        <Card className="space-y-2 border-2 border-amber-400">
          <p className="flex items-start gap-1.5 text-sm font-semibold text-red-600">
            <TriangleAlert size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
            These full URLs are shown ONCE. Write each to its sticker now
            (NFC Tools → Write → URL record), then keep this list somewhere
            safe offline.
          </p>
          <div className="grid gap-2 lg:grid-cols-2">
            {minted.map((t) => (
              <div key={t.id} className="rounded-lg bg-paper-100 p-2">
                <p className="text-xs font-bold">{t.label}</p>
                <p className="break-all font-mono text-[10px] text-ink-soft">
                  {t.url}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="space-y-3">
          <h2 className="font-semibold">Generate tokens</h2>
          <div className="grid grid-cols-3 gap-2">
            {PROJECTOR_LOCATIONS.map((loc) => (
              <button
                key={loc}
                onClick={() => setLocation(loc)}
                className={cn(
                  "btn text-sm",
                  location === loc
                    ? "bg-brand-2 text-white"
                    : "border border-paper-300 bg-white"
                )}
              >
                {PROJECTOR_LABELS[loc]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="label mb-0 flex-1" htmlFor="count">
              How many stickers (incl. spares)?
            </label>
            <input
              id="count"
              type="number"
              min="1"
              max="20"
              className="input w-20"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </div>
          <button disabled={busy} onClick={() => mint()} className="btn-primary w-full">
            Generate {count} token{count > 1 ? "s" : ""}
          </button>
        </Card>

        <Card className="overflow-x-auto p-0">
          <p className="border-b border-paper-200 px-4 py-3 text-sm font-semibold">
            Issued tokens ({existing.length})
          </p>
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-paper-200 text-xs font-bold uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-2.5">Label</th>
                <th className="w-28 px-4 py-2.5">Location</th>
                <th className="w-40 px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-200">
              {existing.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2 font-medium">{t.label}</td>
                  <td className="px-4 py-2 text-ink-soft">{t.location}</td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        "chip",
                        (t.test_run_id && testRuns.find((r) => r.id === t.test_run_id)?.closed_at)
                          ? "bg-paper-200 text-ink-soft"
                          : t.used_at || t.used_by_group !== null
                          ? "bg-red-100 text-red-700"
                          : "bg-green-100 text-green-700"
                      )}
                    >
                      {t.test_run_id && testRuns.find((r) => r.id === t.test_run_id)?.closed_at
                        ? "test ended"
                        : t.used_at || t.used_by_group !== null ? (t.used_by_group === null ? "used" : `used by G${t.used_by_group}`) : "unused"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      className="btn-danger text-xs"
                      disabled={busy || !!deleteReason(t)}
                      aria-label={`Delete ${t.label || `card #${t.id}`}`}
                      onClick={() => { setDeleteError(null); setPendingDelete(t); }}
                    >Delete</button>
                    {deleteReason(t) && <p className="mt-1 text-xs text-ink-faint">{deleteReason(t)}</p>}
                  </td>
                </tr>
              ))}
              {existing.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-ink-faint">
                    No tokens issued yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
      <Dialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open && !busy) setPendingDelete(null); }}>
        <DialogContent title="Delete NFC card?" description="This permanently removes the card. Its NFC sticker and QR link will stop working. Existing logs will be kept." showClose={!busy}>
          {pendingDelete && <p className="text-sm font-semibold">{pendingDelete.label || `Card #${pendingDelete.id}`} / {pendingDelete.location} / #{pendingDelete.id}</p>}
          {deleteError && <p role="alert" className="mt-3 text-sm text-red-700">{deleteError}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn" disabled={busy} onClick={() => setPendingDelete(null)}>Cancel</button>
            <button className="btn-danger" disabled={busy} onClick={deleteToken}>{busy ? "Deleting…" : "Delete card"}</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function testRunError(message: string) {
  const known: Record<string, string> = {
    TEST_RUN_EXISTS: "This group and projector already have an NFC test. Use its existing run below.",
    SET_ALREADY_REDEEMED: "This group already has a redemption at this projector. Choose a clean test group and projector.",
    PROJECTOR_ALREADY_ACTIVATED: "This projector is already activated. Choose an unused projector.",
    GROUP_ALREADY_ACTIVATED: "This group already activated a projector. Choose a clean test group.",
    PERMISSION_DENIED: "Only an Admin can manage NFC test runs.",
  };
  return known[message] ?? message;
}
