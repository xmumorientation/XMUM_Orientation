import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/utils";
import {
  DEFAULT_RULES,
  type GameConfigRule,
  type PuzzleInventoryItem,
  type TokenGroup,
  type TokenLog,
  type TransactionType,
} from "./token-types";

// In-memory / local fallback store for seamless dev & offline resilience
const LOCAL_STORAGE_KEY_PREFIX = "xmum_token_system_";

function getLocalItem<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setLocalItem<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + key, JSON.stringify(value));
  } catch (e) {
    console.error("Local storage write error:", e);
  }
}

// Initial groups generator (Default: 10 Groups)
export function generateInitialGroups(count = 10): TokenGroup[] {
  return Array.from({ length: count }, (_, i) => {
    const id = i + 1;
    return {
      group_id: id,
      group_name: `Group ${id}`,
      current_tokens: 0,
      puzzles_count: 0,
      location_pieces: { 1: [], 2: [], 3: [] },
    };
  });
}

export const generateInitial12Groups = () => generateInitialGroups(10);

// ── Read APIs ─────────────────────────────────────────────────────────────

export async function fetchTokenGroups(inventory?: Promise<PuzzleInventoryItem[]>): Promise<TokenGroup[]> {
  const supabase = supabaseBrowser();
  try {
    const [{ data: groupsData, error: gErr }, { data: invData, error: iErr }] = await Promise.all([
      supabase.from("groups").select("*").order("id"),
      (inventory ?? fetchPuzzleInventory()).then(data => ({ data, error: null })),
    ]);

    if (!gErr && groupsData && groupsData.length > 0) {
      const invByGroup: Record<number, { count: number; locs: Record<number, string[]> }> = {};
      if (!iErr && invData) {
        for (const item of invData as PuzzleInventoryItem[]) {
          if (!invByGroup[item.group_id]) {
            invByGroup[item.group_id] = { count: 0, locs: { 1: [], 2: [], 3: [] } };
          }
          invByGroup[item.group_id].count++;
          if (!invByGroup[item.group_id].locs[item.location_id]) {
            invByGroup[item.group_id].locs[item.location_id] = [];
          }
          invByGroup[item.group_id].locs[item.location_id].push(item.piece_id);
        }
      }

      const groups: TokenGroup[] = groupsData.map((row: any) => {
        const id = row.group_id ?? row.id;
        const name = row.group_name ?? row.name ?? `Group ${id}`;
        const tokens = row.token_balance ?? row.current_tokens ?? 0;
        const inv = invByGroup[id] || { count: 0, locs: { 1: [], 2: [], 3: [] } };
        return {
          group_id: id,
          group_name: name,
          current_tokens: tokens,
          puzzles_count: inv.count,
          location_pieces: inv.locs,
          color: row.color ?? null,
          display_name: row.display_name ?? null,
        };
      });

      // Cache locally
      setLocalItem("groups", groups);
      return groups;
    }
  } catch (err) {
    console.warn("Supabase fetchTokenGroups fallback:", err);
  }

  // Fallback to local storage or generated
  return getLocalItem<TokenGroup[]>("groups", generateInitial12Groups());
}

export async function fetchGameConfigRules(): Promise<GameConfigRule[]> {
  const supabase = supabaseBrowser();
  try {
    const { data, error } = await supabase
      .from("game_config_rules")
      .select("*")
      .order("day")
      .order("rule_id");
    if (!error && data && data.length > 0) {
      setLocalItem("rules", data);
      return data as GameConfigRule[];
    }
  } catch (err) {
    console.warn("Supabase fetchGameConfigRules fallback:", err);
  }
  return getLocalItem<GameConfigRule[]>("rules", DEFAULT_RULES);
}

export async function fetchTokenLogs(groupId?: number): Promise<TokenLog[]> {
  const supabase = supabaseBrowser();
  try {
    let query = supabase
      .from("token_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (groupId) {
      query = query.eq("group_id", groupId);
    }

    const { data, error } = await query;
    if (!error && data) {
      setLocalItem("logs", data);
      return data as TokenLog[];
    }
  } catch (err) {
    console.warn("Supabase fetchTokenLogs fallback:", err);
  }
  const allLogs = getLocalItem<TokenLog[]>("logs", []);
  if (groupId) {
    return allLogs.filter((l) => l.group_id === groupId);
  }
  return allLogs;
}

// Puzzle pieces come from `inventory` + `items`, where a Day 2 station win
// (fn_day2_challenge) writes them; the same rows the Freshie Items page shows.
// (`puzzle_inventory` from the old token system is not written by the game.)
// Mapped to this page's shape: B1 = 1, A3 = 2, TF = 3 (LOCATION_NAMES).
const LOCATION_ID: Record<string, number> = { B1: 1, A3: 2, TF: 3 };

type InventoryPieceRow = {
  id: number;
  group_id: number;
  created_at: string;
  items: { puzzle_location: string | null; puzzle_index: number | null } | null;
};

