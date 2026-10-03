"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useProfile } from "@/components/ProfileProvider";
import { groupColor } from "@/components/freshie/groupTheme";
import { Card, ErrorBanner, PageTitle, SuccessBanner } from "@/components/ui";
import { groupJoinPath } from "@/lib/group-login";
import { groupQrPng, saveGroupQr } from "@/lib/group-qr";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Group } from "@/lib/types";
import { friendlyError } from "@/lib/utils";

type LoginCode = { group_id: number; code: string };

export default function FreshieControlPage() {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [groups, setGroups] = useState<Group[]>([]);
  const [codes, setCodes] = useState<Record<number, string>>({});
  const [groupCountInput, setGroupCountInput] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrFiles, setQrFiles] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    const { data } = await supabase.from("groups").select("*").order("id");
    const rows = (data as Group[]) ?? [];
    setGroups(rows);
    setDrafts(Object.fromEntries(rows.map((g) => [g.id, groupColor(g.color)])));
    const { data: codeRows, error: codeError } = await supabase
      .from("group_login_codes")
      .select("group_id, code");
    if (!codeError) {
      const list = (codeRows as LoginCode[]) ?? [];
      setCodes(Object.fromEntries(list.map((row) => [row.group_id, row.code])));
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancel = false;
    const ready = groups.filter((group) => codes[group.id]);
    if (ready.length === 0) return;
    (async () => {
      const next: Record<number, string> = {};
      for (const group of ready) {
        next[group.id] = await groupQrPng(
          group.id,
          codes[group.id],
          drafts[group.id] ?? groupColor(group.color),
        );
      }
      if (!cancel) setQrFiles(next);
    })();
    return () => {
      cancel = true;
    };
  }, [groups, codes, drafts]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  }

  async function submitGroupCount(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(groupCountInput);
    if (!n || n < 1) return;
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("fn_set_total_groups", { p_target_count: n });
    if (rpcError) {
      setBusy(false);
      setError(friendlyError(rpcError));
      return;
    }
    const { error: colorError } = await supabase.rpc("fn_assign_freshie_group_colors");
    if (colorError) {
      setBusy(false);
      setError(friendlyError(colorError));
      load();
      return;
    }
    const sync = await fetch("/api/admin/group-logins", { method: "POST" });
    setBusy(false);
    if (!sync.ok) {
      const body = (await sync.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Groups were saved, but the login codes were not created.");
      load();
      return;
    }
    flash(`Set the event to ${n} groups.`);
    setGroupCountInput("");
    load();
  }

  async function saveColor(group: Group) {
    const color = drafts[group.id] ?? groupColor(group.color);
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("fn_admin_set_group_color", {
      p_group_id: group.id,
      p_color: color,
    });
    setBusy(false);
    if (rpcError) {
      setError(friendlyError(rpcError));
      return;
    }
    flash(`${group.name} is now ${color}.`);
    load();
  }

  if (profile.role !== "admin") {
    return <p className="py-16 text-center text-sm text-ink-faint">Admin access required.</p>;
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Freshie control"
        subtitle="Set how many groups exist, and one color for each. That color replaces blue on every Freshie screen. Each group gets a 4-digit password, a scan link, and a QR to download."
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <Card>
        <form onSubmit={submitGroupCount} className="space-y-3">
          <div>
            <h2 className="font-semibold">Groups</h2>
            <p className="mt-1 text-sm text-ink-faint">{groups.length} now</p>
          </div>
          <p className="text-xs text-ink-faint">
            A lower number deletes the extra groups, including their tokens, puzzles, and headcounts.
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              required
              value={groupCountInput}
              onChange={(e) => setGroupCountInput(e.target.value)}
              placeholder="Number of groups"
              className="input flex-1"
            />
            <button type="submit" className="btn-primary px-5" disabled={busy}>
              Set
            </button>
          </div>
        </form>
      </Card>

      {groups.length > 0 && (
        <Card className="divide-y divide-paper-200 p-0">
          {groups.map((group) => {
            const color = drafts[group.id] ?? groupColor(group.color);
            const unchanged = color.toLowerCase() === groupColor(group.color).toLowerCase();
            return (
              <form
                key={group.id}
                className="flex items-center gap-3 px-4 py-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveColor(group);
                }}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{group.name}</p>
                  {codes[group.id] && (
                    <p className="truncate font-mono text-xs text-ink-faint">
                      {codes[group.id]} · {groupJoinPath(group.id, codes[group.id])}
                    </p>
                  )}
                </div>
                <input
                  type="color"
                  aria-label={`${group.name} color`}
                  value={color}
                  onChange={(e) => setDrafts((d) => ({ ...d, [group.id]: e.target.value }))}
                  className="h-9 w-9 cursor-pointer rounded-md border border-paper-300 bg-white p-0.5"
                />
                {codes[group.id] && (
                  <button
                    type="button"
                    className="btn-secondary px-4"
                    disabled={!qrFiles[group.id]}
                    onClick={() => qrFiles[group.id] && saveGroupQr(group.id, qrFiles[group.id])}
                  >
                    Download
                  </button>
                )}
                <button type="submit" className="btn-secondary px-4" disabled={busy || unchanged}>
                  Save
                </button>
              </form>
            );
          })}
        </Card>
      )}
    </div>
  );
}
