"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentUserContext } from "@/components/ProfileProvider";
import { Card, ErrorBanner, PageTitle, Spinner, SuccessBanner } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Station } from "@/lib/types";
import { cn, friendlyError } from "@/lib/utils";

type Setting = { key: string; value: unknown; version: number };
type Tab = "GENERAL" | "BLIND_BOX" | "LIGHTING";
type Difficulty = "EASY" | "MEDIUM" | "HARD";

const GAME_KEYS = [
  ["day1_win_reward", "Day 1 win reward"], ["day1_lose_reward", "Day 1 lose reward"],
  ["max_station_attempts", "Maximum station attempts"],
  ["bonding_session_duration_day1", "Day 1 duration (minutes)"],
  ["bonding_session_duration_day2", "Day 2 duration (minutes)"],
] as const;
const DIFFICULTIES = [
  { value: "EASY" as Difficulty, label: "Easy", costKey: "day2_easy_token_cost", exclusionKey: "day2_easy_exclusion_limit", defaultCost: "2", defaultExclusions: "0" },
  { value: "MEDIUM" as Difficulty, label: "Medium", costKey: "day2_medium_token_cost", exclusionKey: "day2_medium_exclusion_limit", defaultCost: "4", defaultExclusions: "1" },
  { value: "HARD" as Difficulty, label: "Hard", costKey: "day2_hard_token_cost", exclusionKey: "day2_hard_exclusion_limit", defaultCost: "6", defaultExclusions: "2" },
] as const;
const DIFFICULTY_KEYS = DIFFICULTIES.flatMap((item) => [[item.costKey, `${item.label} token cost`], [item.exclusionKey, `${item.label} exclusions`]] as const);
const BOX_KEYS = [
  ["blind_box_gm_claim_cost", "GM claim cost"], ["blind_box_normal_reward_min", "Normal minimum"],
  ["blind_box_normal_reward_max", "Normal maximum"], ["blind_box_special_reward_min", "Special minimum"],
  ["blind_box_special_reward_max", "Special maximum"], ["blind_box_gm_total_claim_limit", "GM total claim limit"],
  ["blind_box_source_claim_limit", "Per-source claim limit"], ["blind_box_oc_team_default_stock", "OC Team default stock"],
  ["blind_box_hof_default_stock", "HOF default stock"], ["blind_box_hogm_default_stock", "HOGM default stock"],
  ["blind_box_gm_station_default_stock", "GM station default stock"],
] as const;

