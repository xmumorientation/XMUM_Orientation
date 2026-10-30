"use client";

import { Check } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { HeadcountTable } from "@/components/admin/HeadcountTable";
import { groupColor, themeFromColor } from "@/components/freshie/groupTheme";
import { Card, ErrorBanner, PageTitle, SuccessBanner } from "@/components/ui";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
import { groupQrPng, saveGroupQr } from "@/lib/group-qr";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Group } from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

type LoginCode = { group_id: number; code: string };
type Faci = { id: string; full_name: string; group_id: number | null };

export default function FreshieControlPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [groups, setGroups] = useState<Group[]>([]);
  const [codes, setCodes] = useState<Record<number, string>>({});
  const [groupCountInput, setGroupCountInput] = useState("");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrFiles, setQrFiles] = useState<Record<number, string>>({});
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [facis, setFacis] = useState<Faci[]>([]);
  // Tick-and-save dialog for one group's Facilitators
  const [faciGroup, setFaciGroup] = useState<Group | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [faciSearch, setFaciSearch] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetText, setResetText] = useState("");
  const preview =
    previewId != null && qrFiles[previewId] ? groups.find((g) => g.id === previewId) : undefined;

  const load = useCallback(async () => {
    const { data } = await supabase.from("groups").select("*").order("id");
    const rows = (data as Group[]) ?? [];
    setGroups(rows);
    setDrafts(Object.fromEntries(rows.map((g) => [g.id, groupColor(g.color)])));
    const { data: faciRows } = await supabase
      .from("profiles")
      .select("id, full_name, group_id")
      .eq("role", "faci")
      .order("full_name");
    setFacis((faciRows as Faci[]) ?? []);
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
    const channel = supabase
      .channel(`freshie-control-groups-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, () => {
        load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        load();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load, supabase]);

  useEffect(() => {
    let cancel = false;
    const ready = groups.filter((group) => codes[group.id]);
    if (ready.length === 0) return;
    (async () => {
      const res = await fetch("/api/group-join");
      const urls: Record<number, string> = res.ok ? (await res.json()).urls ?? {} : {};
      const next: Record<number, string> = {};
      for (const group of ready) {
        if (!urls[group.id]) continue;
        next[group.id] = await groupQrPng(
          `GROUP ${group.id}`,
          urls[group.id],
          drafts[group.id] ?? groupColor(group.color),
        );
      }
      if (!cancel) setQrFiles(next);
    })();
    return () => {
      cancel = true;
    };
  }, [groups, codes, drafts]);

  async function newPasswords() {
    if (!window.confirm("Give every group a new password? Every Freshie phone is signed out and has to scan its group QR again (the QRs stay the same).")) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/group-logins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: "all" }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Could not change the passwords");
      await load();
      return;
    }
    await load();
    flash("Every group has a new password");
  }

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

  async function resetGroups() {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("fn_reset_groups");
    if (rpcError) {
      setBusy(false);
      setError(friendlyError(rpcError));
      return;
    }
    // With no groups left, this removes every group login account.
    const sync = await fetch("/api/admin/group-logins", { method: "POST" });
    setBusy(false);
    setResetOpen(false);
    setResetText("");
    if (!sync.ok) {
      const body = (await sync.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Groups were deleted, but the group logins were not removed.");
    } else {
      flash("All groups deleted. Set a number to create them again.");
    }
    setCodes({});
    setQrFiles({});
    load();
  }

  const faciName = (f: Faci) => f.full_name || "Unnamed";
  const facisOf = (groupId: number) => facis.filter((f) => f.group_id === groupId);

  function openFaciDialog(group: Group) {
    setPicked(facisOf(group.id).map((f) => f.id));
    setFaciSearch("");
    setFaciGroup(group);
  }

  async function saveFacis() {
    if (!faciGroup) return;
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("fn_admin_set_group_facis", {
      p_group_id: faciGroup.id,
      p_user_ids: picked,
    });
    setBusy(false);
    if (rpcError) return setError(friendlyError(rpcError));
    flash(`${faciGroup.name}: Facilitators saved.`);
    setFaciGroup(null);
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

  return (
    <div className="space-y-4">
      <PageTitle
        title="Freshie Control"
        subtitle="Set how many groups exist, and one color for each. That color replaces blue on every Freshie screen. Each group gets a 4-digit password, a scan link, and a QR to download."
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <Card>
        <form onSubmit={submitGroupCount} className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Groups</h2>
              <p className="mt-1 text-sm text-ink-faint">{groups.length} now</p>
            </div>
            {groups.length > 0 && (
              <button
                type="button"
                className="btn-danger px-4"
                disabled={busy}
                onClick={() => setResetOpen(true)}
              >
                Reset
              </button>
            )}
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
        <Card className="overflow-x-auto p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-paper-200 px-4 py-3">
            <p className="text-sm text-ink-faint">
              Group QRs never change. New passwords sign out every Freshie phone; they scan their QR again.
            </p>
            <button type="button" className="btn-secondary px-4" disabled={busy} onClick={newPasswords}>
              New Passwords for All Groups
            </button>
          </div>
          <table className="av-groups w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-paper-200 text-xs font-bold uppercase tracking-wide text-ink-faint">
                <th className="w-16 px-4 py-3 text-center">No.</th>
                <th className="px-4 py-3">Name &amp; Slogan</th>
                <th className="w-56 px-4 py-3">Facilitators</th>
                <th className="w-32 px-4 py-3">Password</th>
                <th className="w-40 px-4 py-3">Color</th>
                <th className="w-28 px-4 py-3 text-right">QR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-200">
              {groups.map((group) => {
                const color = drafts[group.id] ?? groupColor(group.color);
                const unchanged = color.toLowerCase() === groupColor(group.color).toLowerCase();
                return (
                  <tr key={group.id} className="align-middle">
                    <td className="px-4 py-3">
                      <span
                        className="mx-auto flex h-10 w-10 items-center justify-center rounded-full text-base font-black"
                        style={{ background: color, color: themeFromColor(color).onAccent }}
                        title={group.name}
                      >
                        {group.id}
                      </span>
                    </td>
                    <td className="max-w-0 px-4 py-3">
                      {group.display_name ? (
                        <p className="truncate text-base font-bold text-ink">{group.display_name}</p>
                      ) : (
                        <p className="text-sm italic text-ink-faint">No name yet</p>
                      )}
                      {group.slogan ? (
                        <p className="truncate text-sm text-ink-soft">“{group.slogan}”</p>
                      ) : (
                        <p className="text-xs italic text-ink-faint">No slogan yet</p>
                      )}
                    </td>
                    <td data-label="Facilitators" className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openFaciDialog(group)}
                        className="flex w-full flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-paper-300 px-2 py-1 text-left hover:border-ink-faint"
                        aria-label={`Edit Facilitators for ${group.name}`}
                      >
                        {facisOf(group.id).length === 0 ? (
                          <span className="text-ink-faint">Unassigned / click to assign</span>
                        ) : (
                          facisOf(group.id).map((f) => (
                            <span key={f.id} className="rounded-full bg-[#25405e] px-2.5 py-0.5 text-xs font-semibold text-white">
                              {faciName(f)}
                            </span>
                          ))
                        )}
                      </button>
                    </td>
                    <td data-label="Password" className="px-4 py-3">
                      {codes[group.id] ? (
                        <span className="rounded-lg bg-paper-100 px-2.5 py-1 font-mono text-lg font-bold tracking-[0.2em] text-ink">
                          {codes[group.id]}
                        </span>
                      ) : (
                        <span className="text-xs italic text-ink-faint">None</span>
                      )}
                    </td>
                    <td data-label="Colour" className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          aria-label={`${group.name} color`}
                          value={color}
                          onChange={(e) => setDrafts((d) => ({ ...d, [group.id]: e.target.value }))}
                          className="h-9 w-9 cursor-pointer rounded-md border border-paper-300 bg-white p-0.5"
                        />
                        <button
                          type="button"
                          className="btn-secondary px-3"
                          disabled={busy || unchanged}
                          onClick={() => saveColor(group)}
                        >
                          Save
                        </button>
                      </div>
                    </td>
                    <td data-label="QR code" className="px-4 py-3 text-right">
                      {codes[group.id] && (
                        <button
                          type="button"
                          className="btn-secondary px-3"
                          disabled={!qrFiles[group.id]}
                          onClick={() => setPreviewId(group.id)}
                        >
                          Preview
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      <section className="space-y-2">
        <h2 className="font-semibold">Headcount</h2>
        <HeadcountTable />
      </section>

      <Dialog open={faciGroup !== null} onOpenChange={(open) => !open && setFaciGroup(null)}>
        <DialogContent title={faciGroup ? `Facilitators / ${faciGroup.name}` : "Facilitators"}>
          {faciGroup && (
            <div className="space-y-3">
              <input
                className="input text-sm"
                placeholder="Search Facilitators…"
                aria-label="Search Facilitators"
                value={faciSearch}
                onChange={(e) => setFaciSearch(e.target.value)}
              />
              <div className="max-h-72 divide-y divide-paper-200 overflow-y-auto rounded-xl border border-paper-200">
                {[...facis]
                  .filter((f) => faciName(f).toLowerCase().includes(faciSearch.trim().toLowerCase()))
                  .sort((a, b) => {
                    const rank = (f: Faci) =>
                      picked.includes(f.id) ? 0 : f.group_id != null && f.group_id !== faciGroup.id ? 2 : 1;
                    return rank(a) - rank(b) || faciName(a).localeCompare(faciName(b));
                  })
                  .map((f) => {
                    const on = picked.includes(f.id);
                    const at =
                      f.group_id != null && f.group_id !== faciGroup.id
                        ? (groups.find((g) => g.id === f.group_id)?.name ?? `Group ${f.group_id}`)
                        : null;
                    return (
                      <label
                        key={f.id}
                        className={cn("flex cursor-pointer items-center gap-3 px-3 py-2 text-sm", at && !on && "opacity-70")}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={on}
                          onChange={() =>
                            setPicked((cur) => (on ? cur.filter((id) => id !== f.id) : [...cur, f.id]))
                          }
                        />
                        <span
                          aria-hidden
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                            on ? "border-[#25405e] bg-[#25405e] text-white" : "border-paper-300"
                          )}
                        >
                          {on && <Check size={14} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{faciName(f)}</span>
                        {at && (
                          <span className="shrink-0 text-xs text-ink-faint">
                            {on ? `moves from ${at}` : `in ${at}`}
                          </span>
                        )}
                      </label>
                    );
                  })}
                {facis.length === 0 && (
                  <p className="px-3 py-4 text-center text-sm text-ink-faint">
                    No Facilitators yet. Give a user the Faci role in Settings → Users.
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-ink-faint">{picked.length} selected</span>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary px-4" onClick={() => setFaciGroup(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn-primary px-5"
                    disabled={
                      busy ||
                      (picked.length === facisOf(faciGroup.id).length &&
                        picked.every((id) => facisOf(faciGroup.id).some((f) => f.id === id)))
                    }
                    onClick={saveFacis}
                  >
                    {busy ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={resetOpen}
        onOpenChange={(open) => {
          if (busy) return;
          setResetOpen(open);
          if (!open) setResetText("");
        }}
      >
        <DialogContent className="av-dialog"
          title="Delete All Groups?"
          description="This deletes all groups with their tokens, puzzles, headcounts and passwords. Printed group QRs work again once the groups are set up again. Facilitators and Freshies lose their group. This cannot be undone."
        >
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (resetText === "RESET") resetGroups();
            }}
          >
            <label className="label" htmlFor="reset-confirm">
              Type RESET to Confirm
            </label>
            <input
              id="reset-confirm"
              className="input w-full"
              autoComplete="off"
              value={resetText}
              onChange={(e) => setResetText(e.target.value)}
            />
            <button
              type="submit"
              className="btn-danger w-full"
              disabled={busy || resetText !== "RESET"}
            >
              {busy ? "Deleting…" : "Delete All Groups"}
            </button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={preview != null} onOpenChange={(open) => !open && setPreviewId(null)}>
        {preview && (
          <DialogContent className="av-dialog" title={`${preview.name} QR`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
            <img
              src={qrFiles[preview.id]}
              alt={`${preview.name} login QR`}
              className="mx-auto w-full max-w-xs"
            />
            <p className="mt-3 text-center text-xs text-ink-faint">
              This QR never changes. A new password does not affect it.
            </p>
            <button
              type="button"
              className="btn-primary mt-4 w-full"
              onClick={() => saveGroupQr(preview.id, qrFiles[preview.id])}
            >
              Download
            </button>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
