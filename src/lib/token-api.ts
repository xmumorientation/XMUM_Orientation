import { supabaseBrowser } from "@/lib/supabase/client";
import {
  DEFAULT_RULES,
  DEFAULT_TOKEN_PRESETS,
  DIFFICULTY_COST_DEFAULTS,
  type GameConfigRule,
  type GameDifficulty,
  type PuzzleInventoryItem,
  type StationItem,
  type TokenGroup,
  type TokenLog,
  type TokenPreset,
  type TransactionType,
} from "./token-types";

// Read-only local snapshots make loading resilient. Gameplay mutations never
// fall back locally because device-only balances would diverge from Supabase.
const LOCAL_STORAGE_KEY_PREFIX = "xmum_token_system_";
const LOCAL_MUTATION_FALLBACK = false;

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

// Initial stations generator
export function generateInitialStations(): StationItem[] {
  return [
    { station_id: 101, day: 1, station_name: "A4 Speed Puzzle", difficulty: "NONE", token_cost: 0 },
    { station_id: 102, day: 1, station_name: "B1 Mystery Maze", difficulty: "NONE", token_cost: 0 },
    { station_id: 103, day: 1, station_name: "Courts Tug-Of-War", difficulty: "NONE", token_cost: 0 },
    { station_id: 104, day: 1, station_name: "A5 Brain Teaser", difficulty: "NONE", token_cost: 0 },
    { station_id: 201, day: 2, station_name: "B1 Easy Challenge", difficulty: "EASY", token_cost: 2 },
    { station_id: 202, day: 2, station_name: "A3 Medium Quest", difficulty: "MEDIUM", token_cost: 4 },
    { station_id: 203, day: 2, station_name: "TF Hard Trial", difficulty: "HARD", token_cost: 6 },
    { station_id: 204, day: 2, station_name: "Courts Apex Showdown", difficulty: "HARD", token_cost: 6 },
  ];
}

// ── Preset Management APIs ────────────────────────────────────────────────

export async function fetchTokenPresets(): Promise<TokenPreset[]> {
  const supabase = supabaseBrowser();
  try {
    const { data, error } = await supabase
      .from("game_config_rules")
      .select("rule_value")
      .eq("rule_key", "APP_TOKEN_PRESETS_JSON")
      .single();

    if (!error && data && data.rule_value) {
      const parsed = typeof data.rule_value === "string" ? JSON.parse(data.rule_value) : data.rule_value;
      if (Array.isArray(parsed) && parsed.length > 0) {
        setLocalItem("presets", parsed);
        return parsed;
      }
    }
  } catch (err) {
    console.warn("Supabase fetchTokenPresets fallback:", err);
  }

  return getLocalItem<TokenPreset[]>("presets", DEFAULT_TOKEN_PRESETS);
}

