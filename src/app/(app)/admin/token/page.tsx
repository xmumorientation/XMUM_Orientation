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
  MinusCircle,
  Plus,
  PlusCircle,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Swords,
  Trash2,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { Card, PageTitle } from "@/components/ui";
import { useProfile } from "@/components/ProfileProvider";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  fetchPuzzleInventory,
  fetchTokenGroups,
  fetchTokenLogs,
  fetchTokenPresets,
  generateInitial12Groups,
  manualTokenAdjust,
  resetAllTokensAndPuzzles,
  saveTokenPresets,
  setTotalGroups,
  updateTokenLog,
  deleteTokenLog,
} from "@/lib/token-api";
import {
  DEFAULT_TOKEN_PRESETS,
  LOCATION_NAMES,
  type PuzzleInventoryItem,
  type TokenGroup,
  type TokenLog,
  type TokenPreset,
  type TransactionType,
} from "@/lib/token-types";
import { cn } from "@/lib/utils";

export default function AdminTokenAllInOnePage() {
  const profile = useProfile();
  const isAdmin = profile.role === "admin";
  const supabase = useMemo(() => supabaseBrowser(), []);

  // Core Data
  const [groups, setGroups] = useState<TokenGroup[]>(generateInitial12Groups());
  const [logs, setLogs] = useState<TokenLog[]>([]);
  const [inventory, setInventory] = useState<PuzzleInventoryItem[]>([]);
  const [presets, setPresets] = useState<TokenPreset[]>(DEFAULT_TOKEN_PRESETS);

  // Loading & Action State
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Unified Token Action State (Top Section) ──────────────────────────────
  const [selectedGroupId, setSelectedGroupId] = useState<number>(1);
  const [actionType, setActionType] = useState<"add" | "deduct">("add");
  const [tokenAmount, setTokenAmount] = useState<number>(2);
  const [auditNotes, setAuditNotes] = useState<string>("Day 1 Station Win Payout");
  const [activePresetId, setActivePresetId] = useState<string | null>("preset_d1_win");

  // Preset Manager Modal
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<TokenPreset | null>(null);
  const [newPresetForm, setNewPresetForm] = useState<Partial<TokenPreset>>({
    name: "",
    amount: 2,
    action: "add",
    defaultNote: "",
    tag: "Custom",
  });

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

  // ── Data Loader ───────────────────────────────────────────────────────────
  const loadAllData = useCallback(async () => {
    try {
      const [gData, lData, iData, pData] = await Promise.all([
        fetchTokenGroups(),
        fetchTokenLogs(),
        fetchPuzzleInventory(),
        fetchTokenPresets(),
      ]);
      setGroups(gData);
      setLogs(lData);
      setInventory(iData);
      if (pData && pData.length > 0) setPresets(pData);
    } catch (e: any) {
      console.error("Error loading token data:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();

    // Supabase Realtime Channel
    const channel = supabase
      .channel("token_all_in_one_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, () => loadAllData())
      .on("postgres_changes", { event: "*", schema: "public", table: "token_logs" }, () => loadAllData())
      .on("postgres_changes", { event: "*", schema: "public", table: "puzzle_inventory" }, () => loadAllData())
      .subscribe();

    const interval = setInterval(loadAllData, 4000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
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

  // Selected Group Helper
  const currentGroup = useMemo(() => {
    return (
      groups.find((g) => g.group_id === selectedGroupId) ||
      groups[0] || {
        group_id: selectedGroupId,
        group_name: `Group ${selectedGroupId}`,
        current_tokens: 0,
      }
    );
  }, [groups, selectedGroupId]);

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
  // PRESET CLICKS & MANAGEMENT
  // ──────────────────────────────────────────────────────────────────────────
  const handleApplyPreset = (preset: TokenPreset) => {
    setActivePresetId(preset.id);
    setActionType(preset.action);
    setTokenAmount(preset.amount);
    if (preset.defaultNote) {
      setAuditNotes(preset.defaultNote);
    }
  };

  const handleSaveNewPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetForm.name || !newPresetForm.amount) {
      notifyError("Preset name and amount are required.");
      return;
    }

    const preset: TokenPreset = {
      id: editingPreset ? editingPreset.id : "preset_" + Date.now(),
      name: newPresetForm.name.trim(),
      amount: Math.max(1, Number(newPresetForm.amount)),
      action: newPresetForm.action || "add",
      defaultNote: (newPresetForm.defaultNote || "").trim(),
      tag: (newPresetForm.tag || "Custom").trim(),
    };

    let updatedList = [...presets];
    if (editingPreset) {
      updatedList = updatedList.map((p) => (p.id === editingPreset.id ? preset : p));
    } else {
      updatedList.push(preset);
    }

    setPresets(updatedList);
    await saveTokenPresets(updatedList);
    notifySuccess(`Preset "${preset.name}" saved!`);
    setEditingPreset(null);
    setNewPresetForm({ name: "", amount: 2, action: "add", defaultNote: "", tag: "Custom" });
    setPresetModalOpen(false);
  };

  const handleDeletePreset = async (id: string) => {
    const updatedList = presets.filter((p) => p.id !== id);
    setPresets(updatedList);
    await saveTokenPresets(updatedList);
    notifySuccess("Preset deleted.");
  };

  const startEditPreset = (preset: TokenPreset) => {
    setEditingPreset(preset);
    setNewPresetForm({
      name: preset.name,
      amount: preset.amount,
      action: preset.action,
      defaultNote: preset.defaultNote,
      tag: preset.tag || "Custom",
    });
    setPresetModalOpen(true);
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

    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await updateTokenLog({
        logId: editingLog.log_id,
        newGroupId: Number(editLogForm.groupId),
        newAmount: Number(editLogForm.amount),
        newNotes: editLogForm.notes.trim(),
        newTransactionType: editLogForm.transactionType,
      });

      if (res.ok) {
        notifySuccess("✓ Transaction log updated & group balance synchronized!");
        setEditLogModalOpen(false);
        setEditingLog(null);
        await loadAllData();
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
        await loadAllData();
      } else {
        notifyError(res.error || "Failed to delete transaction.");
      }
    } catch (err: any) {
      notifyError(err.message || "Error deleting log.");
    } finally {
      setBusy(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // APPLY TOKEN ACTION (Add / Deduct)
  // ──────────────────────────────────────────────────────────────────────────
  const handleApplyTokenUpdate = async () => {
    if (!tokenAmount || tokenAmount <= 0) {
      notifyError("Please enter a valid token amount (greater than 0).");
      return;
    }

    const delta = actionType === "add" ? Math.abs(tokenAmount) : -Math.abs(tokenAmount);
    const noteText = auditNotes.trim() || `${actionType === "add" ? "Added" : "Deducted"} tokens`;

    // Deduct balance check
    if (actionType === "deduct" && currentGroup.current_tokens < Math.abs(delta)) {
      if (
        !window.confirm(
          `Warning: Group ${selectedGroupId} only has ${currentGroup.current_tokens} tokens. Deducting ${Math.abs(
            delta
          )} tokens will set balance to 0. Continue?`
        )
      ) {
        return;
      }
    }

    setBusy(true);
    setErrorMsg(null);

    try {
      const classification: TransactionType =
        noteText.toLowerCase().includes("day 1") || noteText.toLowerCase().includes("win") || noteText.toLowerCase().includes("lose")
          ? "DAY1_GAME"
          : noteText.toLowerCase().includes("day 2") || noteText.toLowerCase().includes("entry")
          ? "DAY2_ENTRY"
          : "MANUAL_ADMIN_ADJUST";

      const res = await manualTokenAdjust({
        groupId: selectedGroupId,
        amount: delta,
        transactionType: classification,
        notes: noteText,
      });

      if (res.ok) {
        notifySuccess(
          `✓ Success! ${actionType === "add" ? "Added" : "Deducted"} ${Math.abs(delta)} tokens ${
            actionType === "add" ? "to" : "from"
          } Group ${selectedGroupId}. New balance: ${res.newTokens} tokens.`
        );
        await loadAllData();
      } else {
        notifyError(res.error || "Failed to update group tokens.");
      }
    } catch (e: any) {
      notifyError(e.message || "Error processing token update.");
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
      await loadAllData();
    } catch (e: any) {
      notifyError(e.message || "Reset failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-20">
      {/* ── Top Header & Global Actions ────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 font-black shadow-lg shadow-amber-500/20">
              <Coins size={20} />
            </span>
            <PageTitle
              title="Token & Scoreboard Control"
              subtitle="All-in-One Realtime Group Operator & Live Leaderboard"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => loadAllData()}
            disabled={busy}
            className="btn-secondary min-h-[38px] px-3.5 text-xs font-semibold"
          >
            <RefreshCw size={14} className={cn(busy && "animate-spin")} />
            Sync Now
          </button>
          {isAdmin && (
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

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* SECTION 1: TOP UNIFIED TOKEN OPERATOR & PRESET MANAGER                    */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      <Card className="border-amber-500/30 bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 p-5 sm:p-6 shadow-2xl space-y-5 ring-1 ring-amber-500/20 text-white">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-3.5">
          <div className="flex items-center gap-2">
            <Zap size={20} className="text-amber-400" />
            <h2 className="text-lg font-black text-white tracking-wide">Quick Token Operator</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Target Group:</span>
            <span className="chip bg-amber-400/20 text-amber-300 font-bold border border-amber-400/30 text-xs">
              Group {selectedGroupId} ({currentGroup.current_tokens} Tokens)
            </span>
          </div>
        </div>

        {/* Step 1 & Step 2 & Step 3: Controls Grid */}
        <div className="grid gap-4 sm:grid-cols-12">
          {/* Group Selector */}
          <div className="sm:col-span-4 space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
              1. Select Group
            </label>
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm font-black text-white focus:border-amber-500 focus:outline-none shadow-inner"
            >
              {groups.map((g) => (
                <option key={g.group_id} value={g.group_id}>
                  {g.group_name} — ({g.current_tokens} tokens)
                </option>
              ))}
            </select>
          </div>

          {/* Action Toggle (Add vs Deduct) */}
          <div className="sm:col-span-4 space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
              2. Operation Type
            </label>
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-950 p-1 border border-slate-800">
              <button
                type="button"
                onClick={() => setActionType("add")}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-black transition-all",
                  actionType === "add"
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                    : "text-slate-400 hover:text-white"
                )}
              >
                <PlusCircle size={15} /> (+) Add
              </button>
              <button
                type="button"
                onClick={() => setActionType("deduct")}
                className={cn(
                  "flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-black transition-all",
                  actionType === "deduct"
                    ? "bg-rose-600 text-white shadow-md shadow-rose-600/30"
                    : "text-slate-400 hover:text-white"
                )}
              >
                <MinusCircle size={15} /> (-) Deduct
              </button>
            </div>
          </div>

          {/* Token Amount Input */}
          <div className="sm:col-span-4 space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
              3. Token Number
            </label>
            <div className="relative">
              <input
                type="number"
                min="1"
                value={tokenAmount}
                onChange={(e) => {
                  setTokenAmount(Math.max(1, Number(e.target.value)));
                  setActivePresetId(null);
                }}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-base font-black text-amber-300 focus:border-amber-500 focus:outline-none shadow-inner tabular-nums"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                tokens
              </span>
            </div>
          </div>
        </div>

        {/* Quick Amount Presets Bar (Admin Customizable) */}
        <div className="space-y-2 rounded-2xl bg-slate-950/70 p-4 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-300">
              <Sparkles size={14} className="text-amber-400" />
              Quick Presets (Click to Auto-Fill):
            </span>
            {isAdmin && (
              <button
                onClick={() => {
                  setEditingPreset(null);
                  setNewPresetForm({ name: "", amount: 2, action: "add", defaultNote: "", tag: "Custom" });
                  setPresetModalOpen(true);
                }}
                className="flex items-center gap-1 text-[11px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors"
              >
                <Settings size={13} />
                Manage / + Add Presets
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {presets.map((preset) => {
              const isSelected = activePresetId === preset.id;
              const isAdd = preset.action === "add";

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black transition-all border shadow-sm",
                    isSelected
                      ? isAdd
                        ? "border-emerald-400 bg-emerald-600 text-white shadow-emerald-500/25 scale-[1.03] ring-2 ring-emerald-400/40"
                        : "border-rose-400 bg-rose-600 text-white shadow-rose-500/25 scale-[1.03] ring-2 ring-rose-400/40"
                      : isAdd
                      ? "border-emerald-500/30 bg-emerald-950/30 text-emerald-300 hover:bg-emerald-900/50 hover:border-emerald-400"
                      : "border-rose-500/30 bg-rose-950/30 text-rose-300 hover:bg-rose-900/50 hover:border-rose-400"
                  )}
                >
                  <span>{preset.name}</span>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[10px] font-black",
                      isSelected ? "bg-black/30 text-white" : "bg-slate-900 text-white"
                    )}
                  >
                    {isAdd ? `+${preset.amount}` : `-${preset.amount}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Audit Note Input & Submit Button */}
        <div className="grid gap-3 sm:grid-cols-12 pt-1">
          <div className="sm:col-span-7 space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
              Audit Reason / Note (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Day 1 Station Win / Day 2 Entry Fee / Spirit Bonus"
              value={auditNotes}
              onChange={(e) => setAuditNotes(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-5 flex items-end">
            <button
              onClick={handleApplyTokenUpdate}
              disabled={busy}
              className={cn(
                "w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-black shadow-xl transition-all active:scale-[0.98]",
                actionType === "add"
                  ? "bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600 text-white shadow-emerald-600/30 hover:brightness-110"
                  : "bg-gradient-to-r from-rose-600 via-red-600 to-amber-700 text-white shadow-rose-600/30 hover:brightness-110"
              )}
            >
              {actionType === "add" ? <PlusCircle size={18} /> : <MinusCircle size={18} />}
              {actionType === "add" ? "Apply Add" : "Apply Deduct"}{" "}
              <span className="font-mono underline">
                {actionType === "add" ? `+${tokenAmount}` : `-${tokenAmount}`} Tokens
              </span>{" "}
              → Group {selectedGroupId}
            </button>
          </div>
        </div>
      </Card>

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

        {/* 12 Groups Scoreboard Grid (Clean White Background with Border) */}
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {sortedGroups.map((grp, index) => {
            const isTop1 = index === 0 && scoreSortBy === "tokens";
            const isTop2 = index === 1 && scoreSortBy === "tokens";
            const isTop3 = index === 2 && scoreSortBy === "tokens";
            const isTargeted = grp.group_id === selectedGroupId;

            return (
              <div
                key={grp.group_id}
                className={cn(
                  "relative overflow-hidden rounded-2xl border p-4.5 transition-all duration-200 bg-white shadow-sm hover:shadow-md",
                  isTargeted
                    ? "ring-2 ring-amber-500 border-amber-500/90 bg-amber-50/20"
                    : isTop1
                    ? "border-amber-300 ring-1 ring-amber-400/50 bg-gradient-to-b from-amber-50/40 to-white"
                    : isTop2
                    ? "border-slate-300 bg-gradient-to-b from-slate-50/60 to-white"
                    : isTop3
                    ? "border-amber-200 bg-gradient-to-b from-amber-50/20 to-white"
                    : "border-slate-200/90 hover:border-slate-300"
                )}
              >
                {/* Header Rank Badge & Select for Action */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-lg text-xs font-black shadow-sm",
                        isTop1
                          ? "bg-amber-400 text-slate-950"
                          : isTop2
                          ? "bg-slate-200 text-slate-800"
                          : isTop3
                          ? "bg-amber-100 text-amber-900 border border-amber-300"
                          : "bg-slate-100 text-slate-700"
                      )}
                    >
                      #{index + 1}
                    </span>
                    <span className="font-black text-slate-900 text-base tracking-tight">{grp.group_name}</span>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedGroupId(grp.group_id);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-[11px] font-black transition-all border",
                      isTargeted
                        ? "border-amber-500 bg-amber-500 text-slate-950 shadow-sm"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-900"
                    )}
                  >
                    {isTargeted ? "● Selected" : "Select"}
                  </button>
                </div>

                {/* Token Balance Box */}
                <div className="my-3 flex items-baseline justify-between rounded-xl bg-slate-50 px-3.5 py-2.5 border border-slate-100">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                      Token Balance
                    </span>
                    <div className="flex items-center gap-1.5 text-2xl font-black text-amber-600 tabular-nums">
                      <Coins size={20} className="text-amber-500" />
                      <span>{grp.current_tokens}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                      Puzzle Pieces
                    </span>
                    <div className="flex items-center justify-end gap-1 text-lg font-black text-indigo-600 tabular-nums">
                      <Layers size={16} />
                      <span>{grp.puzzles_count || 0} / 15</span>
                    </div>
                  </div>
                </div>

                {/* 3 Locations Blueprint Matrix */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Location Blueprint Pieces:
                  </span>
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    {[1, 2, 3].map((locId) => {
                      const locPieces = grp.location_pieces?.[locId] || [];
                      const count = locPieces.length;
                      const meta = LOCATION_NAMES[locId];
                      return (
                        <div
                          key={locId}
                          className={cn(
                            "rounded-lg border p-1.5 text-xs transition-colors",
                            count > 0
                              ? "border-indigo-200 bg-indigo-50/80 text-indigo-900"
                              : "border-slate-100 bg-slate-50 text-slate-400"
                          )}
                        >
                          <div className="font-bold text-[10px] text-slate-600">{meta.short}</div>
                          <div className={cn("font-black text-xs", count > 0 ? "text-indigo-700" : "text-slate-400")}>
                            {count} pcs
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

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

      {/* ────────────────────────────────────────────────────────────────────────── */}
      {/* MODAL: ADMIN PRESET MANAGER (Create, Edit, Delete Presets)                */}
      {/* ────────────────────────────────────────────────────────────────────────── */}
      {isAdmin && presetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-lg">
                <Settings size={22} />
                Manage Quick Token Presets
              </div>
              <button
                onClick={() => setPresetModalOpen(false)}
                className="text-slate-400 hover:text-white font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {/* Existing Presets List */}
            <div className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Active Quick Presets ({presets.length}):
              </span>
              <div className="grid gap-2 max-h-48 overflow-y-auto pr-1">
                {presets.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl bg-slate-950 p-2.5 border border-slate-800 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "chip font-black text-[10px]",
                          p.action === "add" ? "bg-emerald-950 text-emerald-300" : "bg-rose-950 text-rose-300"
                        )}
                      >
                        {p.action === "add" ? `+${p.amount}` : `-${p.amount}`}
                      </span>
                      <span className="font-bold text-white">{p.name}</span>
                      {p.defaultNote && (
                        <span className="text-slate-400 italic text-[11px] truncate max-w-[150px]">
                          ({p.defaultNote})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => startEditPreset(p)}
                        className="rounded p-1 text-slate-400 hover:text-cyan-300"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePreset(p.id)}
                        className="rounded p-1 text-slate-400 hover:text-rose-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Form to Add / Edit Preset */}
            <form onSubmit={handleSaveNewPreset} className="space-y-3 rounded-2xl bg-slate-950/80 p-4 border border-slate-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                {editingPreset ? "Edit Preset" : "+ Add New Quick Preset"}
              </h4>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Preset Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Day 1 Win Payout"
                    value={newPresetForm.name || ""}
                    onChange={(e) => setNewPresetForm({ ...newPresetForm, name: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-400">Action Type *</label>
                  <select
                    value={newPresetForm.action || "add"}
                    onChange={(e) => setNewPresetForm({ ...newPresetForm, action: e.target.value as any })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="add">(+) Add Tokens</option>
                    <option value="deduct">(-) Deduct Tokens</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Token Amount *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newPresetForm.amount || 2}
                    onChange={(e) => setNewPresetForm({ ...newPresetForm, amount: Number(e.target.value) })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs text-slate-400">Tag / Category</label>
                  <input
                    type="text"
                    placeholder="e.g. Day 1, Day 2, Bonus"
                    value={newPresetForm.tag || ""}
                    onChange={(e) => setNewPresetForm({ ...newPresetForm, tag: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">Default Audit Note / Reason</label>
                <input
                  type="text"
                  placeholder="e.g. Day 1 Station Victory Payout"
                  value={newPresetForm.defaultNote || ""}
                  onChange={(e) => setNewPresetForm({ ...newPresetForm, defaultNote: e.target.value })}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                {editingPreset && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPreset(null);
                      setNewPresetForm({ name: "", amount: 2, action: "add", defaultNote: "", tag: "Custom" });
                    }}
                    className="btn-secondary min-h-[36px] px-3 text-xs"
                  >
                    Cancel Edit
                  </button>
                )}
                <button
                  type="submit"
                  className="rounded-xl bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500 shadow-md shadow-cyan-600/30"
                >
                  {editingPreset ? "Update Preset" : "Save Preset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