export default function ConfigurationPage() {
  const context = useCurrentUserContext();
  const isTech = context.role === "admin";
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [tab, setTab] = useState<Tab>("GENERAL");
  const [settings, setSettings] = useState<Setting[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [stations, setStations] = useState<Station[]>([]);
  const [originalStations, setOriginalStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [configResult, stationResult] = await Promise.all([
      supabase.from("game_config").select("key,value,version"),
      supabase.from("stations").select("*").order("station_number"),
    ]);
    if (configResult.error || stationResult.error) setError(friendlyError(configResult.error || stationResult.error));
    const rows = (configResult.data as Setting[]) ?? [];
    const values = Object.fromEntries(rows.map((item) => [item.key, String(item.value).replace(/^"|"$/g, "")]));
    if (!values.bonding_session_duration_day1) values.bonding_session_duration_day1 = values.bonding_session_duration ?? "150";
    if (!values.bonding_session_duration_day2) values.bonding_session_duration_day2 = values.bonding_session_duration ?? "150";
    for (const item of DIFFICULTIES) {
      values[item.costKey] ??= item.defaultCost;
      values[item.exclusionKey] ??= item.defaultExclusions;
    }
    setSettings(rows);
    setDraft(values);
    const originalRows = ((stationResult.data as Station[]) ?? []).map((station) => ({ ...station, difficulty: station.difficulty === "NONE" ? "EASY" : station.difficulty }));
    const stationRows = originalRows.map((station) => {
      const difficulty = (station.difficulty ?? "EASY") as Difficulty;
      const item = DIFFICULTIES.find((candidate) => candidate.value === difficulty) ?? DIFFICULTIES[0];
      return {
        ...station,
        difficulty,
        token_cost: Number(values[item.costKey] ?? item.defaultCost),
        location_exclusion_limit: Number(values[item.exclusionKey] ?? item.defaultExclusions),
      };
    });
    setStations(stationRows);
    setOriginalStations(originalRows);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  const setting = (key: string) => settings.find((item) => item.key === key);
  const changed = (keys: readonly (readonly [string, string])[]) => keys.some(([key]) => draft[key] !== String(setting(key)?.value ?? (key.includes("duration_day") ? draft.bonding_session_duration ?? "150" : "")).replace(/^"|"$/g, ""));
  async function writeSetting(key: string, value: unknown) {
    const row = setting(key);
    const { error: requestError } = await supabase.rpc("fn_admin_set_game_setting", { p_key: key, p_value: value, p_expected_version: row?.version ?? 0, p_reason: "Grouped configuration update" });
    if (requestError) throw requestError;
  }
  async function saveSettings(name: string, keys: readonly (readonly [string, string])[]) {
    setBusy(name); setError(null);
    try { for (const [key] of keys) await writeSetting(key, Number(draft[key])); setNotice(`${name} saved successfully.`); await load(); }
    catch (caught) { setError(friendlyError(caught)); } finally { setBusy(null); }
  }
  async function saveGameplay() {
    setBusy("gameplay"); setError(null);
    try {
      for (const [key] of [...GAME_KEYS, ...DIFFICULTY_KEYS]) await writeSetting(key, Number(draft[key]));
      await writeSetting("allow_station_replay", draft.allow_station_replay === "true");
      for (const station of stations.filter((item) => !item.day || item.day === 2)) {
        const original = originalStations.find((item) => item.id === station.id);
        if (JSON.stringify(station) !== JSON.stringify(original)) {
          const { error: requestError } = await supabase.rpc("fn_admin_set_station_config", {
            p_station_id: station.id, p_difficulty: station.difficulty ?? "EASY", p_token_cost: station.token_cost ?? 0,
            p_exclusion_limit: station.location_exclusion_limit ?? 0, p_is_active: station.is_active ?? true,
            p_expected_version: station.config_version ?? 1, p_reason: "Difficulty preset and station assignment update",
          });
          if (requestError) throw requestError;
        }
      }
      setNotice("Gameplay, difficulty presets and Day 2 stations saved."); await load();
    } catch (caught) { setError(friendlyError(caught)); } finally { setBusy(null); }
  }
  async function saveLighting() {
    setBusy("lighting"); setError(null);
    try {
      await writeSetting("lighting_effect_scope", draft.lighting_effect_scope ?? "ALL_VIEWERS");
      await writeSetting("lighting_effect_style", draft.lighting_effect_style ?? "GLOW");
      await writeSetting("lighting_effect_duration_ms", Number(draft.lighting_effect_duration_ms ?? 2400));
      setNotice("Lighting settings saved."); await load();
    } catch (caught) { setError(friendlyError(caught)); } finally { setBusy(null); }
  }

  const preset = (difficulty: Difficulty) => DIFFICULTIES.find((item) => item.value === difficulty)!;
  const presetValues = (difficulty: Difficulty) => {
    const item = preset(difficulty);
    return { token_cost: Number(draft[item.costKey] ?? item.defaultCost), location_exclusion_limit: Number(draft[item.exclusionKey] ?? item.defaultExclusions) };
  };
  const patchStation = (id: number, patch: Partial<Station>) => setStations((current) => current.map((station) => station.id === id ? { ...station, ...patch } : station));
  const chooseDifficulty = (id: number, difficulty: Difficulty) => patchStation(id, { difficulty, ...presetValues(difficulty) });
  const updatePreset = (difficulty: Difficulty, field: "cost" | "exclusions", value: string) => {
    const item = preset(difficulty);
    const key = field === "cost" ? item.costKey : item.exclusionKey;
    setDraft((current) => ({ ...current, [key]: value }));
    setStations((current) => current.map((station) => station.difficulty === difficulty ? { ...station, ...(field === "cost" ? { token_cost: Number(value) } : { location_exclusion_limit: Number(value) }) } : station));
  };
  const stationsDirty = JSON.stringify(stations) !== JSON.stringify(originalStations);
  const gameDirty = changed(GAME_KEYS) || changed(DIFFICULTY_KEYS) || draft.allow_station_replay !== String(setting("allow_station_replay")?.value ?? false) || stationsDirty;
  const boxDirty = changed(BOX_KEYS);

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  const tabs: [Tab, string][] = [["GENERAL", "General & gameplay"], ["BLIND_BOX", "Blind Box"], ["LIGHTING", "NFC & Lighting"]];
  const day2Stations = stations.filter((station) => !station.day || station.day === 2);

  return <div className="space-y-4">
    <PageTitle title="Configuration" subtitle="Grouped current-orientation settings" />
    <ErrorBanner message={error} /><SuccessBanner message={notice} />
    <div className="flex gap-2 overflow-x-auto pb-1">{tabs.filter(([key]) => isTech || key === "GENERAL").map(([key, label]) => <button key={key} className={cn("whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold", tab === key ? "bg-ink text-white" : "bg-white text-ink-soft shadow-card")} onClick={() => setTab(key)}>{label}</button>)}</div>
    {tab === "GENERAL" && <>
      <Card className="space-y-3"><h2 className="font-semibold uppercase">Gameplay and session</h2><p className="text-xs text-ink-faint">Day 1 and Day 2 durations are independent. Save after reviewing this complete section.</p>{GAME_KEYS.map(([key, label]) => <label key={key} className="grid grid-cols-[1fr_7rem] items-center gap-3 text-sm"><span>{label}</span><input type="number" min="0" className="input" value={draft[key] ?? ""} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></label>)}<div className="grid grid-cols-2 gap-2"><button className={draft.allow_station_replay === "true" ? "btn-primary" : "btn-secondary"} onClick={() => setDraft({ ...draft, allow_station_replay: "true" })}>Allow replay</button><button className={draft.allow_station_replay !== "true" ? "btn-primary" : "btn-secondary"} onClick={() => setDraft({ ...draft, allow_station_replay: "false" })}>One attempt</button></div></Card>
      <Card className="space-y-3"><div><h2 className="font-semibold uppercase">Day 2 difficulty presets</h2><p className="text-xs text-ink-faint">Set cost and exclusions once. Every station using that difficulty follows these values.</p></div><div className="grid grid-cols-3 gap-2">{DIFFICULTIES.map((item) => <div key={item.value} className="rounded-2xl border border-paper-200 p-2"><p className="mb-2 text-center text-xs font-black">{item.label}</p><label className="block text-[11px]">Tokens<input type="number" min="0" className="input mt-1 px-2" value={draft[item.costKey] ?? item.defaultCost} onChange={(event) => updatePreset(item.value, "cost", event.target.value)} /></label><label className="mt-2 block text-[11px]">Exclusions<input type="number" min="0" className="input mt-1 px-2" value={draft[item.exclusionKey] ?? item.defaultExclusions} onChange={(event) => updatePreset(item.value, "exclusions", event.target.value)} /></label></div>)}</div></Card>
      <Card className="space-y-3"><div><h2 className="font-semibold uppercase">Day 2 stations</h2><p className="text-xs text-ink-faint">Assign only the difficulty; cost and exclusions are supplied by the preset above.</p></div><div className="grid grid-cols-2 gap-2">{day2Stations.map((station) => <div key={station.id} className="rounded-2xl border border-paper-200 p-3"><p className="truncate text-sm font-semibold">{station.code} · {station.name}</p><label className="mt-2 block text-xs">Difficulty<select className="input mt-1" value={station.difficulty ?? "EASY"} onChange={(event) => chooseDifficulty(station.id, event.target.value as Difficulty)}><option>EASY</option><option>MEDIUM</option><option>HARD</option></select></label><div className="mt-2 grid grid-cols-2 gap-1 text-center text-[11px]"><span className="rounded-lg bg-paper-100 p-1">{station.token_cost ?? 0} tokens</span><span className="rounded-lg bg-paper-100 p-1">{station.location_exclusion_limit ?? 0} exclude</span></div><label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={station.is_active ?? true} onChange={(event) => patchStation(station.id, { is_active: event.target.checked })} />Active</label></div>)}</div><button className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40" disabled={busy !== null || !gameDirty} onClick={() => void saveGameplay()}>{busy === "gameplay" ? "Saving…" : "Save gameplay & stations"}</button></Card>
    </>}
    {tab === "BLIND_BOX" && isTech && <Card className="space-y-3"><h2 className="font-semibold uppercase">Blind Box settings</h2>{BOX_KEYS.map(([key, label]) => <label key={key} className="grid grid-cols-[1fr_7rem] items-center gap-3 text-sm"><span>{label}</span><input type="number" min="0" className="input" value={draft[key] ?? ""} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></label>)}<button className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-40" disabled={busy !== null || !boxDirty} onClick={() => void saveSettings("Blind Box settings", BOX_KEYS)}>{busy === "Blind Box settings" ? "Saving…" : "Save Blind Box settings"}</button><a href="/admin/blindbox" className="btn-secondary flex w-full justify-center">Open QR generation</a></Card>}
    {tab === "LIGHTING" && isTech && <Card className="space-y-3"><h2 className="font-semibold uppercase">NFC and Lighting Zone effects</h2><label className="block text-sm">Effect devices<select className="input mt-1" value={draft.lighting_effect_scope ?? "ALL_VIEWERS"} onChange={(event) => setDraft({ ...draft, lighting_effect_scope: event.target.value })}><option value="SCANNING_DEVICE">Scanning device only</option><option value="ALL_VIEWERS">All connected viewers</option><option value="NONE">No effect</option></select></label><label className="block text-sm">Effect style<select className="input mt-1" value={draft.lighting_effect_style ?? "GLOW"} onChange={(event) => setDraft({ ...draft, lighting_effect_style: event.target.value })}><option value="GLOW">Glow celebration</option><option value="PULSE">Pulse celebration</option><option value="NONE">No visual effect</option></select></label><label className="block text-sm">Duration (milliseconds)<input type="number" min="0" max="10000" className="input mt-1" value={draft.lighting_effect_duration_ms ?? "2400"} onChange={(event) => setDraft({ ...draft, lighting_effect_duration_ms: event.target.value })} /></label><button className="btn-primary w-full" disabled={busy !== null} onClick={() => void saveLighting()}>{busy === "lighting" ? "Saving…" : "Save NFC & Lighting settings"}</button><a href="/admin/nfc" className="btn-secondary flex w-full justify-center">Open NFC cards</a></Card>}
  </div>;
}
