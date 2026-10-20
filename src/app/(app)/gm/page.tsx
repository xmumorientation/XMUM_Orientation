"use client";

import { Check, Copy, Sparkles, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useMyBlindBoxes } from "@/components/BlindBoxCard";
import { groupSwatch } from "@/components/freshie/groupTheme";
import { vxDisplay, vxSlab } from "@/components/home/fonts";
import { useProfile } from "@/components/ProfileProvider";
import "@/components/staff/game/game-control.css";
import { StatusLine, useStatus } from "@/components/staff/game/parts";
import { useOfflineQueue } from "@/components/useOfflineQueue";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  PROJECTOR_LABELS,
  PROJECTOR_LOCATIONS,
  RISK_TIER_META,
  type Day2Result,
  type ProjectorLocation,
  type Station,
  type StationStatus,
} from "@/lib/types";
import { cn, friendlyError, idemKey } from "@/lib/utils";

type GroupRow = { id: number; name: string; color: string | null; token_balance: number };

const STATUS: { value: StationStatus; label: string; tone: "ok" | "warn" | "off" }[] = [
  { value: "available", label: "Available", tone: "ok" },
  { value: "in_progress", label: "In progress", tone: "warn" },
  { value: "closed", label: "Closed", tone: "off" },
];

// GM's Station panel (/gm), in the Game control look (game-control.css) of the
// ops crew's Ops page. Phones, top to bottom:
//  Status    - the station's queue state (Available / In progress / Closed)
//  Group     - tap the group at the station (fn_scoreboard: name, colour, tokens)
//  Result    - Day 1: win or participation reward. Amounts are the admin's
//              token rules (Token page); the server reads them, the GM cannot
//              pick one. Undo the last transaction within 2 minutes.
//              Day 2: success or failed (+ tier locations); the system deducts
//              the tier's entry fee and grants a random piece the group lacks.
//  Blind box - this GM's own boxes and the station's shared pool, with the QR
//              a Freshie scans to open one.
// Landscape tablets and desktops: Group and Result left, Status and Blind box
// right. A station runs Day 1 or Day 2; with no station, a Day switch shows both.
// All submissions carry idempotency keys and queue offline (NFR-6).
export default function GmPanelPage() {
  const profile = useProfile();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { queue, failed, dismissFailed, submit } = useOfflineQueue();
  const result = useStatus();
  const statusMsg = useStatus();

  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupId, setGroupId] = useState<number | null>(null);
  const [station, setStation] = useState<Station | null>(null);
  const [pickedDay, setPickedDay] = useState<1 | 2>(1);
  const [success, setSuccess] = useState(true);
  const [locations, setLocations] = useState<ProjectorLocation[]>([]);
  const [busy, setBusy] = useState(false);
  // Shown on the buttons only; the server applies the current rule.
  const [day1, setDay1] = useState({ win: 2, lose: 1 });

  // Groups with their colour and tokens. A GM cannot select the groups table,
  // so this is fn_scoreboard; reloaded after each result and every 30 s.
  const loadGroups = useCallback(async () => {
    const { data } = await supabase.rpc("fn_scoreboard");
    if (!data) return;
    setGroups(
      (data as GroupRow[])
        .map((g) => ({ ...g, token_balance: g.token_balance ?? 0 }))
        .sort((a, b) => a.id - b.id)
    );
  }, [supabase]);

  useEffect(() => {
    void loadGroups();
    const refreshVisible = () => { if (document.visibilityState === "visible") void loadGroups(); };
    const timer = window.setInterval(refreshVisible, 30000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [loadGroups]);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!profile.station_id) return;
      const { data: st } = await supabase
        .from("stations")
        .select("*")
        .eq("id", profile.station_id)
        .single();
      if (active) setStation((st as Station) ?? null);
    }
    load();
    return () => {
      active = false;
    };
  }, [supabase, profile.station_id]);

  // The station's status changes from Admin (or another device): show it at
  // once. Only the status is merged, nothing else on the page is reloaded.
  useEffect(() => {
    if (!profile.station_id) return;
    const channel = supabase
      .channel(`gm-station-${profile.station_id}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "stations", filter: `id=eq.${profile.station_id}` },
        (payload) => {
          const row = payload.new as Station;
          setStation((cur) => (cur && cur.id === row.id ? { ...cur, status: row.status } : cur));
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, profile.station_id]);

  // Token rules can change during the event; keep the labels and the
  // station's entry fee (synced from its tier) current.
  useEffect(() => {
    let active = true;
    async function loadRules() {
      const { data } = await supabase
        .from("game_config_rules")
        .select("rule_key, rule_value")
        .in("rule_key", ["DAY1_WIN_TOKENS", "DAY1_LOSE_TOKENS"]);
      if (!active || !data) return;
      const value = (key: string, fallback: number) =>
        data.find((r) => r.rule_key === key)?.rule_value ?? fallback;
      setDay1({ win: value("DAY1_WIN_TOKENS", 2), lose: value("DAY1_LOSE_TOKENS", 1) });
      if (profile.station_id) {
        const { data: st } = await supabase
          .from("stations")
          .select("entry_cost")
          .eq("id", profile.station_id)
          .single();
        if (active && st) {
          setStation((cur) => (cur ? { ...cur, entry_cost: st.entry_cost } : cur));
        }
      }
    }
    loadRules();
    const channel = supabase
      .channel(`gm_token_rules_${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "game_config_rules" }, loadRules)
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, profile.id, profile.station_id]);

  async function day1Reward(outcome: "win" | "lose") {
    if (!groupId) return result.setError("先选组别 Select a group first.");
    const label = outcome === "win" ? "Station win" : "Station participation";
    setBusy(true);
    result.setError(null);
    const res = await submit(
      "fn_gm_day1_reward",
      {
        p_group_id: groupId,
        p_result: outcome,
        p_idempotency_key: idemKey(),
      },
      `Day 1 ${outcome} to group ${groupId}`
    );
    setBusy(false);
    if (res.status === "confirmed") {
      const d = res.data as { delta?: number; balance?: number; duplicate?: boolean };
      if (d?.duplicate) return result.flash("Duplicate ignored (already recorded).");
      result.flash(
        `${label}: +${d?.delta ?? "?"}${d?.balance !== undefined ? ` · balance ${d.balance}` : ""}`
      );
      void loadGroups();
    } else if (res.status === "queued") {
      result.flash("Offline. Queued and will send automatically.");
    } else {
      result.setError(friendlyError({ message: res.error }));
    }
  }

  async function undo() {
    setBusy(true);
    result.setError(null);
    const { data, error } = await supabase.rpc("fn_undo_last_transaction");
    setBusy(false);
    if (error) result.setError(friendlyError(error));
    else {
      result.flash(`Undone. Balance: ${(data as { balance?: number })?.balance ?? "updated"}`);
      void loadGroups();
    }
  }

  const tier = station?.risk_tier ?? "low";
  const needPicks = RISK_TIER_META[tier].pick;

  function toggleLocation(loc: ProjectorLocation) {
    setLocations((cur) => {
      if (cur.includes(loc)) return cur.filter((l) => l !== loc);
      if (cur.length >= needPicks) {
        // replace the oldest pick so the flow stays 2-tap fast
        return [...cur.slice(1 - needPicks || 1), loc].slice(-needPicks);
      }
      return [...cur, loc];
    });
  }

  async function submitDay2() {
    if (!groupId) return result.setError("先选组别 Select a group first.");
    if (needPicks > 0 && locations.length !== needPicks) {
      return result.setError(
        needPicks === 2 ? "Pick exactly 2 locations." : "Pick exactly 1 location."
      );
    }
    setBusy(true);
    result.setError(null);
    const res = await submit(
      "fn_day2_challenge",
      {
        p_group_id: groupId,
        p_success: success,
        p_locations: needPicks > 0 ? locations : null,
        p_idempotency_key: idemKey(),
      },
      `day2 ${success ? "win" : "lose"} to group ${groupId}`
    );
    setBusy(false);
    if (res.status === "confirmed") {
      const d = res.data as Day2Result;
      if (d.duplicate) return result.flash("Duplicate ignored (already recorded).");
      result.flash(
        d.success && d.piece_name
          ? `-${d.cost} tokens · granted ${d.piece_name} · balance ${d.balance}`
          : `-${d.cost} tokens (challenge lost) · balance ${d.balance}`
      );
      setLocations([]);
      void loadGroups();
    } else if (res.status === "queued") {
      result.flash("Offline. Queued and will send automatically.");
    } else {
      result.setError(friendlyError({ message: res.error }));
    }
  }

  async function setStatus(status: StationStatus) {
    if (!station) return;
    setBusy(true);
    const { error } = await supabase.rpc("fn_set_station_status", {
      p_station_id: station.id,
      p_status: status,
    });
    setBusy(false);
    if (error) statusMsg.setError(friendlyError(error));
    else {
      statusMsg.setError(null);
      setStation({ ...station, status });
    }
  }

  // a station runs either Day 1 or Day 2, not both
  const day = station?.day ?? pickedDay;
  const group = groups.find((g) => g.id === groupId) ?? null;
  const fee = station?.entry_cost ?? "?";

  return (
    <div className={cn("gc gc-st", vxDisplay.variable, vxSlab.variable)}>
      <div className="gc-bg" aria-hidden>
        <i className="gc-orb gc-orb-navy" />
        <i className="gc-orb gc-orb-pink" />
      </div>

      <header className="gc-top">
        <p className="gc-eyebrow">{station ? `Day ${station.day} station` : "Station panel"}</p>
        <h1 className="gc-title">{station?.name ?? "No station yet"}</h1>
        <p className="gc-sub">
          <i aria-hidden />
          {station ? (
            station.day === 2 ? (
              <>
                {station.code} · {RISK_TIER_META[tier].label} · <b>Entry −{station.entry_cost}</b>
              </>
            ) : (
              <>
                {station.code}
                {station.purpose && <> · <b>{station.purpose}</b></>}
              </>
            )
          ) : (
            "Ask Admin to assign your station"
          )}
        </p>
      </header>

      <div className="gc-st-msgs">
        {queue.length > 0 && (
          <div className="gc-status gc-status-warn" role="status">
            <b>Offline queue active</b>
            <p>
              {queue.length} submission{queue.length > 1 ? "s" : ""} waiting. Keep this page open;
              they will send when the connection returns.
            </p>
          </div>
        )}
        {failed.length > 0 && (
          <div className="gc-status gc-status-err" role="alert">
            <b>
              {failed.length} queued submission{failed.length > 1 ? "s" : ""} rejected
            </b>
            <p>
              These were sent after reconnecting but the server refused them. They were NOT
              applied. Redo them by hand if still needed.
            </p>
            <ul className="gc-st-failed">
              {failed.map((f) => (
                <li key={f.id}>
                  <span>
                    {f.label}: {f.error}
                  </span>
                  <button type="button" className="gc-btn" onClick={() => dismissFailed(f.id)}>
                    Dismiss
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="gc-st-grid">
        <div className="gc-st-col">
          <section className="gc-card gc-st-card" aria-labelledby="st-group">
            <div className="gc-st-head">
              <h2 id="st-group" className="gc-eyebrow">
                <span className="gc-st-step">01</span> Group
              </h2>
              {group && (
                <span className="gc-chip" data-tone="live">
                  {group.token_balance} token{group.token_balance !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <div className="gc-st-groups" role="radiogroup" aria-label="Active group">
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={groupId === g.id}
                  onClick={() => setGroupId(g.id)}
                >
                  <i className="gc-swatch" style={{ background: groupSwatch(g.id, g.color) }} aria-hidden />
                  <span>{g.name}</span>
                </button>
              ))}
            </div>
            {groups.length === 0 && <p className="gc-muted">Loading groups…</p>}
          </section>

          <section className="gc-card gc-st-card" aria-labelledby="st-result">
            <div className="gc-st-head">
              <h2 id="st-result" className="gc-eyebrow">
                <span className="gc-st-step">02</span> Result
              </h2>
              {station && <span className="gc-chip">Day {station.day}</span>}
            </div>

            {!station && (
              <div className="gc-seg" role="tablist" aria-label="Day">
                {([1, 2] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="tab"
                    aria-selected={pickedDay === d}
                    onClick={() => setPickedDay(d)}
                  >
                    Day {d}
                  </button>
                ))}
              </div>
            )}

            <p className="gc-muted">
              {group ? (
                <>
                  For <b className="gc-st-target">{group.name}</b>.{" "}
                  {day === 1
                    ? "Tokens are added at once."
                    : `${RISK_TIER_META[tier].label}: ${RISK_TIER_META[tier].desc}. Entry −${fee} is charged win or lose; a win grants a random piece the group doesn't own yet.`}
                </>
              ) : (
                "Pick the group at your station first."
              )}
            </p>

            {day === 1 ? (
              <>
                <div className="gc-row2">
                  <button
                    type="button"
                    className="gc-st-award"
                    data-tone="win"
                    disabled={busy || !groupId}
                    onClick={() => day1Reward("win")}
                  >
                    <b>+{day1.win}</b>
                    <span>Win</span>
                  </button>
                  <button
                    type="button"
                    className="gc-st-award"
                    disabled={busy || !groupId}
                    onClick={() => day1Reward("lose")}
                  >
                    <b>+{day1.lose}</b>
                    <span>Participation</span>
                  </button>
                </div>
                <StatusLine error={result.error} notice={result.notice} />
                <button type="button" className="gc-btn gc-st-undo" disabled={busy} onClick={undo}>
                  <Undo2 size={16} aria-hidden />
                  Undo my last transaction
                  <small>2 min window</small>
                </button>
              </>
            ) : (
              <>
                <div className="gc-seg gc-st-outcome" role="group" aria-label="Result">
                  <button type="button" aria-pressed={success} data-tone="ok" onClick={() => setSuccess(true)}>
                    <b>Success</b>
                    <small>Charge + piece</small>
                  </button>
                  <button type="button" aria-pressed={!success} data-tone="bad" onClick={() => setSuccess(false)}>
                    <b>Failed</b>
                    <small>Charge only</small>
                  </button>
                </div>

                {needPicks > 0 && (
                  <div className="gc-field">
                    <span>{needPicks === 2 ? "Pick 2 locations" : "Pick the location"}</span>
                    <div className="gc-seg gc-st-locs" role="group" aria-label="Locations">
                      {PROJECTOR_LOCATIONS.map((loc) => (
                        <button
                          key={loc}
                          type="button"
                          aria-pressed={locations.includes(loc)}
                          onClick={() => toggleLocation(loc)}
                        >
                          {PROJECTOR_LABELS[loc]}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  className="gc-btn gc-btn-primary gc-st-submit"
                  disabled={busy || !station || !groupId}
                  onClick={submitDay2}
                >
                  Submit · −{fee} tokens{success ? " + piece" : ""}
                </button>
                <StatusLine error={result.error} notice={result.notice} />
                {!station && (
                  <p className="gc-status gc-status-err">No station assigned to your account. Ask Admin.</p>
                )}
              </>
            )}
          </section>
        </div>

        <div className="gc-st-col">
          <section className="gc-card gc-st-card gc-st-status" aria-labelledby="st-status">
            <div className="gc-st-head">
              <h2 id="st-status" className="gc-eyebrow">Station status</h2>
            </div>
            {station ? (
              <div className="gc-seg gc-seg-status" role="group" aria-label="Station status">
                {STATUS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    disabled={busy}
                    aria-pressed={station.status === s.value}
                    data-tone={s.tone}
                    onClick={() => setStatus(s.value)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className="gc-muted">
                No station assigned to your account. Ask Admin to set your station.
              </p>
            )}
            <StatusLine error={statusMsg.error} notice={statusMsg.notice} />
          </section>

          <BlindBoxSection />
        </div>
      </div>
    </div>
  );
}

/** This GM's blind boxes (own + the station's shared pool) and the QR a Freshie scans. Same data as BlindBoxCard. */
function BlindBoxSection() {
  const { loaded, error, sellers, copy, copied } = useMyBlindBoxes();
  const left = sellers.reduce((n, s) => n + s.left, 0);
  return (
    <section className="gc-card gc-st-card" aria-labelledby="st-bb">
      <div className="gc-st-head">
        <h2 id="st-bb" className="gc-eyebrow">Blind box</h2>
        {sellers.length > 0 && (
          <span className="gc-chip" data-tone="live">
            {left} left
          </span>
        )}
      </div>
      {error && <p className="gc-status gc-status-err" role="alert">{error}</p>}
      {!loaded ? (
        <p className="gc-muted">Loading…</p>
      ) : sellers.length === 0 ? (
        <p className="gc-muted">No blind boxes yet. When Admin gives you boxes to sell, your QR shows up here.</p>
      ) : (
        sellers.map((s) => (
          <div key={s.id} className="gc-st-bb">
            <p className="gc-st-bb-who">
              {s.station ? `Station ${s.station.name} · shared with its other GMs` : "Your own boxes"}
            </p>
            <ul className="gc-st-bb-types">
              {s.rows.map((r) => (
                <li key={r.id}>
                  <span>
                    <b>
                      {r.type?.name ?? "Box"}
                      {r.type?.is_special && <Sparkles size={13} aria-label="special" />}
                    </b>
                    <small>
                      {r.type ? (r.type.price > 0 ? `${r.type.price} token${r.type.price !== 1 ? "s" : ""}` : "Free") : ""}
                    </small>
                  </span>
                  <span className="gc-num">
                    {Math.max(r.quantity - r.opened, 0)}
                    <small>/{r.quantity}</small>
                  </span>
                </li>
              ))}
            </ul>
            {!s.live ? (
              <p className="gc-status gc-status-err">Switched off by Admin. This code doesn&apos;t work right now.</p>
            ) : s.left <= 0 ? (
              <p className="gc-muted">All boxes sold.</p>
            ) : s.qr ? (
              <div className="gc-st-qr">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.qr.qr} alt="Blind box QR code" />
                <p className="gc-muted">
                  Let a Freshie scan this after your mini-game. Any phone camera works. Each group can buy
                  one box; the code keeps working until all are sold.
                </p>
                <button type="button" className="gc-btn" onClick={() => copy(s.id, s.qr!.url)}>
                  {copied === s.id ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                  {copied === s.id ? "Copied" : "Copy link"}
                </button>
              </div>
            ) : (
              <p className="gc-muted">Loading QR…</p>
            )}
          </div>
        ))
      )}
    </section>
  );
}
