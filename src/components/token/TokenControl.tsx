"use client";

import {
  AlertCircle,
  Award,
  CheckCircle2,
  ChevronDown,
  Coins,
  Crown,
  Edit3,
  Flame,
  History,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Swords,
  Trash2,
  Trophy,
  Users,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Card, PageTitle } from "@/components/ui";
import { useProfile } from "@/components/ProfileProvider";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  fetchGameConfigRules,
  fetchPuzzleInventory,
  fetchTokenGroups,
  fetchTokenLogs,
  generateInitial12Groups,
  resetAllTokensAndPuzzles,
  setTotalGroups,
  updateGameConfigRule,
  updateTokenLog,
  deleteTokenLog,
} from "@/lib/token-api";
import {
  LOCATION_NAMES,
  TOKEN_RULES,
  type PuzzleInventoryItem,
  type TokenGroup,
  type TokenLog,
  type TokenRuleKey,
  type TransactionType,
} from "@/lib/token-types";
import { cn } from "@/lib/utils";

import "./token-control.css";

// Admin Token page (/admin/token) shows everything. Other staff (/token)
// get scoreboardOnly: the live leaderboard, without the rules and the log.
export default function TokenControl({ scoreboardOnly = false }: { scoreboardOnly?: boolean }) {
  const profile = useProfile();
  const isAdmin = profile.role === "admin";
  const supabase = useMemo(() => supabaseBrowser(), []);

  // Core Data
  const [groups, setGroups] = useState<TokenGroup[]>(generateInitial12Groups());
  const [logs, setLogs] = useState<TokenLog[]>([]);
  const [inventory, setInventory] = useState<PuzzleInventoryItem[]>([]);
  // Token rules: saved values, plus unsaved edits on top of them
  const [rules, setRules] = useState<Record<TokenRuleKey, number>>(
    () => Object.fromEntries(TOKEN_RULES.map((r) => [r.key, r.fallback])) as Record<TokenRuleKey, number>
  );
  const [ruleDraft, setRuleDraft] = useState<Partial<Record<TokenRuleKey, number>>>({});

  // Loading & Action State
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Edit Audit Log Modal State (Admin Only) ──────────────────────────────
  const [editLogModalOpen, setEditLogModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<TokenLog | null>(null);
  const [editLogForm, setEditLogForm] = useState<{
    groupId: number;
    amount: number;
    notes: string;
    transactionType: TransactionType;
  }>({
    groupId: 1,
    amount: 2,
    notes: "",
    transactionType: "MANUAL_ADMIN_ADJUST",
  });

  // ── Scoreboard Controls ───────────────────────────────────────────────────
  const [scoreSearch, setScoreSearch] = useState("");
  const [scoreSortBy, setScoreSortBy] = useState<"tokens" | "puzzles" | "id">("tokens");

  // ── Audit Log Filters ─────────────────────────────────────────────────────
  const [auditGroupFilter, setAuditGroupFilter] = useState<string>("all");
  const [auditTypeFilter, setAuditTypeFilter] = useState<string>("all");
  const [auditSearchQuery, setAuditSearchQuery] = useState<string>("");

  // A refresh is shared across callers; a change during a request queues one fresh pass.
  const refreshInFlight = useRef<Promise<void> | null>(null);
  const refreshQueued = useRef(false);
  const mounted = useRef(false);
  const loadAllData = useCallback((freshAfterFlight = false): Promise<void> => {
    if (refreshInFlight.current) {
      if (freshAfterFlight) refreshQueued.current = true;
      return refreshInFlight.current;
    }
    setLoading(true);
    const request = (async () => {
      do {
        refreshQueued.current = false;
        try {
          const inventoryRequest = fetchPuzzleInventory();
          const [gData, lData, iData, rData] = await Promise.all([
            fetchTokenGroups(inventoryRequest), fetchTokenLogs(), inventoryRequest, fetchGameConfigRules(),
          ]);
          if (!mounted.current) return;
          setGroups(gData);
          setLogs(lData);
          setInventory(iData);
          setRules((cur) => {
            const next = { ...cur };
            for (const r of rData) {
              if (r.rule_key in next) next[r.rule_key as TokenRuleKey] = r.rule_value;
            }
            return next;
          });
        } catch (error: unknown) {
          console.error("Error loading token data:", error);
        }
      } while (refreshQueued.current && mounted.current);
    })();
    refreshInFlight.current = request;
    void request.finally(() => { refreshInFlight.current = null; if (mounted.current) setLoading(false); });
    return request;
  }, []);

  useEffect(() => {
    mounted.current = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshSoon = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => { void loadAllData(true); }, 180);
    };
    void loadAllData();
    const channel = supabase
      .channel("token_all_in_one_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "token_logs" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "puzzle_inventory" }, refreshSoon)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_config_rules" }, refreshSoon)
      .subscribe();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void loadAllData();
    }, 30_000);
    document.addEventListener("visibilitychange", refreshSoon);
    return () => {
      mounted.current = false;
      clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshSoon);
    };
  }, [loadAllData, supabase]);

  // Flash Notifications
  const notifySuccess = (msg: string) => {
    setSuccessMsg(msg);
    setErrorMsg(null);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const notifyError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  // Computed Leaderboard stats
  const totalTokens = useMemo(() => groups.reduce((sum, g) => sum + g.current_tokens, 0), [groups]);
  const totalPuzzles = useMemo(() => groups.reduce((sum, g) => sum + (g.puzzles_count || 0), 0), [groups]);
  const leadingGroup = useMemo(() => {
    return [...groups].sort((a, b) => b.current_tokens - a.current_tokens)[0] || groups[0];
  }, [groups]);

  // Filtered & Sorted Groups for Scoreboard
  const sortedGroups = useMemo(() => {
    let list = [...groups];
    if (scoreSearch.trim()) {
      const q = scoreSearch.toLowerCase();
      list = list.filter((g) => g.group_name.toLowerCase().includes(q) || String(g.group_id).includes(q));
    }
    if (scoreSortBy === "tokens") {
      list.sort((a, b) => b.current_tokens - a.current_tokens || (b.puzzles_count || 0) - (a.puzzles_count || 0));
    } else if (scoreSortBy === "puzzles") {
      list.sort((a, b) => (b.puzzles_count || 0) - (a.puzzles_count || 0) || b.current_tokens - a.current_tokens);
    } else {
      list.sort((a, b) => a.group_id - b.group_id);
    }
    return list;
  }, [groups, scoreSearch, scoreSortBy]);

  // Filtered Logs for Audit Stream
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (auditGroupFilter !== "all" && log.group_id !== Number(auditGroupFilter)) return false;
      if (auditTypeFilter !== "all" && log.transaction_type !== auditTypeFilter) return false;
      if (auditSearchQuery.trim()) {
        const q = auditSearchQuery.toLowerCase();
        const matchesNotes = log.notes?.toLowerCase().includes(q);
        const matchesGroup = `group ${log.group_id}`.includes(q);
        const matchesType = log.transaction_type.toLowerCase().includes(q);
        if (!matchesNotes && !matchesGroup && !matchesType) return false;
      }
      return true;
    });
  }, [logs, auditGroupFilter, auditTypeFilter, auditSearchQuery]);

  // ──────────────────────────────────────────────────────────────────────────
  // TOKEN RULES (Admin only; the GM Station page and the database read these)
  // ──────────────────────────────────────────────────────────────────────────
  const dirtyRuleKeys = TOKEN_RULES.map((r) => r.key).filter(
    (k) => ruleDraft[k] !== undefined && ruleDraft[k] !== rules[k]
  );

  const handleSaveRules = async () => {
    for (const rule of TOKEN_RULES) {
      const value = ruleDraft[rule.key];
      if (value === undefined) continue;
      if (!Number.isInteger(value) || value < rule.min || value > 50) {
        notifyError(`${rule.label}: enter a whole number from ${rule.min} to 50.`);
        return;
      }
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      for (const key of dirtyRuleKeys) {
        const res = await updateGameConfigRule(key, ruleDraft[key] as number);
        if (!res.ok) {
          notifyError(res.error || "Failed to save token rules.");
          return;
        }
      }
      setRuleDraft({});
      notifySuccess("✓ Token rules saved. GMs use the new amounts straight away.");
      await loadAllData(true);
    } finally {
      setBusy(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // AUDIT LOG EDIT & DELETE ACTIONS (Admin Only)
  // ──────────────────────────────────────────────────────────────────────────
  const handleStartEditLog = (log: TokenLog) => {
    setEditingLog(log);
    setEditLogForm({
      groupId: log.group_id,
      amount: log.amount,
      notes: log.notes || "",
      transactionType: log.transaction_type,
    });
    setEditLogModalOpen(true);
  };

  const handleSaveEditLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLog) return;

    const targetGroupId = Number(editLogForm.groupId);
    const newAmt = Number(editLogForm.amount);
    const oldAmt = editingLog.amount;
    const oldGrpId = editingLog.group_id;

    if (oldGrpId === targetGroupId) {
      const delta = newAmt - oldAmt;
      const grp = groups.find((g) => g.group_id === oldGrpId);
      if (grp && grp.current_tokens + delta < 0) {
        notifyError(
          `⛔ Action Denied: Group ${oldGrpId} only has ${grp.current_tokens} tokens. Editing this log would result in a negative balance (${grp.current_tokens + delta}).`
        );
        return;
      }
    } else {
      const oldG = groups.find((g) => g.group_id === oldGrpId);
      if (oldG && oldG.current_tokens - oldAmt < 0) {
        notifyError(
          `⛔ Action Denied: Group ${oldGrpId} does not have enough tokens (${oldG.current_tokens}) to reverse this transaction.`
        );
        return;
      }
      const newG = groups.find((g) => g.group_id === targetGroupId);
      if (newG && newG.current_tokens + newAmt < 0) {
        notifyError(`⛔ Action Denied: Group ${targetGroupId} token balance cannot become negative.`);
        return;
      }
    }

    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await updateTokenLog({
        logId: editingLog.log_id,
        newGroupId: targetGroupId,
        newAmount: newAmt,
        newNotes: editLogForm.notes.trim(),
        newTransactionType: editLogForm.transactionType,
      });

      if (res.ok) {
        notifySuccess("✓ Transaction log updated & group balance synchronized!");
        setEditLogModalOpen(false);
        setEditingLog(null);
        await loadAllData(true);
      } else {
        notifyError(res.error || "Failed to update transaction log.");
      }
    } catch (err: any) {
      notifyError(err.message || "Error updating log.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteLog = async (log: TokenLog) => {
    const grp = groups.find((g) => g.group_id === log.group_id);
    if (log.amount > 0 && grp && grp.current_tokens < log.amount) {
      notifyError(
        `⛔ Action Denied: Cannot delete transaction. Group ${log.group_id} only has ${grp.current_tokens} tokens, reversing +${log.amount} tokens would cause a negative balance.`
      );
      return;
    }

    if (
      !window.confirm(
        `Are you sure you want to delete this transaction?\n\nGroup ${log.group_id}: ${
          log.amount >= 0 ? `+${log.amount}` : log.amount
        } tokens (${log.notes || log.transaction_type})\n\nThis will reverse ${
          log.amount >= 0 ? `-${log.amount}` : `+${Math.abs(log.amount)}`
        } tokens from Group ${log.group_id}'s balance.`
      )
    ) {
      return;
    }

    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await deleteTokenLog(log.log_id);
      if (res.ok) {
        notifySuccess(`✓ Transaction deleted & Group ${log.group_id} balance adjusted!`);
        await loadAllData(true);
      } else {
        notifyError(res.error || "Failed to delete transaction.");
      }
    } catch (err: any) {
      notifyError(err.message || "Error deleting log.");
    } finally {
      setBusy(false);
    }
  };

  // Reset All
  const handleResetAll = async () => {
    if (!window.confirm("⚠️ DANGER: Reset all 10 groups to 0 tokens and clear all puzzle inventory & logs?")) {
      return;
    }
    setBusy(true);
    try {
      await resetAllTokensAndPuzzles();
      notifySuccess("All group tokens, puzzle inventory, and transaction logs have been reset.");
      await loadAllData(true);
    } catch (e: any) {
      notifyError(e.message || "Reset failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tk space-y-6 pb-6" aria-busy={loading}>
      {/* ── Top Header & Global Actions ────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-black shadow-lg shadow-amber-500/20">
              <Coins size={20} />
            </span>
            <PageTitle
              title={scoreboardOnly ? "Scoreboard" : "Token & Scoreboard Control"}
              subtitle={
                scoreboardOnly
                  ? "Live group tokens and puzzle pieces"
                  : "Token rules, live scoreboard and transaction log"
              }
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => loadAllData()}
            disabled={busy || loading}
            className="btn-secondary min-h-[38px] px-3.5 text-xs font-semibold"
          >
            <RefreshCw size={14} className={cn((busy || loading) && "animate-spin")} />
            {loading ? "Syncing…" : "Sync Now"}
          </button>
          {isAdmin && !scoreboardOnly && (
            <button
              onClick={handleResetAll}
              disabled={busy}
              className="btn-secondary min-h-[38px] border-red-300 text-red-700 hover:bg-red-50 px-3 text-xs font-semibold"
            >
              <ShieldAlert size={14} />
              Reset State
            </button>
          )}
        </div>
      </div>

      {/* ── Notification Banners ────────────────────────────────────────────── */}
      {errorMsg && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-red-500/40 bg-red-950/50 p-4 text-sm text-red-200 backdrop-blur-md animate-fade-in shadow-lg">
          <AlertCircle size={18} className="shrink-0 text-red-400 mt-0.5" />
          <div className="flex-1 font-medium">{errorMsg}</div>
          <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-200 text-xs font-bold">
            ✕
          </button>
        </div>
      )}

      {successMsg && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-500/40 bg-emerald-950/50 p-4 text-sm text-emerald-200 backdrop-blur-md animate-fade-in shadow-lg">
          <CheckCircle2 size={18} className="shrink-0 text-emerald-400 mt-0.5" />
          <div className="flex-1 font-medium">{successMsg}</div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200 text-xs font-bold">
            ✕
          </button>
        </div>
      )}

      {!scoreboardOnly && (
        <>
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* SECTION 1: TOKEN RULES (the GM Station page pays and charges these)       */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <Card className="border-amber-500/30 bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 p-5 sm:p-6 shadow-2xl space-y-5 ring-1 ring-amber-500/20 text-white">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <Settings size={20} className="text-amber-400" />
              <h2 className="text-lg font-black text-white tracking-wide">Token Rules</h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              GMs give and charge exactly these amounts on the Station page. A change applies to every GM straight away.
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={handleSaveRules}
              disabled={busy || dirtyRuleKeys.length === 0}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-black transition-all",
                dirtyRuleKeys.length > 0
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 hover:brightness-110"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              )}
            >
              <CheckCircle2 size={15} />
              {dirtyRuleKeys.length > 0 ? `Save ${dirtyRuleKeys.length} change${dirtyRuleKeys.length > 1 ? "s" : ""}` : "Saved"}
            </button>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          {([1, 2] as const).map((day) => (
            <div
              key={day}
              className={cn(
                "space-y-2 rounded-2xl bg-slate-950/70 p-4 border border-slate-800",
                day === 1 ? "lg:col-span-2" : "lg:col-span-3"
              )}
            >
              <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300">
                {day === 1 ? <Trophy size={14} className="text-emerald-400" /> : <Swords size={14} className="text-rose-400" />}
                {day === 1 ? "Day 1 rewards" : "Day 2 entry fee (per station tier)"}
              </span>
              <div className={cn("grid gap-2", day === 1 ? "grid-cols-2" : "grid-cols-3")}>
                {TOKEN_RULES.filter((r) => r.day === day).map((rule) => {
                  const value = ruleDraft[rule.key] ?? rules[rule.key];
                  const dirty = dirtyRuleKeys.includes(rule.key);
                  const add = rule.sign > 0;
                  return (
                    <label
                      key={rule.key}
                      className={cn(
                        "block rounded-xl border p-3 transition-colors",
                        dirty
                          ? "border-amber-400 bg-amber-950/30"
                          : add
                          ? "border-emerald-500/30 bg-emerald-950/30"
                          : "border-rose-500/30 bg-rose-950/30"
                      )}
                    >
                      <span className={cn("block text-xs font-black", add ? "text-emerald-300" : "text-rose-300")}>
                        {rule.label}
                      </span>
                      <span className="block text-[11px] text-slate-400">{rule.hint}</span>
                      <span className="mt-2 flex items-center gap-1">
                        <span className={cn("text-lg font-black", add ? "text-emerald-300" : "text-rose-300")}>
                          {add ? "+" : "−"}
                        </span>
                        {isAdmin ? (
                          <input
                            type="number"
                            min={rule.min}
                            max={50}
                            value={value}
                            aria-label={`${day === 1 ? "Day 1" : "Day 2"} ${rule.label} tokens`}
                            onChange={(e) =>
                              setRuleDraft((d) => ({ ...d, [rule.key]: Math.trunc(Number(e.target.value)) }))
                            }
                            className="w-full min-w-0 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-base font-black text-white tabular-nums focus:border-amber-500 focus:outline-none"
                          />
                        ) : (
                          <span className="text-lg font-black text-white tabular-nums">{value}</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>
        </>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* SECTION 2: LIVE 12-GROUPS SCOREBOARD & LEADERBOARD (CLEAN WHITE CARDS)    */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {/* Scoreboard Metrics & Section Title */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Trophy size={22} className="text-amber-500" />
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Live Group Leaderboard & Blueprint Matrix
            </h2>
          </div>

          {/* Quick Metrics Chips */}
          <div className="flex items-center gap-2">
            <span className="chip bg-white border border-slate-200 text-slate-700 text-xs font-bold shadow-sm">
              Total Tokens: <strong className="text-amber-600 ml-1 font-black">{totalTokens}</strong>
            </span>
            <span className="chip bg-white border border-slate-200 text-slate-700 text-xs font-bold shadow-sm">
              Leader: <strong className="text-slate-900 ml-1 font-black">{leadingGroup?.group_name}</strong>
            </span>
          </div>
        </div>

        {/* Search & Sort Controls (Clean White Background) */}
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between rounded-2xl bg-white p-3.5 border border-slate-200 shadow-sm">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search group name or number (1-10)..."
              value={scoreSearch}
              onChange={(e) => setScoreSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3.5 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:bg-white focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Sort by:</span>
            <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
              {[
                { id: "tokens", label: "Tokens" },
                { id: "puzzles", label: "Puzzles" },
                { id: "id", label: "Group #" },
              ].map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={scoreSortBy === s.id}
                  onClick={() => setScoreSortBy(s.id as any)}
                  className={cn(
                    "px-3 py-1 text-xs font-bold rounded-lg transition-all",
                    scoreSortBy === s.id
                      ? "bg-white text-slate-900 shadow-sm font-black"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {sortedGroups.map((grp, index) => {
            const isTop1 = index === 0 && scoreSortBy === "tokens";
            const isTop2 = index === 1 && scoreSortBy === "tokens";
            const isTop3 = index === 2 && scoreSortBy === "tokens";

            return (
              <div
                key={grp.group_id}
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border bg-white px-3 py-3 shadow-sm",
                  isTop1
                    ? "border-amber-300"
                    : "border-slate-200"
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black",
                      isTop1
                        ? "bg-amber-400 text-slate-950"
                        : isTop2
                        ? "bg-slate-200 text-slate-800"
                        : isTop3
                        ? "border border-amber-300 bg-amber-100 text-amber-900"
                        : "bg-slate-100 text-slate-700"
                    )}
                  >
                    {index + 1}
                  </span>
                  <span className="truncate font-black text-slate-900">{grp.group_name}</span>
                </div>

                <div className="flex items-center gap-1.5 text-lg font-black tabular-nums text-amber-600">
                  <Coins size={16} className="text-amber-500" />
                  {grp.current_tokens}
                </div>
                <div className="flex items-center gap-1 text-sm font-black tabular-nums text-indigo-600">
                  <Layers size={14} />
                  {grp.puzzles_count || 0}/15
                </div>
                <div className="flex flex-wrap gap-1">
                  {[1, 2, 3].map((locId) => {
                    const count = grp.location_pieces?.[locId]?.length || 0;
                    const meta = LOCATION_NAMES[locId];
                    return (
                      <span
                        key={locId}
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 text-[10px] font-bold",
                          count > 0
                            ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                            : "border-slate-100 bg-slate-50 text-slate-400"
                        )}
                      >
                        {meta.short} {count}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!scoreboardOnly && (
        <>
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* SECTION 3: LIVE AUDIT LOGS & ACTIVITY STREAM (CLEAN WHITE CARD)           */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <Card className="border-slate-200 bg-white p-5 sm:p-6 shadow-sm space-y-4 rounded-2xl">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-2">
            <History size={20} className="text-cyan-600" />
            <h2 className="text-lg font-black text-slate-900 tracking-tight">
              Live Transaction History & Audit Stream
            </h2>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            Showing {filteredLogs.length} of {logs.length} logged actions
          </span>
        </div>

        {/* Filters Bar */}
        <div className="grid gap-2.5 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-500 uppercase tracking-wider">
              Filter by Group
            </label>
            <select
              value={auditGroupFilter}
              onChange={(e) => setAuditGroupFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-cyan-500 focus:bg-white focus:outline-none"
            >
              <option value="all">All Groups (1-12)</option>
              {groups.map((g) => (
                <option key={g.group_id} value={g.group_id}>
                  {g.group_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-500 uppercase tracking-wider">
              Filter by Type
            </label>
            <select
              value={auditTypeFilter}
              onChange={(e) => setAuditTypeFilter(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 focus:border-cyan-500 focus:bg-white focus:outline-none"
            >
              <option value="all">All Transaction Types</option>
              <option value="DAY1_GAME">DAY1_GAME</option>
              <option value="DAY2_ENTRY">DAY2_ENTRY</option>
              <option value="MANUAL_ADMIN_ADJUST">MANUAL_ADMIN_ADJUST</option>
              <option value="MANUAL_GM_ADJUST">MANUAL_GM_ADJUST</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-500 uppercase tracking-wider">
              Search Notes / Text
            </label>
            <input
              type="text"
              placeholder="Search notes..."
              value={auditSearchQuery}
              onChange={(e) => setAuditSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-cyan-500 focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        {/* Logs Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 uppercase font-bold">
                <th className="pb-2.5">Time</th>
                <th className="pb-2.5">Group</th>
                <th className="pb-2.5">Delta</th>
                <th className="pb-2.5">Type</th>
                <th className="pb-2.5">Notes</th>
                {isAdmin && <th className="pb-2.5 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="py-8 text-center text-slate-400">
                    No transactions recorded yet.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.log_id} className="hover:bg-slate-50">
                    <td className="py-2.5 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                      {new Date(log.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="py-2.5 font-bold text-slate-900">Group {log.group_id}</td>
                    <td className="py-2.5 font-black text-sm">
                      <span className={log.amount >= 0 ? "text-emerald-600" : "text-rose-600"}>
                        {log.amount >= 0 ? `+${log.amount}` : log.amount}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <span
                        className={cn(
                          "chip text-[10px] font-bold font-mono",
                          log.transaction_type === "DAY1_GAME"
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : log.transaction_type === "DAY2_ENTRY"
                            ? "bg-indigo-50 text-indigo-800 border border-indigo-200"
                            : "bg-cyan-50 text-cyan-800 border border-cyan-200"
                        )}
                      >
                        {log.transaction_type}
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-600">{log.notes || "—"}</td>
                    {isAdmin && (
                      <td className="py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleStartEditLog(log)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-cyan-700 transition"
                            title="Edit log & synchronize balance"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteLog(log)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                            title="Delete log & reverse balance"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
        </>
      )}

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: EDIT AUDIT LOG (Admin Only)                                        */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {isAdmin && editLogModalOpen && editingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-5 text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-lg">
                <Edit3 size={20} />
                Edit Transaction Log
              </div>
              <button
                onClick={() => {
                  setEditLogModalOpen(false);
                  setEditingLog(null);
                }}
                className="text-slate-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditLog} className="space-y-4">
              <div className="rounded-xl bg-slate-950 p-3 border border-slate-800 text-xs text-slate-300">
                <p>
                  Modifying this log entry will automatically recalculate the target group&apos;s current token balance to correct any human errors.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-400">Target Group</label>
                  <select
                    value={editLogForm.groupId}
                    onChange={(e) => setEditLogForm({ ...editLogForm, groupId: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-white focus:border-amber-500 focus:outline-none"
                  >
                    {groups.map((g) => (
                      <option key={g.group_id} value={g.group_id}>
                        {g.group_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-400">Amount (+ / -)</label>
                  <input
                    type="number"
                    required
                    value={editLogForm.amount}
                    onChange={(e) => setEditLogForm({ ...editLogForm, amount: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-amber-300 focus:border-amber-500 focus:outline-none tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-400">Transaction Classification</label>
                <select
                  value={editLogForm.transactionType}
                  onChange={(e) =>
                    setEditLogForm({ ...editLogForm, transactionType: e.target.value as TransactionType })
                  }
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-medium text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="DAY1_GAME">DAY1_GAME</option>
                  <option value="DAY2_ENTRY">DAY2_ENTRY</option>
                  <option value="MANUAL_ADMIN_ADJUST">MANUAL_ADMIN_ADJUST</option>
                  <option value="MANUAL_GM_ADJUST">MANUAL_GM_ADJUST</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-slate-400">Audit Notes / Reason</label>
                <input
                  type="text"
                  placeholder="Audit notes..."
                  value={editLogForm.notes}
                  onChange={(e) => setEditLogForm({ ...editLogForm, notes: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditLogModalOpen(false);
                    setEditingLog(null);
                  }}
                  className="btn-secondary min-h-[36px] px-3 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-black text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20"
                >
                  {busy ? "Saving..." : "Save & Synchronize Balance"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
