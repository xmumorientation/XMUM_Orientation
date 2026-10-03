"use client";

import { Pencil, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { FilterChips } from "@/components/admin/FilterChips";
import {
  Card,
  ErrorBanner,
  PageTitle,
  Spinner,
  SuccessBanner,
} from "@/components/ui";
import { Dialog, DialogContent } from "@/components/ui/Dialog";
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

// Staff roles first; Freshie accounts are the shared group logins.
const ALL_ROLES = [
  ...(Object.keys(ROLE_LABELS) as UserRole[]).filter((r) => r !== "freshie"),
  "freshie",
] as UserRole[];
const STAFF_ROLES = ALL_ROLES.filter((r) => r !== "freshie");
// Group matters for facilitators (and Freshie logins); station for GMs.
const HAS_GROUP: UserRole[] = ["faci", "freshie"];
const HAS_STATION: UserRole[] = ["gm", "guardian_gm"];
const GROUP_LOGIN = /^group-\d+@freshie\.xmu\.edu\.my$/i;

const emptyNew = {
  name: "",
  email: "",
  role: "faci" as UserRole,
  group: "",
  station: "",
};

// FR-11.1 CSV import (dry-run first) + FR-11.2 user/group management.
// Full CRUD: add, edit (name, email, role, group, station, password reset)
// and delete.
export default function AdminUsersPage() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [filter, setFilter] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newUser, setNewUser] = useState(emptyNew);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [editForm, setEditForm] = useState({ name: "", email: "" });
  const [resetPw, setResetPw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: us }, { data: sts }, { data: gs }] = await Promise.all([
      supabase.from("profiles").select("*").order("role").order("full_name"),
      supabase.from("stations").select("*").order("id"),
      supabase.from("groups").select("*").order("id"),
    ]);
    setUsers((us as Profile[]) ?? []);
    setStations((sts as Station[]) ?? []);
    setGroups((gs as Group[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  }

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
          `Created ${data.created.length} accounts. Copy the credentials in the import window NOW — passwords are not shown again.`
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

  async function api(method: string, body: unknown) {
    const res = await fetch("/api/admin/users", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      password?: string;
    };
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data;
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await api("POST", {
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        group: HAS_GROUP.includes(newUser.role) ? newUser.group : null,
        station: HAS_STATION.includes(newUser.role) ? newUser.station : null,
      });
      setCreated({ email: newUser.email.trim().toLowerCase(), password: data.password ?? "" });
      setNewUser(emptyNew);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  function openEdit(u: Profile) {
    setEditing(u);
    setEditForm({ name: u.full_name, email: u.email ?? "" });
    setResetPw(null);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);
    try {
      await api("PATCH", { id: editing.id, name: editForm.name, email: editForm.email });
      setEditing(null);
      flash("Account updated.");
      load();
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  async function resetPassword() {
    if (!editing) return;
    if (!window.confirm(`Reset the password for ${editing.full_name || editing.email}?`)) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api("PATCH", { id: editing.id, resetPassword: true });
      setResetPw(data.password ?? null);
    } catch (err) {
      setError((err as Error).message);
    }
    setBusy(false);
  }

  async function deleteUser(u: Profile) {
    if (!window.confirm(`Delete ${u.full_name || u.email}? This removes their login and cannot be undone.`))
      return;
    setError(null);
    try {
      await api("DELETE", { id: u.id });
      flash("Account deleted.");
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const roleOptions = useMemo(() => {
    const counts = new Map<UserRole, number>();
    for (const u of users) counts.set(u.role, (counts.get(u.role) ?? 0) + 1);
    return [
      { value: "all", label: "All", count: users.length },
      ...ALL_ROLES.map((r) => ({
        value: r,
        label: ROLE_LABELS[r],
        count: counts.get(r) ?? 0,
      })),
    ];
  }, [users]);

  const groupLabel = (g: Group) =>
    g.display_name ? `${g.name} · ${g.display_name}` : g.name;

  const q = filter.trim().toLowerCase();
  const visible = users.filter(
    (u) =>
      (roleFilter === "all" || u.role === roleFilter) &&
      (groupFilter === "all" ||
        (groupFilter === "none" ? u.group_id == null : u.group_id === Number(groupFilter))) &&
      (!q ||
        u.full_name.toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.student_id ?? "").includes(filter.trim()))
  );
  const filtered = roleFilter !== "all" || groupFilter !== "all" || q !== "";

  return (
    <div className="space-y-4">
      <PageTitle
        title="Users"
        subtitle="Add, edit and remove accounts. Assign facilitators to groups."
        action={
          <div className="flex gap-2">
            <button type="button" className="btn-secondary px-5" onClick={() => setImportOpen(true)}>
              Import CSV
            </button>
            <button
              type="button"
              className="btn-primary px-5"
              onClick={() => {
                setCreated(null);
                setAddOpen(true);
              }}
            >
              + Add user
            </button>
          </div>
        }
      />
      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      <Card className="space-y-3">
        <FilterChips
          label="Filter by role"
          options={roleOptions}
          value={roleFilter}
          onChange={setRoleFilter}
        />
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_16rem]">
          <input
            className="input"
            placeholder="Search name, email or student ID…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <select
            className="input"
            aria-label="Filter by group"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
          >
            <option value="all">All groups</option>
            <option value="none">No group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {groupLabel(g)}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-paper-200 text-xs font-bold uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3">Name</th>
                <th className="w-48 px-4 py-3">Role</th>
                <th className="w-52 px-4 py-3">Group</th>
                <th className="w-36 px-4 py-3">Station</th>
                <th className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-200">
              {visible.map((u) => {
                const isGroupLogin = !!u.email && GROUP_LOGIN.test(u.email);
                return (
                  <tr key={u.id}>
                    <td className="max-w-0 px-4 py-2.5">
                      <p className="truncate font-semibold text-ink">
                        {u.full_name || "(no name)"}
                      </p>
                      <p className="truncate text-xs text-ink-faint">
                        {u.email}
                        {u.student_id ? ` · ${u.student_id}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <select
                        className="input min-h-[36px] text-sm"
                        aria-label={`${u.full_name} role`}
                        value={u.role}
                        disabled={isGroupLogin}
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
                    </td>
                    <td className="px-4 py-2.5">
                      {HAS_GROUP.includes(u.role) && !isGroupLogin ? (
                        <select
                          className="input min-h-[36px] text-sm"
                          aria-label={`${u.full_name} group`}
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
                              {groupLabel(g)}
                            </option>
                          ))}
                        </select>
                      ) : u.group_id != null ? (
                        <span className="font-semibold tabular-nums">Group {u.group_id}</span>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {HAS_STATION.includes(u.role) ? (
                        <select
                          className="input min-h-[36px] text-sm"
                          aria-label={`${u.full_name} station`}
                          value={u.station_id ?? ""}
                          onChange={(e) =>
                            updateUser(u.id, {
                              station_id: e.target.value ? Number(e.target.value) : null,
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
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {!isGroupLogin && (
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            className="text-ink-soft hover:text-ink"
                            aria-label={`Edit ${u.full_name || u.email}`}
                          >
                            <Pencil size={16} strokeWidth={1.75} />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteUser(u)}
                            className="text-red-500 hover:text-red-700"
                            aria-label={`Delete ${u.full_name || u.email}`}
                          >
                            <Trash2 size={16} strokeWidth={1.75} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-faint">
                    {filtered ? "No accounts match these filters." : "No accounts yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        {!loading && (
          <p className="border-t border-paper-200 px-4 py-2 text-xs text-ink-faint">
            Showing {visible.length} of {users.length}. Freshie group logins are managed in
            Admin → Freshies.
          </p>
        )}
      </Card>

      {/* Add user */}
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) setCreated(null);
        }}
      >
        <DialogContent
          title={created ? "Account created" : "Add user"}
          description={
            created
              ? "Copy the password now. It is not shown again."
              : "A password is generated for the new account."
          }
        >
          {created ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-night-900 p-3 text-sm text-green-300">
                <p className="break-all">{created.email}</p>
                <p className="mt-1 select-all font-mono text-base">{created.password}</p>
              </div>
              <button type="button" className="btn-primary w-full" onClick={() => setAddOpen(false)}>
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={createUser} className="space-y-2">
              <input
                className="input"
                placeholder="Full name"
                required
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              />
              <input
                className="input"
                type="email"
                placeholder="Email"
                required
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
              <select
                className="input"
                aria-label="Role"
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
              >
                {STAFF_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              {HAS_GROUP.includes(newUser.role) && (
                <select
                  className="input"
                  aria-label="Group"
                  value={newUser.group}
                  onChange={(e) => setNewUser({ ...newUser, group: e.target.value })}
                >
                  <option value="">No group yet</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {groupLabel(g)}
                    </option>
                  ))}
                </select>
              )}
              {HAS_STATION.includes(newUser.role) && (
                <select
                  className="input"
                  aria-label="Station"
                  value={newUser.station}
                  onChange={(e) => setNewUser({ ...newUser, station: e.target.value })}
                >
                  <option value="">No station yet</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </option>
                  ))}
                </select>
              )}
              <button type="submit" disabled={busy} className="btn-primary w-full">
                Create account
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit user */}
      <Dialog open={editing != null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing && (
          <DialogContent title="Edit account" description={ROLE_LABELS[editing.role]}>
            <form onSubmit={saveEdit} className="space-y-2">
              <label className="label" htmlFor="edit-name">
                Full name
              </label>
              <input
                id="edit-name"
                className="input"
                required
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
              <label className="label" htmlFor="edit-email">
                Email (also their login)
              </label>
              <input
                id="edit-email"
                className="input"
                type="email"
                required
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
              <button type="submit" disabled={busy} className="btn-primary w-full">
                Save changes
              </button>
            </form>
            <div className="mt-4 space-y-2 border-t border-paper-200 pt-3">
              <button
                type="button"
                disabled={busy}
                onClick={resetPassword}
                className="btn-secondary w-full"
              >
                Reset password
              </button>
              {resetPw && (
                <div className="rounded-xl bg-night-900 p-3 text-sm text-green-300">
                  <p className="text-xs text-white/60">New password, shown once:</p>
                  <p className="mt-1 select-all font-mono text-base">{resetPw}</p>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>

      {/* CSV import */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent
          title="Import staff from CSV"
          description="Always dry-run first. Passwords are shown once after a real import."
          className="max-h-[90dvh] max-w-2xl"
        >
          <div className="space-y-2">
            <p className="text-xs text-ink-faint">
              Columns: <code>name,email,role,group,station</code> — role ∈{" "}
              faci/gm/guardian_gm/hof/hogm/committee/admin.
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
              <div className="rounded-xl bg-paper-100 p-3 text-sm">
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