export async function fetchPuzzleInventory(groupId?: number): Promise<PuzzleInventoryItem[]> {
  const supabase = supabaseBrowser();
  try {
    let query = supabase
      .from("inventory")
      .select("id, group_id, created_at, items!inner(type, puzzle_location, puzzle_index)")
      .eq("items.type", "puzzle")
      .order("created_at", { ascending: false });

    if (groupId) {
      query = query.eq("group_id", groupId);
    }

    const { data, error } = await query;
    if (!error && data) {
      const pieces: PuzzleInventoryItem[] = (data as unknown as InventoryPieceRow[])
        .filter((row) => row.items?.puzzle_location && LOCATION_ID[row.items.puzzle_location])
        .map((row) => {
          const loc = LOCATION_ID[row.items!.puzzle_location!];
          return {
            inventory_id: row.id,
            group_id: row.group_id,
            location_id: loc,
            piece_id: `LOC${loc}_P${row.items!.puzzle_index ?? 0}`,
            station_id: null,
            created_at: row.created_at,
          };
        });
      setLocalItem("puzzle_inv", pieces);
      return pieces;
    }
  } catch (err) {
    console.warn("Supabase fetchPuzzleInventory fallback:", err);
  }
  const allInv = getLocalItem<PuzzleInventoryItem[]>("puzzle_inv", []);
  if (groupId) {
    return allInv.filter((item) => item.group_id === groupId);
  }
  return allInv;
}

// ── Mutation APIs (Atomic with Local State Sync) ──────────────────────────

export async function setTotalGroups(
  targetCount: number
): Promise<{ ok: boolean; totalGroups?: number; message?: string; error?: string }> {
  if (!targetCount || targetCount < 1) {
    return { ok: false, error: "Total groups count must be at least 1." };
  }

  const supabase = supabaseBrowser();
  try {
    const { data, error } = await supabase.rpc("fn_set_total_groups", {
      p_target_count: targetCount,
    });

    if (!error && data?.ok) {
      // Re-sync local items
      const freshGroups = await fetchTokenGroups();
      setLocalItem("groups", freshGroups);
      return { ok: true, totalGroups: data.total_groups, message: data.message };
    }
  } catch (err) {
    console.warn("Supabase fn_set_total_groups fallback:", err);
  }

  // Fallback local mutation
  const currentGroups = await fetchTokenGroups();
  let updatedGroups: TokenGroup[];
  if (targetCount >= currentGroups.length) {
    updatedGroups = [...currentGroups];
    for (let i = currentGroups.length + 1; i <= targetCount; i++) {
      updatedGroups.push({
        group_id: i,
        group_name: `Group ${i}`,
        current_tokens: 0,
        puzzles_count: 0,
        location_pieces: { 1: [], 2: [], 3: [] },
      });
    }
  } else {
    updatedGroups = currentGroups.slice(0, targetCount);
  }

  setLocalItem("groups", updatedGroups);
  return { ok: true, totalGroups: targetCount, message: `Configured for ${targetCount} groups (Local sync)` };
}

// Admin-only on the server (fn_update_game_config_rule, migration 0046).
// No local fallback: a rule that did not save must not look saved, because
// GMs charge and pay from these values.
export async function updateGameConfigRule(
  ruleKey: string,
  ruleValue: number
): Promise<{ ok: boolean; error?: string }> {
  const supabase = supabaseBrowser();
  const { data, error } = await supabase.rpc("fn_update_game_config_rule", {
    p_rule_key: ruleKey,
    p_rule_value: ruleValue,
  });
  if (error) return { ok: false, error: error.message };
  if (!data?.ok) return { ok: false, error: "Rule was not saved." };
  return { ok: true };
}

// Admin-only on the server (fn_admin_update_token_log / fn_admin_delete_token_log,
// migration 0102): the log row, the balances and the audit row change in one
// transaction. No local fallback: a change that did not save must not look saved.
function tokenLogError(message: string): string {
  if (message.includes("NEGATIVE_BALANCE")) {
    return "Action denied: this would leave a group with a negative token balance (or an invalid transaction type).";
  }
  if (message.includes("LOG_NOT_FOUND")) return "Transaction log not found.";
  if (message.includes("GROUP_NOT_FOUND")) return "Group not found.";
  if (message.includes("PERMISSION_DENIED")) return "Only Admin can change a transaction.";
  return message;
}

export async function updateTokenLog(params: {
  logId: string;
  newGroupId: number;
  newAmount: number;
  newNotes: string;
  newTransactionType: TransactionType;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = supabaseBrowser();
  const { data, error } = await supabase.rpc("fn_admin_update_token_log", {
    p_log_id: params.logId,
    p_group_id: params.newGroupId,
    p_amount: params.newAmount,
    p_notes: params.newNotes,
    p_type: params.newTransactionType,
  });
  if (error) return { ok: false, error: tokenLogError(error.message) };
  if (!data?.ok) return { ok: false, error: "Transaction was not updated." };
  return { ok: true };
}

export async function deleteTokenLog(logId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = supabaseBrowser();
  const { data, error } = await supabase.rpc("fn_admin_delete_token_log", { p_log_id: logId });
  if (error) return { ok: false, error: tokenLogError(error.message) };
  if (!data?.ok) return { ok: false, error: "Transaction was not deleted." };
  return { ok: true };
}

// Reset State (Admin → Token page). The database does the work and the rules:
// fn_reset_tokens_and_puzzles (migration 0056) is Admin-only and refuses unless
// Rehearsal mode is on. Errors are thrown so the page shows why it was refused.
export async function resetAllTokensAndPuzzles(): Promise<{ ok: boolean }> {
  const supabase = supabaseBrowser();
  const { error } = await supabase.rpc("fn_reset_tokens_and_puzzles");
  if (error) throw new Error(friendlyError(error));

  const freshGroups = generateInitial12Groups();
  setLocalItem("groups", freshGroups);
  setLocalItem("logs", []);
  setLocalItem("puzzle_inv", []);

  return { ok: true };
}