export async function saveTokenPresets(presets: TokenPreset[]): Promise<{ ok: boolean }> {
  setLocalItem("presets", presets);
  const supabase = supabaseBrowser();
  try {
    await supabase.from("game_config_rules").upsert({
      rule_key: "APP_TOKEN_PRESETS_JSON",
      rule_value: 0,
      description: JSON.stringify(presets),
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("Supabase saveTokenPresets fallback:", err);
  }
  return { ok: true };
}

// ── Read APIs ─────────────────────────────────────────────────────────────

export async function fetchTokenGroups(): Promise<TokenGroup[]> {
  const supabase = supabaseBrowser();
  try {
    const [{ data: groupsData, error: gErr }, { data: invData, error: iErr }] = await Promise.all([
      supabase.from("groups").select("*").order("id"),
      supabase.from("puzzle_inventory").select("*"),
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
        const tokens = row.current_tokens ?? row.token_balance ?? 0;
        const inv = invByGroup[id] || { count: 0, locs: { 1: [], 2: [], 3: [] } };
        return {
          group_id: id,
          group_name: name,
          current_tokens: tokens,
          puzzles_count: inv.count,
          location_pieces: inv.locs,
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

export async function fetchPuzzleInventory(groupId?: number): Promise<PuzzleInventoryItem[]> {
  const supabase = supabaseBrowser();
  try {
    let query = supabase
      .from("puzzle_inventory")
      .select("*")
      .order("created_at", { ascending: false });

    if (groupId) {
      query = query.eq("group_id", groupId);
    }

    const { data, error } = await query;
    if (!error && data) {
      setLocalItem("puzzle_inv", data);
      return data as PuzzleInventoryItem[];
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

export async function fetchStations(): Promise<StationItem[]> {
  const supabase = supabaseBrowser();
  try {
    const { data, error } = await supabase
      .from("stations")
      .select("*")
      .order("id");
    if (!error && data && data.length > 0) {
      const items: StationItem[] = data.map((d: any) => ({
        station_id: d.station_id ?? d.id,
        day: d.day ?? 1,
        station_name: d.station_name ?? d.name ?? `Station ${d.id}`,
        difficulty: (d.difficulty as GameDifficulty) || (d.risk_tier === "low" ? "EASY" : d.risk_tier === "medium" ? "MEDIUM" : d.risk_tier === "high" ? "HARD" : "NONE"),
        token_cost: d.token_cost ?? d.entry_cost ?? (DIFFICULTY_COST_DEFAULTS[(d.difficulty as GameDifficulty)] ?? 0),
      }));
      setLocalItem("stations", items);
      return items;
    }
  } catch (err) {
    console.warn("Supabase fetchStations fallback:", err);
  }
  return getLocalItem<StationItem[]>("stations", generateInitialStations());
}

// ── Mutation APIs (Atomic with Local State Sync) ──────────────────────────

export async function recordDay1Result(params: {
  winGroupId?: number | null;
  loseGroupId?: number | null;
  stationId?: number | null;
  notes?: string;
}): Promise<{ ok: boolean; message?: string; error?: string }> {
  const { winGroupId, loseGroupId, stationId, notes } = params;
  if (!winGroupId && !loseGroupId) {
    return { ok: false, error: "Please select at least a WIN or LOSE group." };
  }
  if (winGroupId && loseGroupId && winGroupId === loseGroupId) {
    return { ok: false, error: "WIN group and LOSE group cannot be the same group." };
  }

  const supabase = supabaseBrowser();
  try {
    const { data, error } = await supabase.rpc("fn_day1_record_result", {
      p_win_group_id: winGroupId || null,
      p_lose_group_id: loseGroupId || null,
      p_station_id: stationId || null,
      p_notes: notes || "Day 1 Station Battle",
    });

    if (!error && data?.ok) {
      return { ok: true, message: "Day 1 game results recorded successfully!" };
    }
  } catch (err) {
    console.warn("Supabase fn_day1_record_result fallback:", err);
  }

  if (!LOCAL_MUTATION_FALLBACK) return { ok: false, error: "Could not save the Day 1 result. No tokens were changed." };

  // Fallback local mutation
  const rules = await fetchGameConfigRules();
  const winVal = rules.find((r) => r.rule_key === "DAY1_WIN_TOKENS")?.rule_value ?? 2;
  const loseVal = rules.find((r) => r.rule_key === "DAY1_LOSE_TOKENS")?.rule_value ?? 1;

  const groups = await fetchTokenGroups();
  const logs = await fetchTokenLogs();

  if (winGroupId) {
    const g = groups.find((grp) => grp.group_id === winGroupId);
    if (g) g.current_tokens += winVal;
    logs.unshift({
      log_id: "log_" + Date.now() + "_w",
      group_id: winGroupId,
      amount: winVal,
      transaction_type: "DAY1_GAME",
      station_id: stationId || null,
      notes: notes || "Day 1 Station Victory (+WIN)",
      created_at: new Date().toISOString(),
    });
  }

  if (loseGroupId) {
    const g = groups.find((grp) => grp.group_id === loseGroupId);
    if (g) g.current_tokens += loseVal;
    logs.unshift({
      log_id: "log_" + Date.now() + "_l",
      group_id: loseGroupId,
      amount: loseVal,
      transaction_type: "DAY1_GAME",
      station_id: stationId || null,
      notes: notes || "Day 1 Station Participation (+LOSE)",
      created_at: new Date().toISOString(),
    });
  }

  setLocalItem("groups", groups);
  setLocalItem("logs", logs);

  return { ok: true, message: "Day 1 game results recorded (Local sync)!" };
}

export async function deductDay2Entry(params: {
  groupId: number;
  tokenCost: number;
  stationId?: number | null;
  notes?: string;
}): Promise<{ ok: boolean; remainingTokens?: number; error?: string }> {
  const { groupId, tokenCost, stationId, notes } = params;
  const supabase = supabaseBrowser();

  try {
    const { data, error } = await supabase.rpc("fn_day2_deduct_entry", {
      p_group_id: groupId,
      p_token_cost: tokenCost,
      p_station_id: stationId || null,
      p_notes: notes || "Day 2 Station Entry Fee",
    });

    if (!error && data) {
      if (!data.ok) {
        return { ok: false, error: data.error || "Insufficient tokens to play this station." };
      }
      return { ok: true, remainingTokens: data.remaining_tokens };
    }
  } catch (err) {
    console.warn("Supabase fn_day2_deduct_entry fallback:", err);
  }

  if (!LOCAL_MUTATION_FALLBACK) return { ok: false, error: "Could not deduct tokens. No tokens were changed." };

  // Fallback local mutation
  const groups = await fetchTokenGroups();
  const targetGroup = groups.find((g) => g.group_id === groupId);
  if (!targetGroup) return { ok: false, error: "Group not found." };
  if (targetGroup.current_tokens < tokenCost) {
    return {
      ok: false,
      error: `Insufficient tokens to play this station. Needs ${tokenCost} tokens, Group ${groupId} currently has ${targetGroup.current_tokens}.`,
    };
  }

  targetGroup.current_tokens -= tokenCost;
  const logs = await fetchTokenLogs();
  logs.unshift({
    log_id: "log_" + Date.now() + "_d2",
    group_id: groupId,
    amount: -tokenCost,
    transaction_type: "DAY2_ENTRY",
    station_id: stationId || null,
    notes: notes || "Day 2 Station Entry Fee",
    created_at: new Date().toISOString(),
  });

  setLocalItem("groups", groups);
  setLocalItem("logs", logs);

  return { ok: true, remainingTokens: targetGroup.current_tokens };
}

export async function awardDay2PuzzlePiece(params: {
  groupId: number;
  locationId: number;
  pieceId: string;
  stationId?: number | null;
}): Promise<{ ok: boolean; pieceId: string; locationId: number; error?: string }> {
  const { groupId, locationId, pieceId, stationId } = params;
  const supabase = supabaseBrowser();

  try {
    const { data, error } = await supabase.rpc("fn_day2_award_piece", {
      p_group_id: groupId,
      p_location_id: locationId,
      p_piece_id: pieceId,
      p_station_id: stationId || null,
    });

    if (!error && data?.ok) {
      return { ok: true, pieceId, locationId };
    }
  } catch (err) {
    console.warn("Supabase fn_day2_award_piece fallback:", err);
  }

  if (!LOCAL_MUTATION_FALLBACK) return { ok: false, pieceId, locationId, error: "Could not award the puzzle piece. Nothing was changed." };

  // Fallback local mutation
  const inv = await fetchPuzzleInventory();
  inv.unshift({
    inventory_id: Date.now(),
    group_id: groupId,
    location_id: locationId,
    piece_id: pieceId,
    station_id: stationId || null,
    created_at: new Date().toISOString(),
  });

  const groups = await fetchTokenGroups();
  const g = groups.find((grp) => grp.group_id === groupId);
  if (g) {
    g.puzzles_count = (g.puzzles_count || 0) + 1;
    if (!g.location_pieces) g.location_pieces = { 1: [], 2: [], 3: [] };
    if (!g.location_pieces[locationId]) g.location_pieces[locationId] = [];
    g.location_pieces[locationId].push(pieceId);
  }

  setLocalItem("puzzle_inv", inv);
  setLocalItem("groups", groups);

  return { ok: true, pieceId, locationId };
}

export async function manualTokenAdjust(params: {
  groupId: number;
  amount: number;
  transactionType?: TransactionType;
  notes?: string;
}): Promise<{ ok: boolean; newTokens?: number; error?: string }> {
  const { groupId, amount, transactionType = "MANUAL_ADMIN_ADJUST", notes = "Manual token adjustment" } = params;

  // Pre-check for insufficient tokens before deduction
  if (amount < 0) {
    const preCheckGroups = await fetchTokenGroups();
    const targetGroup = preCheckGroups.find((g) => g.group_id === groupId);
    if (targetGroup && targetGroup.current_tokens < Math.abs(amount)) {
      return {
        ok: false,
        error: `Insufficient tokens: Group ${groupId} only has ${targetGroup.current_tokens} tokens, cannot deduct ${Math.abs(amount)} tokens. Action denied.`,
      };
    }
  }

  const supabase = supabaseBrowser();
  try {
    const { data, error } = await supabase.rpc("fn_manual_token_adjust", {
      p_group_id: groupId,
      p_amount: amount,
      p_transaction_type: transactionType,
      p_notes: notes.trim() || "Manual adjustment",
    });

    if (!error && data) {
      if (!data.ok) {
        return {
          ok: false,
          error: data.error || `Insufficient tokens. Cannot deduct ${Math.abs(amount)} tokens.`,
        };
      }
      return { ok: true, newTokens: data.new_tokens };
    }

    if (error) {
      console.warn("Supabase fn_manual_token_adjust error:", error);
      return {
        ok: false,
        error: error.message || "Failed to adjust group tokens.",
      };
    }
  } catch (err: any) {
    console.warn("Supabase fn_manual_token_adjust fallback:", err);
  }

  if (!LOCAL_MUTATION_FALLBACK) return { ok: false, error: "Could not adjust tokens. No tokens were changed." };

  // Fallback local mutation
  const groups = await fetchTokenGroups();
  const g = groups.find((grp) => grp.group_id === groupId);
  if (!g) return { ok: false, error: "Group not found." };

  if (amount < 0 && g.current_tokens < Math.abs(amount)) {
    return {
      ok: false,
      error: `Insufficient tokens: Group ${groupId} only has ${g.current_tokens} tokens, cannot deduct ${Math.abs(amount)} tokens. Action denied.`,
    };
  }

  g.current_tokens = g.current_tokens + amount;

  const logs = await fetchTokenLogs();
  logs.unshift({
    log_id: "log_" + Date.now() + "_m",
    group_id: groupId,
    amount,
    transaction_type: transactionType,
    station_id: null,
    notes: notes.trim() || "Manual adjustment",
    created_at: new Date().toISOString(),
  });

  setLocalItem("groups", groups);
  setLocalItem("logs", logs);

  return { ok: true, newTokens: g.current_tokens };
}

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

  if (!LOCAL_MUTATION_FALLBACK) return { ok: false, error: "Could not update the group count." };

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

export async function updateGameConfigRule(
  ruleKey: string,
  ruleValue: number
): Promise<{ ok: boolean; error?: string }> {
  const supabase = supabaseBrowser();
  try {
    const { data, error } = await supabase.rpc("fn_update_game_config_rule", {
      p_rule_key: ruleKey,
      p_rule_value: ruleValue,
    });

    if (!error && data?.ok) {
      return { ok: true };
    }
  } catch (err) {
    console.warn("Supabase fn_update_game_config_rule fallback:", err);
  }

  if (!LOCAL_MUTATION_FALLBACK) return { ok: false, error: "Could not update the token rule." };

  // Fallback local mutation
  const rules = await fetchGameConfigRules();
  const r = rules.find((item) => item.rule_key === ruleKey);
  if (r) {
    r.rule_value = ruleValue;
    r.updated_at = new Date().toISOString();
  } else {
    rules.push({
      rule_id: Date.now(),
      day: ruleKey.startsWith("DAY1") ? 1 : 2,
      rule_key: ruleKey,
      rule_value: ruleValue,
      updated_at: new Date().toISOString(),
    });
  }
  setLocalItem("rules", rules);
  return { ok: true };
}

export async function updateTokenLog(params: {
  logId: string;
  newGroupId: number;
  newAmount: number;
  newNotes: string;
  newTransactionType: TransactionType;
  correctionReason?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { logId, newGroupId, newAmount, newNotes, newTransactionType, correctionReason } = params;
  const supabase = supabaseBrowser();
  try {
    const { data, error } = await supabase.rpc("fn_correct_token_log", {
      p_log_id: logId,
      p_new_group_id: newGroupId,
      p_new_amount: newAmount,
      p_new_transaction_type: newTransactionType,
      p_new_notes: newNotes.trim() || "Corrected transaction",
      p_reason: correctionReason?.trim() || newNotes.trim() || "Admin ledger correction",
    });
    if (error) return { ok: false, error: error.message };
    if (!data?.ok) return { ok: false, error: data?.error || "Correction failed." };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Correction failed." };
  }
}

export async function deleteTokenLog(logId: string, reason = "Admin reversal"): Promise<{ ok: boolean; error?: string }> {
  const supabase = supabaseBrowser();
  try {
    const { data, error } = await supabase.rpc("fn_reverse_token_log", {
      p_log_id: logId,
      p_reason: reason.trim() || "Admin reversal",
    });
    if (error) return { ok: false, error: error.message };
    if (!data?.ok) return { ok: false, error: data?.error || "Reversal failed." };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Reversal failed." };
  }
}

export async function resetAllTokensAndPuzzles(): Promise<{ ok: boolean }> {
  const supabase = supabaseBrowser();
  try {
    const { data, error } = await supabase.rpc("fn_reset_token_state", {
      p_reason: "Admin reset of Token and puzzle state",
    });
    if (error || !data?.ok) return { ok: false };
  } catch (err: any) {
    console.warn("Supabase reset failed:", err);
    return { ok: false };
  }

  const freshGroups = generateInitial12Groups();
  setLocalItem("groups", freshGroups);
  setLocalItem("puzzle_inv", []);

  return { ok: true };
}
