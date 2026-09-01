"use client";

import { Download, FileText, Plus, Search, Settings2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FreshieLiveDashboard } from "@/components/FreshieLiveDashboard";
import { useProfile } from "@/components/ProfileProvider";
import {
  Button,
  Card,
  Dialog,
  DialogClose,
  DialogContent,
  ErrorBanner,
  Input,
  Label,
  PageTitle,
  Select,
  Spinner,
  StatusPill,
  SuccessBanner,
} from "@/components/ui";
import { useFreshieStats } from "@/components/useFreshieStats";
import { supabaseBrowser } from "@/lib/supabase/client";
import type {
  Freshie,
  FreshieGender,
  FreshieNationality,
  Group,
  RegisterFreshieResult,
} from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

const EMPTY_FORM = {
  full_name: "",
  phone: "",
  gender: "Male" as FreshieGender,
  nationality: "Local" as FreshieNationality,
  student_id: "",
};

function escapeCsv(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export default function RegisterCounterPage() {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { stats, loading: statsLoading, totalHeadcount, refresh: refreshStats } =
    useFreshieStats();

  const [groups, setGroups] = useState<Group[]>([]);
  const [freshies, setFreshies] = useState<Freshie[]>([]);
  const [rosterLoading, setRosterLoading] = useState(true);

  const [groupCountInput, setGroupCountInput] = useState("");
  const [search, setSearch] = useState("");
  const [filterGroup, setFilterGroup] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Add-freshie dialog state
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [result, setResult] = useState<RegisterFreshieResult | null>(null);

  // Manual reassignment state (per roster row)
  const [reassignId, setReassignId] = useState<number | null>(null);
  const [reassignGroupId, setReassignGroupId] = useState("");
  const [reassignWarning, setReassignWarning] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: gs }, { data: fs }] = await Promise.all([
      supabase.from("groups").select("*").order("id"),
      supabase.from("freshies").select("*").order("created_at", { ascending: false }),
    ]);
    setGroups((gs as Group[]) ?? []);
    setFreshies((fs as Freshie[]) ?? []);
    setRosterLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("freshie-roster")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "freshies" },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "groups" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 2500);
  }

  const targetAverage = groups.length ? totalHeadcount / groups.length : null;
  const groupNameById = useMemoGroupNameMap(groups);

  if (profile.role !== "admin") {
    return (
      <p className="py-16 text-center text-sm text-ink-faint">
        Admin access required.
      </p>
    );
  }


  // ── Pre-event config ────────────────────────────────────────────────────

  async function submitGroupCount(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(groupCountInput);
    if (!n || n < 1) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("fn_set_freshie_group_count", { p_count: n });
    setBusy(false);
    if (error) setError(friendlyError(error));
    else {
      flash(`Configured ${n} groups.`);
      setGroupCountInput("");
      load();
      refreshStats();
    }
  }

  // ── Registration ─────────────────────────────────────────────────────────

  function openAddDialog() {
    setForm(EMPTY_FORM);
    setResult(null);
    setError(null);
    setAddOpen(true);
  }

  async function submitRegistration(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim()) return;
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("fn_register_freshie", {
      p_full_name: form.full_name,
      p_phone: form.phone || null,
      p_gender: form.gender,
      p_nationality: form.nationality,
      p_student_id: form.student_id || null,
    });
    setBusy(false);
    if (error) setError(friendlyError(error));
    else {
      setResult(data as RegisterFreshieResult);
      load();
      refreshStats();
    }
  }

  function registerNext() {
    setForm(EMPTY_FORM);
    setResult(null);
  }

  // ── Manual reassignment (soft warning, not a hard block) ────────────────

  function startReassign(f: Freshie) {
    setReassignId(f.id);
    setReassignGroupId(f.group_id ? String(f.group_id) : "");
    setReassignWarning(null);
  }

  function previewReassign(freshie: Freshie, newGroupIdStr: string) {
    setReassignGroupId(newGroupIdStr);
    const newGroupId = Number(newGroupIdStr);
    if (!newGroupId || newGroupId === freshie.group_id) {
      setReassignWarning(null);
      return;
    }
    const newStat = stats.find((s) => s.group_id === newGroupId);
    if (!newStat) {
      setReassignWarning(null);
      return;
    }
    const avg = targetAverage ?? 0;
    const headcountAfter = newStat.headcount + 1;
    const genderKey = freshie.gender === "Male" ? "male_count" : "female_count";
    const genderAfter = newStat[genderKey] + 1;
    const ratioAfter = headcountAfter ? genderAfter / headcountAfter : 0;

    const warnings: string[] = [];
    if (avg > 0 && headcountAfter - avg > 1.5) {
      warnings.push(
        `${newStat.group_name} would rise to ${headcountAfter} people (avg is ${avg.toFixed(1)}).`
      );
    }
    if (ratioAfter > 0.7) {
      warnings.push(
        `${newStat.group_name} would become ${Math.round(ratioAfter * 100)}% ${freshie.gender}.`
      );
    }
    setReassignWarning(warnings.length ? warnings.join(" ") : null);
  }

  async function confirmReassign(freshie: Freshie) {
    const newGroupId = Number(reassignGroupId);
    if (!newGroupId) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.rpc("fn_admin_reassign_freshie", {
      p_freshie_id: freshie.id,
      p_new_group_id: newGroupId,
    });
    setBusy(false);
    if (error) setError(friendlyError(error));
    else {
      flash(`${freshie.full_name} moved.`);
      setReassignId(null);
      setReassignWarning(null);
      load();
      refreshStats();
    }
  }

  // ── Roster filtering ─────────────────────────────────────────────────────

  const filtered = freshies.filter((f) => {
    const matchesSearch =
      !search ||
      f.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (f.student_id ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (f.phone ?? "").includes(search);
    const matchesGroup = !filterGroup || String(f.group_id) === filterGroup;
    return matchesSearch && matchesGroup;
  });

  // ── Export tools ─────────────────────────────────────────────────────────

  function exportCsv() {
    const header = [
      "Full Name",
      "Phone",
      "Gender",
      "Nationality",
      "Student ID",
      "Group",
      "Registered At",
    ];
    const lines = filtered.map((f) =>
      [
        f.full_name,
        f.phone ?? "",
        f.gender,
        f.nationality,
        f.student_id ?? "",
        f.group_id ? groupNameById[f.group_id] ?? "" : "Unassigned",
        new Date(f.created_at).toLocaleString(),
      ]
        .map((v) => escapeCsv(String(v)))
        .join(",")
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `freshie-roster-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    const w = window.open("", "_blank");
    if (!w) return;
    const title = filterGroup
      ? `Freshie Roster — ${groupNameById[Number(filterGroup)] ?? ""}`
      : "Freshie Roster — All Groups";
    const rowsHtml = filtered
      .map(
        (f) => `<tr>
          <td>${f.full_name}</td>
          <td>${f.gender}</td>
          <td>${f.nationality}</td>
          <td>${f.phone ?? ""}</td>
          <td>${f.student_id ?? ""}</td>
          <td>${f.group_id ? groupNameById[f.group_id] ?? "" : "Unassigned"}</td>
          <td>${new Date(f.created_at).toLocaleString()}</td>
        </tr>`
      )
      .join("");
    w.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: -apple-system, Segoe UI, Arial, sans-serif; padding: 24px; color: #1c1a17; }
            h1 { font-size: 18px; margin-bottom: 4px; }
            p.meta { color: #666; font-size: 12px; margin-bottom: 16px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
            th { background: #f3f2ef; }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <p class="meta">${filtered.length} freshies — generated ${new Date().toLocaleString()}</p>
          <table>
            <thead>
              <tr><th>Name</th><th>Gender</th><th>Nationality</th><th>Phone</th><th>Student ID</th><th>Group</th><th>Registered</th></tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </body>
      </html>
    `);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  return (
    <div className="space-y-4">
      <PageTitle
        title="Freshies Register Counter"
        subtitle="Real-time D-Day registration, automatic group load-balancing & live monitoring"
        action={<StatusPill tone="warning">D-Day Live</StatusPill>}
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      {/* ── Pre-event configuration ───────────────────────────────────── */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2 font-semibold">
          <Settings2 size={18} strokeWidth={1.75} className="text-brand-1" />
          Pre-event configuration
        </div>
        <form onSubmit={submitGroupCount} className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]">
            <Label>Total number of groups</Label>
            <Input
              type="number"
              min={1}
              max={200}
              placeholder={String(groups.length || 10)}
              value={groupCountInput}
              onChange={(e) => setGroupCountInput(e.target.value)}
            />
          </div>
          <Button type="submit" intent="secondary" disabled={busy || !groupCountInput}>
            Apply
          </Button>
          <div className="ml-auto text-sm text-ink-faint">
            {groups.length > 0 ? (
              <>
                <span className="font-bold text-ink">{groups.length}</span> groups configured
                {targetAverage != null && (
                  <>
                    {" · "}target avg{" "}
                    <span className="font-bold text-ink">{targetAverage.toFixed(1)}</span>{" "}
                    per group
                  </>
                )}
              </>
            ) : (
              "No groups yet — set a count above."
            )}
          </div>
        </form>
      </Card>

      {/* ── Add freshie ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Live monitoring dashboard</h2>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <Button icon={Plus} onClick={openAddDialog}>
            Add Freshie
          </Button>
          <DialogContent
            title={result ? "Registration complete" : "Freshie Registration"}
            description={
              result
                ? undefined
                : "Full Name, Gender & Nationality are required."
            }
          >
            {!result ? (
              <form onSubmit={submitRegistration} className="space-y-3">
                <ErrorBanner message={error} />
                <div>
                  <Label>Full Name *</Label>
                  <Input
                    required
                    placeholder="As per IC / Passport"
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Phone Number</Label>
                  <Input
                    placeholder="Optional"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Student ID</Label>
                  <Input
                    placeholder="Optional"
                    value={form.student_id}
                    onChange={(e) => setForm({ ...form, student_id: e.target.value })}
                  />
                </div>

                <div>
                  <Label>Gender *</Label>
                  <div className="flex gap-4">
                    {(["Male", "Female"] as FreshieGender[]).map((g) => (
                      <label
                        key={g}
                        className={cn(
                          "flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition",
                          form.gender === g
                            ? "border-brand-1 bg-brand-1/10 text-brand-1"
                            : "border-paper-300 bg-white text-ink-soft"
                        )}
                      >
                        <input
                          type="radio"
                          name="gender"
                          className="sr-only"
                          checked={form.gender === g}
                          onChange={() => setForm({ ...form, gender: g })}
                        />
                        {g}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Nationality *</Label>
                  <div className="flex gap-4">
                    {(["Local", "International"] as FreshieNationality[]).map((n) => (
                      <label
                        key={n}
                        className={cn(
                          "flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold transition",
                          form.nationality === n
                            ? "border-brand-1 bg-brand-1/10 text-brand-1"
                            : "border-paper-300 bg-white text-ink-soft"
                        )}
                      >
                        <input
                          type="radio"
                          name="nationality"
                          className="sr-only"
                          checked={form.nationality === n}
                          onChange={() => setForm({ ...form, nationality: n })}
                        />
                        {n === "Local" ? "Local (Malaysia)" : "International"}
                      </label>
                    ))}
                  </div>
                </div>

                <Button
                  type="submit"
                  icon={UserPlus}
                  fullWidth
                  loading={busy}
                  disabled={!form.full_name.trim()}
                >
                  Register & Get Group
                </Button>
              </form>
            ) : (
              <div className="space-y-4 text-center">
                <p className="text-sm font-semibold text-status-open">
                  Registration successful!
                </p>
                <div className="rounded-2xl bg-[image:linear-gradient(135deg,theme(colors.brand.1),theme(colors.brand.2))] p-6 text-white shadow-overlay">
                  <p className="text-sm font-semibold uppercase tracking-wide opacity-80">
                    Assigned to
                  </p>
                  <p className="mt-1 text-4xl font-black tracking-tight">
                    {result.group_name}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button intent="secondary" fullWidth onClick={registerNext}>
                    Register Next Freshie
                  </Button>
                  <DialogClose asChild>
                    <Button fullWidth>Done</Button>
                  </DialogClose>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Live dashboard ────────────────────────────────────────────────── */}
      <FreshieLiveDashboard stats={stats} loading={statsLoading} targetAverage={targetAverage} />

      {/* ── Roster ────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">
            Participant Roster{" "}
            <span className="text-sm font-normal text-ink-faint">
              ({filtered.length}/{freshies.length})
            </span>
          </h2>
          <div className="flex gap-2">
            <Button size="sm" intent="secondary" icon={Download} onClick={exportCsv}>
              CSV
            </Button>
            <Button size="sm" intent="secondary" icon={FileText} onClick={exportPdf}>
              PDF
            </Button>
          </div>
        </div>

        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[200px] flex-1">
              <Search className="absolute left-3 top-3 text-ink-faint" size={18} />
              <input
                type="text"
                placeholder="Search by name, student ID or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-10"
              />
            </div>
            <Select
              className="w-auto min-w-[160px]"
              value={filterGroup}
              onChange={(e) => setFilterGroup(e.target.value)}
            >
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </div>
        </Card>

        {rosterLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-8 text-center text-sm text-ink-faint">
            No freshies registered yet.
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((f) => (
              <Card key={f.id} className="p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-ink">{f.full_name}</p>
                    <p className="text-xs text-ink-faint">
                      {f.gender} · {f.nationality}
                      {f.phone ? ` · ${f.phone}` : ""}
                      {f.student_id ? ` · ID: ${f.student_id}` : ""}
                    </p>
                    <p className="text-xs text-ink-faint">
                      Registered {new Date(f.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="chip border border-brand-1/20 bg-brand-1/10 text-brand-1">
                      {f.group_id ? groupNameById[f.group_id] : "Unassigned"}
                    </span>
                    {reassignId === f.id ? (
                      <div className="flex items-center gap-2">
                        <Select
                          className="w-auto min-w-[130px]"
                          value={reassignGroupId}
                          onChange={(e) => previewReassign(f, e.target.value)}
                        >
                          <option value="">Select group</option>
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </Select>
                        <Button
                          size="sm"
                          disabled={
                            busy || !reassignGroupId || Number(reassignGroupId) === f.group_id
                          }
                          onClick={() => confirmReassign(f)}
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          intent="ghost"
                          onClick={() => {
                            setReassignId(null);
                            setReassignWarning(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" intent="secondary" onClick={() => startReassign(f)}>
                        Reassign
                      </Button>
                    )}
                  </div>
                </div>
                {reassignId === f.id && reassignWarning && (
                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    ⚠ {reassignWarning} You can still confirm if this is intentional.
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function useMemoGroupNameMap(groups: Group[]): Record<number, string> {
  return useMemo(() => {
    const map: Record<number, string> = {};
    for (const g of groups) map[g.id] = g.name;
    return map;
  }, [groups]);
}
