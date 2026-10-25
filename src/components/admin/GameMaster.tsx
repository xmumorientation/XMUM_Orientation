"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { FunfairLightGroup } from "@/components/admin/FunfairLightGroup";
import { FunfairZones } from "@/components/admin/FunfairZones";
import { groupColor } from "@/components/freshie/groupTheme";
import { useConfig, useProjectorPlaces } from "@/components/useConfig";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PROJECTOR_LOCATIONS, type ProjectorLocation } from "@/lib/types";
import { friendlyError } from "@/lib/utils";

import "./game-master.css";

// Admin → Live control → Game master (migration 0103, Admin only): D-day
// backup tools that do not depend on the games, the schedule or the Day 2
// switches. Pick a group once, then Tokens / Puzzle / Blind box; Funfair is the
// zone card that used to be on Game → Funfair. The only kill-switch that
// still applies is the token freeze (tokens only). Every change shows a
// summary first and is applied on Confirm; tokens and gift boxes get an Undo.

interface GroupRow { id: number; name: string; color: string | null; token_balance: number }
interface TxRow { id: number; delta: number; reason: string; created_at: string }
interface ItemRow { id: number; puzzle_location: ProjectorLocation; puzzle_index: number }
interface BoxType { id: number; name: string; min_tokens: number; max_tokens: number; is_special: boolean }
interface Rules { win: number; lose: number; easy: number; medium: number; hard: number }

type Tab = "tok" | "puz" | "bb" | "ff";
const TABS: { key: Tab; label: string }[] = [
  { key: "tok", label: "Tokens" },
  { key: "puz", label: "Puzzle" },
  { key: "bb", label: "Blind box" },
  { key: "ff", label: "Funfair" },
];
const DEFAULT_RULES: Rules = { win: 2, lose: 1, easy: 2, medium: 4, hard: 6 };
const REASONS = ["GM missed a result", "Wrong scan", "Station closed early", "Fee refund"];

interface Pending {
  text: React.ReactNode;
  blocked?: string;
  run: () => Promise<void>;
}
interface Toast { text: string; undo?: () => Promise<void> }

