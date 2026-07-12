"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Card,
  ErrorBanner,
  PageTitle,
  Spinner,
  SuccessBanner,
} from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  ROLE_LABELS,
  type Group,
  type Profile,
  type Station,
  type UserRole,
} from "@/lib/types";

interface ImportResult {
  created?: { email: string; password: string; role: string }[];
  failed?: { email: string; error: string }[];
  dryRun?: boolean;
  total?: number;
  valid?: number;
  errors?: { line: number; email?: string; error?: string }[];
  error?: string;
}

const ALL_ROLES = Object.keys(ROLE_LABELS) as UserRole[];

// FR-11.1 CSV import (dry-run first) + FR-11.2 user/group management.
export default function AdminUsersPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: us }, { data: gs }, { data: sts }] = await Promise.all([
      supabase.from("profiles").select("*").order("role").order("full_name"),
      supabase.from("groups").select("*").order("id"),
      supabase.from("stations").select("*").order("id"),
    ]);
    setUsers((us as Profile[]) ?? []);
    setGroups((gs as Group[]) ?? []);
    setStations((sts as Station[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function runImport(dryRun: boolean) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/import-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, dryRun }),
      });
      const data = (await res.json()) as ImportResult;
      if (!res.ok) setError(data.error ?? "Import failed");
      setResult(data);
      if (!dryRun && data.created) {
        setNotice(
          `Created ${data.created.length} accounts. Copy the credentials below NOW — passwords are not shown again.`
        );
        load();
      }
    } catch (e) {
      setError(String(e));
    }
    setBusy(false);
  }

  // Role/group/station changes go through a security-definer RPC — direct
  // column updates on profiles are revoked to block self-escalation.
  async function updateUser(id: string, patch: Partial<Profile>) {
    setError(null);
    const current = users.find((u) => u.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    const { error } = await supabase.rpc("fn_admin_update_profile", {
      p_user_id: id,
      p_role: next.role,
      p_group_id: next.group_id,
      p_station_id: next.station_id,
    });
    if (error) setError(error.message);
    else {
      setUsers((us) => us.map((u) => (u.id === id ? next : u)));
    }
  }

  const visible = users.filter(
    (u) =>
      !filter ||
      u.full_name.toLowerCase().includes(filter.toLowerCase()) ||
      (u.email ?? "").toLowerCase().includes(filter.toLowerCase()) ||
      (u.student_id ?? "").includes(filter)
  );

  return (
    <div className="space-y-4">
      <PageTitle title="Users" subtitle="CSV staff import & account management" />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <Card className="space-y-2">
        <h2 className="font-semibold">Staff CSV import</h2>
        <p className="text-xs text-ink-faint">
          Columns: <code>name,email,role,group,station</code> — role ∈{" "}
          faci/gm/guardian_gm/hof/hogm/committee/admin. Always dry-run first.
        </p>
        <textarea
          className="input min-h-[120px] py-2 font-mono text-xs"
          placeholder={"name,email,role,group,station\nAlice Tan,alice@xmu.edu.my,faci,1,\nBob Lim,bob@xmu.edu.my,gm,,3"}
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            disabled={busy || !csv.trim()}
            onClick={() => runImport(true)}
            className="btn-secondary flex-1"
          >
            Dry run
          </button>
          <button
            disabled={busy || !csv.trim() || !result?.dryRun || (result?.errors?.length ?? 0) > 0}
            onClick={() => runImport(false)}
            className="btn-primary flex-1"
          >
            Import
          </button>
        </div>

        {result?.dryRun && (
          <div className="rounded-xl bg-base-100 p-3 text-sm">
            <p>
              {result.valid}/{result.total} rows valid.
            </p>
            {(result.errors?.length ?? 0) > 0 && (
              <ul className="mt-1 list-inside list-disc text-red-600">
                {result.errors!.map((e, i) => (
                  <li key={i}>
                    Line {e.line}: {e.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {result?.created && result.created.length > 0 && (
          <div className="rounded-xl bg-night-900 p-3">
            <p className="mb-1 text-xs text-white/60">
              Generated credentials (distribute centrally, FR-1.1):
            </p>
            <pre className="overflow-x-auto text-xs text-green-300">
              {result.created
                .map((c) => `${c.email}\t${c.password}\t${c.role}`)
                .join("\n")}
            </pre>
          </div>
        )}
        {result?.failed && result.failed.length > 0 && (
          <div className="text-sm text-red-600">
            {result.failed.map((f, i) => (
              <p key={i}>
                {f.email}: {f.error}
              </p>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">All accounts ({users.length})</h2>
        </div>
        <input
          className="input"
          placeholder="Filter by name / email / student ID…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {loading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (
          <div className="max-h-[480px] space-y-2 overflow-y-auto">
            {visible.map((u) => (
              <div
                key={u.id}
                className="rounded-xl border border-base-200 p-3"
              >
                <p className="text-sm font-semibold">
                  {u.full_name || "(no name)"}
                </p>
                <p className="text-xs text-ink-faint">
                  {u.email} {u.student_id ? `· ${u.student_id}` : ""}
                </p>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <select
                    className="input min-h-[36px] text-xs"
                    value={u.role}
                    onChange={(e) =>
                      updateUser(u.id, { role: e.target.value as UserRole })
                    }
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                  <select
                    className="input min-h-[36px] text-xs"
                    value={u.group_id ?? ""}
                    onChange={(e) =>
                      updateUser(u.id, {
                        group_id: e.target.value ? Number(e.target.value) : null,
                      })
                    }
                  >
                    <option value="">No group</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className="input min-h-[36px] text-xs"
                    value={u.station_id ?? ""}
                    onChange={(e) =>
                      updateUser(u.id, {
                        station_id: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  >
                    <option value="">No station</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
