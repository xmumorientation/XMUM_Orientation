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

// Initial 12 groups generator
export function generateInitial12Groups(): TokenGroup[] {
  return Array.from({ length: 12 }, (_, i) => {
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

  const supabase = supabaseBrowser();
  try {
    const { data, error } = await supabase.rpc("fn_manual_token_adjust", {
      p_group_id: groupId,
      p_amount: amount,
      p_transaction_type: transactionType,
      p_notes: notes.trim() || "Manual adjustment",
    });

    if (!error && data?.ok) {
      return { ok: true, newTokens: data.new_tokens };
    }
  } catch (err) {
    console.warn("Supabase fn_manual_token_adjust fallback:", err);
  }

  // Fallback local mutation
  const groups = await fetchTokenGroups();
  const g = groups.find((grp) => grp.group_id === groupId);
  if (!g) return { ok: false, error: "Group not found." };

  g.current_tokens = Math.max(0, g.current_tokens + amount);

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
}): Promise<{ ok: boolean; error?: string }> {
  const { logId, newGroupId, newAmount, newNotes, newTransactionType } = params;
  const supabase = supabaseBrowser();

  const logs = await fetchTokenLogs();
  const existingLog = logs.find((l) => l.log_id === logId);
  if (!existingLog) {
    return { ok: false, error: "Transaction log not found." };
  }

  const oldGroupId = existingLog.group_id;
  const oldAmount = existingLog.amount;

  const groups = await fetchTokenGroups();

  if (oldGroupId === newGroupId) {
    const delta = newAmount - oldAmount;
    const g = groups.find((grp) => grp.group_id === oldGroupId);
    if (g) {
      g.current_tokens = Math.max(0, g.current_tokens + delta);
    }
  } else {
    const oldGroup = groups.find((grp) => grp.group_id === oldGroupId);
    if (oldGroup) {
      oldGroup.current_tokens = Math.max(0, oldGroup.current_tokens - oldAmount);
    }
    const newGroup = groups.find((grp) => grp.group_id === newGroupId);
    if (newGroup) {
      newGroup.current_tokens = Math.max(0, newGroup.current_tokens + newAmount);
    }
  }

  existingLog.group_id = newGroupId;
  existingLog.amount = newAmount;
  existingLog.notes = newNotes;
  existingLog.transaction_type = newTransactionType;

  try {
    await supabase.from("token_logs").update({
      group_id: newGroupId,
      amount: newAmount,
      notes: newNotes,
      transaction_type: newTransactionType,
    }).eq("log_id", logId);

    if (oldGroupId === newGroupId) {
      const g = groups.find((grp) => grp.group_id === oldGroupId);
      if (g) {
        await supabase.from("groups").update({
          current_tokens: g.current_tokens,
          token_balance: g.current_tokens,
        }).or(`id.eq.${oldGroupId},group_id.eq.${oldGroupId}`);
      }
    } else {
      const oldG = groups.find((grp) => grp.group_id === oldGroupId);
      if (oldG) {
        await supabase.from("groups").update({
          current_tokens: oldG.current_tokens,
          token_balance: oldG.current_tokens,
        }).or(`id.eq.${oldGroupId},group_id.eq.${oldGroupId}`);
      }
      const newG = groups.find((grp) => grp.group_id === newGroupId);
      if (newG) {
        await supabase.from("groups").update({
          current_tokens: newG.current_tokens,
          token_balance: newG.current_tokens,
        }).or(`id.eq.${newGroupId},group_id.eq.${newGroupId}`);
      }
    }
  } catch (err) {
    console.warn("Supabase updateTokenLog fallback:", err);
  }

  setLocalItem("groups", groups);
  setLocalItem("logs", logs);

  return { ok: true };
}

export async function deleteTokenLog(logId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = supabaseBrowser();
  const logs = await fetchTokenLogs();
  const existingLog = logs.find((l) => l.log_id === logId);
  if (!existingLog) {
    return { ok: false, error: "Transaction log not found." };
  }

  const { group_id, amount } = existingLog;
  const groups = await fetchTokenGroups();
  const g = groups.find((grp) => grp.group_id === group_id);
  if (g) {
    g.current_tokens = Math.max(0, g.current_tokens - amount);
  }

  const updatedLogs = logs.filter((l) => l.log_id !== logId);

  try {
    await supabase.from("token_logs").delete().eq("log_id", logId);
    if (g) {
      await supabase.from("groups").update({
        current_tokens: g.current_tokens,
        token_balance: g.current_tokens,
      }).or(`id.eq.${group_id},group_id.eq.${group_id}`);
    }
  } catch (err) {
    console.warn("Supabase deleteTokenLog fallback:", err);
  }

  setLocalItem("groups", groups);
  setLocalItem("logs", updatedLogs);

  return { ok: true };
}

export async function resetAllTokensAndPuzzles(): Promise<{ ok: boolean }> {
  const supabase = supabaseBrowser();
  try {
    await supabase.from("puzzle_inventory").delete().neq("inventory_id", -1);
    await supabase.from("token_logs").delete().neq("group_id", -1);
    await supabase.from("groups").update({ current_tokens: 0, token_balance: 0 }).neq("id", -1);
  } catch (err) {
    console.warn("Supabase reset fallback:", err);
  }

  const freshGroups = generateInitial12Groups();
  setLocalItem("groups", freshGroups);
  setLocalItem("logs", []);
  setLocalItem("puzzle_inv", []);

  return { ok: true };
}