export function GameMaster({
  onError,
  onNotice,
}: {
  onError: (m: string | null) => void;
  onNotice: (m: string) => void;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { config } = useConfig();
  const places = useProjectorPlaces();
  const frozen = config.tokens_frozen === true || config.tokens_frozen === "true";

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("tok");
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [gid, setGid] = useState<number | null>(null);
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [types, setTypes] = useState<BoxType[]>([]);
  const [owned, setOwned] = useState<Set<number>>(new Set());
  const [tx, setTx] = useState<TxRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // tokens
  const [dir, setDir] = useState<1 | -1>(1);
  const [preset, setPreset] = useState(0);
  const [custom, setCustom] = useState(1);
  const [reason, setReason] = useState("");
  // puzzle / blind box
  const [pick, setPick] = useState<{ loc: ProjectorLocation; index: number } | null>(null);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [qty, setQty] = useState(1);

  const group = groups.find((g) => g.id === gid) ?? null;

  const loadStatic = useCallback(async () => {
    const [r, it, ty] = await Promise.all([
      supabase
        .from("game_config_rules")
        .select("rule_key, rule_value")
        .in("rule_key", ["DAY1_WIN_TOKENS", "DAY1_LOSE_TOKENS", "EASY_COST", "MEDIUM_COST", "HARD_COST"]),
      supabase.from("items").select("id, puzzle_location, puzzle_index").eq("type", "puzzle"),
      supabase
        .from("blind_box_types")
        .select("id, name, min_tokens, max_tokens, is_special")
        .eq("archived", false)
        .eq("is_spot", false)
        .order("id"),
    ]);
    if (r.data) {
      const v = (k: string, d: number) => (r.data!.find((x) => x.rule_key === k)?.rule_value as number | undefined) ?? d;
      setRules({
        win: v("DAY1_WIN_TOKENS", 2),
        lose: v("DAY1_LOSE_TOKENS", 1),
        easy: v("EASY_COST", 2),
        medium: v("MEDIUM_COST", 4),
        hard: v("HARD_COST", 6),
      });
    }
    if (it.data) setItems(it.data as ItemRow[]);
    if (ty.data) {
      setTypes(ty.data as BoxType[]);
      setTypeId((cur) => cur ?? (ty.data![0] as BoxType | undefined)?.id ?? null);
    }
  }, [supabase]);

  const loadGroups = useCallback(async () => {
    const { data } = await supabase.from("groups").select("id, name, color, token_balance").order("id");
    if (!data) return;
    setGroups(data as GroupRow[]);
    setGid((cur) => cur ?? (data[0] as GroupRow | undefined)?.id ?? null);
  }, [supabase]);

  const loadGroupData = useCallback(async () => {
    if (gid === null) return;
    const [t, inv] = await Promise.all([
      supabase.from("token_transactions").select("id, delta, reason, created_at").eq("group_id", gid).order("created_at", { ascending: false }).limit(5),
      supabase.from("inventory").select("item_id").eq("group_id", gid).eq("item_type", "puzzle"),
    ]);
    if (t.data) setTx(t.data as TxRow[]);
    if (inv.data) setOwned(new Set(inv.data.map((x) => x.item_id as number)));
  }, [supabase, gid]);

  useEffect(() => {
    if (!open) return;
    void loadStatic();
    void loadGroups();
    const i = setInterval(loadGroups, 10_000);
    return () => clearInterval(i);
  }, [open, loadStatic, loadGroups]);
  useEffect(() => {
    if (open) void loadGroupData();
  }, [open, loadGroupData]);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function showToast(t: Toast) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), 10_000);
  }
  async function refresh() {
    await Promise.all([loadGroups(), loadGroupData()]);
  }
  // Runs one RPC; errors go to the page banner, the summary strip closes.
  async function rpc(name: string, args: Record<string, unknown>) {
    setBusy(true);
    onError(null);
    const { data, error } = await supabase.rpc(name, args);
    setBusy(false);
    if (error) {
      onError(friendlyError(error));
      return null;
    }
    return data as Record<string, unknown>;
  }
  const key = () => crypto.randomUUID();

  function chooseGroup(id: number) {
    setGid(id);
    setPick(null);
    setPending(null);
  }

  // ── tokens ──────────────────────────────────────────────────────────
  const presets: { label: string; n: number }[] =
    dir === 1
      ? [{ label: "Day 1 win", n: rules.win }, { label: "Day 1 lose", n: rules.lose }]
      : [{ label: "Easy", n: rules.easy }, { label: "Medium", n: rules.medium }, { label: "Hard", n: rules.hard }];
  const isCustom = preset >= presets.length;
  const amount = isCustom ? custom : presets[preset].n;

  function reviewTokens() {
    if (!group) return;
    const delta = dir * amount;
    const after = group.token_balance + delta;
    const why = reason.trim();
    setPending({
      blocked: frozen ? "Token freeze is on." : after < 0 ? `Can't deduct ${amount}: ${group.name} only has ${group.token_balance}.` : undefined,
      text: (
        <>
          {group.name} · {delta > 0 ? "+" : ""}{delta} tokens · {group.token_balance} → <b>{after}</b>
        </>
      ),
      run: async () => {
        const res = await rpc("fn_admin_token_adjust", { p_group_id: group.id, p_delta: delta, p_reason: why, p_idempotency_key: key() });
        if (!res) return;
        setPending(null);
        onNotice(`${group.name}: ${delta > 0 ? "+" : ""}${delta} tokens`);
        await refresh();
        showToast({
          text: `${group.name} ${delta > 0 ? "+" : ""}${delta} tokens`,
          undo: async () => {
            const back = await rpc("fn_admin_token_adjust", { p_group_id: group.id, p_delta: -delta, p_reason: `Undo: ${why || "adjustment"}`, p_idempotency_key: key() });
            if (back) { setToast(null); await refresh(); }
          },
        });
      },
    });
  }

  // ── puzzle ──────────────────────────────────────────────────────────
  const itemFor = (loc: ProjectorLocation, index: number) => items.find((i) => i.puzzle_location === loc && i.puzzle_index === index);

  function reviewPiece(loc: ProjectorLocation, index: number) {
    if (!group) return;
    setPick({ loc, index });
    setPending({
      text: (
        <>
          {group.name} · give <b>{places[loc].name}</b> piece {index}
        </>
      ),
      run: async () => {
        const res = await rpc("fn_admin_give_piece", { p_group_id: group.id, p_location: loc, p_index: index, p_idempotency_key: key() });
        if (!res) return;
        setPending(null);
        setPick(null);
        onNotice(`${group.name} got ${places[loc].name} piece ${index}`);
        await refresh();
      },
    });
  }

  // ── blind box ───────────────────────────────────────────────────────
  function reviewGift() {
    const type = types.find((t) => t.id === typeId);
    if (!group || !type) return;
    setPending({
      text: (
        <>
          {group.name} · gift <b>{qty} {type.name}</b> blind box{qty > 1 ? "es" : ""} · free, not counted as sold
        </>
      ),
      run: async () => {
        const res = await rpc("fn_admin_give_blindbox", { p_group_id: group.id, p_type_id: type.id, p_quantity: qty, p_idempotency_key: key() });
        if (!res) return;
        setPending(null);
        const ids = (res.claim_ids as number[]) ?? [];
        onNotice(`${group.name} got ${qty} ${type.name} box${qty > 1 ? "es" : ""}`);
        showToast({
          text: `${qty} ${type.name} box${qty > 1 ? "es" : ""} sent to ${group.name}`,
          undo: async () => {
            const back = await rpc("fn_admin_undo_gift", { p_claim_ids: ids });
            if (back) { setToast(null); onNotice("Gift taken back"); }
          },
        });
      },
    });
  }

  return (
    <section className="gm">
      <h2 className="mb-2 font-semibold">Game master</h2>
      <div className="gm-shell">
        <div className="gm-core">
          <button type="button" className="gm-more" aria-expanded={open} aria-controls="gm-fold" onClick={() => setOpen((o) => !o)}>
            <span>
              <span className="gm-eyebrow">Emergency</span>
              <b>Game master</b>
              <small>Always live. Tokens, puzzle pieces, blind boxes and the funfair for any group.</small>
            </span>
            <span className="gm-chev"><ChevronIcon /></span>
          </button>

          <div className="gm-fold" id="gm-fold" data-open={open}>
            <div inert={!open}>
              <div className="gm-body">
                <nav className="gm-rail" aria-label="Group">
                  <h4>Group</h4>
                  {groups.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      className="gm-g"
                      style={{ ["--c" as string]: groupColor(g.color) }}
                      aria-pressed={g.id === gid}
                      onClick={() => chooseGroup(g.id)}
                    >
                      <i />
                      <span>{g.name}</span>
                      <em>{g.token_balance}</em>
                    </button>
                  ))}
                </nav>

                <div className="gm-panel">
                  <div className="gm-tabs" role="tablist">
                    {TABS.map((t) => (
                      <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => { setTab(t.key); setPending(null); setPick(null); }}>
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {tab === "tok" && group && (
                    <div className="gm-pane" key="tok">
                      {frozen && <p className="gm-banner">Token freeze is on, so token changes are blocked. Switch it off under Kill-switches to continue.</p>}
                      <div className="gm-who"><b>{group.name}</b><span>Any day, no schedule needed</span></div>
                      <div className="gm-big">{group.token_balance}<small>tokens now</small></div>

                      <div className="gm-row">
                        <div className="gm-seg">
                          {([1, -1] as const).map((d) => (
                            <button key={d} type="button" data-d={d} aria-pressed={dir === d} onClick={() => { setDir(d); setPreset(0); setPending(null); }}>
                              {d === 1 ? "Add" : "Deduct"}
                            </button>
                          ))}
                        </div>
                        {presets.map((p, i) => (
                          <button key={p.label} type="button" className="gm-chip" aria-pressed={preset === i} onClick={() => { setPreset(i); setPending(null); }}>
                            {p.label}<em>{p.n}</em>
                          </button>
                        ))}
                        <button type="button" className="gm-chip" aria-pressed={isCustom} onClick={() => { setPreset(presets.length); setPending(null); }}>Custom</button>
                        {isCustom && (
                          <div className="gm-stepper">
                            <button type="button" aria-label="One less" disabled={custom <= 1} onClick={() => { setCustom((c) => Math.max(1, c - 1)); setPending(null); }}>−</button>
                            <output>{custom}</output>
                            <button type="button" aria-label="One more" disabled={custom >= 50} onClick={() => { setCustom((c) => Math.min(50, c + 1)); setPending(null); }}>+</button>
                          </div>
                        )}
                      </div>
                      <p className="gm-note" style={{ marginTop: -6 }}>Add uses the Day 1 token rules, Deduct the Day 2 entry fees. Change them on the Token page.</p>

                      <div className="gm-lab">Reason</div>
                      <div className="gm-row" style={{ margin: "0 0 10px" }}>
                        {REASONS.map((r) => (
                          <button key={r} type="button" className="gm-chip" aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>
                        ))}
                      </div>
                      <input className="gm-input" value={reason} maxLength={120} placeholder="Backup: GM missed the result" onChange={(e) => setReason(e.target.value)} />

                      <div className="gm-row" style={{ marginTop: 20 }}>
                        <button type="button" className="gm-btn" data-kind="go" disabled={busy || frozen} onClick={reviewTokens}>
                          <span className="gm-ico"><ArrowIcon /></span>Review change
                        </button>
                      </div>
                      <Summary pending={pending} busy={busy} onCancel={() => setPending(null)} />

                      <div className="gm-lab">Last transactions</div>
                      <ul className="gm-log">
                        {tx.length === 0 && <li>No transactions yet.</li>}
                        {tx.map((t) => (
                          <li key={t.id}>
                            <span>{t.reason || "No reason"} · {new Date(t.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                            <b className={t.delta > 0 ? "gm-pos" : "gm-neg"}>{t.delta > 0 ? "+" : ""}{t.delta}</b>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {tab === "puz" && group && (
                    <div className="gm-pane" key="puz">
                      <div className="gm-who"><b>{group.name}</b><span>Tap a missing piece to give it</span></div>
                      <div className="gm-pieces" style={{ ["--c" as string]: groupColor(group.color) }}>
                        {PROJECTOR_LOCATIONS.map((loc) => {
                          const all = items.filter((i) => i.puzzle_location === loc).sort((a, b) => a.puzzle_index - b.puzzle_index);
                          const have = all.filter((i) => owned.has(i.id)).length;
                          return (
                            <div key={loc} className="gm-loc">
                              <h5>{places[loc].name}<span>{have} of {all.length}</span></h5>
                              <div className="gm-pc">
                                {all.map((it) => {
                                  const own = owned.has(it.id);
                                  return (
                                    <button
                                      key={it.id}
                                      type="button"
                                      className={own ? "own" : undefined}
                                      disabled={own || busy}
                                      aria-label={`${places[loc].name} piece ${it.puzzle_index}${own ? ", owned" : ""}`}
                                      aria-pressed={pick?.loc === loc && pick.index === it.puzzle_index}
                                      onClick={() => itemFor(loc, it.puzzle_index) && reviewPiece(loc, it.puzzle_index)}
                                    >
                                      {own ? "✓" : it.puzzle_index}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <Summary pending={pending} busy={busy} onCancel={() => { setPending(null); setPick(null); }} />
                      <p className="gm-note">A wrong piece is removed on the Puzzles page.</p>
                    </div>
                  )}

                  {tab === "bb" && group && (
                    <div className="gm-pane" key="bb">
                      <div className="gm-who"><b>{group.name}</b><span>Appears on the group&apos;s Items page, unopened</span></div>
                      <div className="gm-lab" style={{ marginTop: 0 }}>Box type</div>
                      <div className="gm-types">
                        {types.length === 0 && <p className="gm-note">No blind box types yet. Add one under Blind box.</p>}
                        {types.map((t) => (
                          <button key={t.id} type="button" className="gm-ty" aria-pressed={typeId === t.id} onClick={() => { setTypeId(t.id); setPending(null); }}>
                            <b>{t.name}</b>
                            <small>{t.is_special ? "Special" : `${t.min_tokens} to ${t.max_tokens} tokens`}</small>
                          </button>
                        ))}
                      </div>
                      <div className="gm-row">
                        <span style={{ color: "var(--gm-mute)", fontSize: 12 }}>Quantity</span>
                        <div className="gm-stepper">
                          <button type="button" aria-label="One less" disabled={qty <= 1} onClick={() => { setQty((q) => q - 1); setPending(null); }}>−</button>
                          <output>{qty}</output>
                          <button type="button" aria-label="One more" disabled={qty >= 5} onClick={() => { setQty((q) => q + 1); setPending(null); }}>+</button>
                        </div>
                      </div>
                      <div className="gm-row" style={{ marginTop: 20 }}>
                        <button type="button" className="gm-btn" data-kind="go" disabled={busy || typeId === null} onClick={reviewGift}>
                          <span className="gm-ico"><ArrowIcon /></span>Review gift
                        </button>
                      </div>
                      <Summary pending={pending} busy={busy} onCancel={() => setPending(null)} />
                      <p className="gm-note">
                        A gift is free. It does not use a seller&apos;s quantity or the type&apos;s stock, and it is not counted as sold. The group opens it themselves and the tokens come out as usual.
                      </p>
                    </div>
                  )}

                  {tab === "ff" && (
                    <div className="gm-pane" key="ff">
                      <FunfairLightGroup groups={groups} groupId={gid} canReplace onError={onError} onNotice={onNotice} />
                      <FunfairZones />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div className="gm-toast" role="status" key={toast.text}>
          <span>{toast.text}</span>
          {toast.undo && <button type="button" onClick={() => void toast.undo!()}>Undo</button>}
          <span className="gm-bar"><i /></span>
        </div>
      )}
    </section>
  );
}

function Summary({ pending, busy, onCancel }: { pending: Pending | null; busy: boolean; onCancel: () => void }) {
  if (!pending) return null;
  return (
    <div className="gm-confirm">
      <p>{pending.blocked ?? pending.text}</p>
      <div className="gm-btns">
        <button type="button" className="gm-btn" disabled={busy} onClick={onCancel}>Cancel</button>
        {!pending.blocked && (
          <button type="button" className="gm-btn" data-kind="go" disabled={busy} onClick={() => void pending.run()}>
            <span className="gm-ico"><CheckIcon /></span>Confirm
          </button>
        )}
      </div>
    </div>
  );
}

const ChevronIcon = () => <svg viewBox="0 0 16 16" aria-hidden><path d="M4 6l4 4 4-4" /></svg>;
const ArrowIcon = () => <svg viewBox="0 0 16 16" aria-hidden><path d="M3 8h9M9 4.5L12.5 8 9 11.5" /></svg>;
const CheckIcon = () => <svg viewBox="0 0 16 16" aria-hidden><path d="M3.5 8.5l3 3 6-7" /></svg>;
