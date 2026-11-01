"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { groupColor } from "@/components/freshie/groupTheme";
import { useProjectorPlaces } from "@/components/useConfig";
import { loadProjectorStates, type ProjectorState } from "@/lib/projectorStates";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PROJECTOR_LOCATIONS, type ProjectorLocation } from "@/lib/types";
import { friendlyError } from "@/lib/utils";

import "./funfair-light.css";

export interface LightGroup { id: number; name: string; color: string | null }

// Funfair backup, Admin and HOGM (fn_game_lead_light_projector, migration
// 0105): pick a group and light one of the three keys for it. No card tap, no
// Guardian check, no Day 2 Funfair switch. A key is lit by one group and a
// group lights one key; only Admin can take a key over (`canReplace`).
// Admin's Game master passes the group it already has selected; HOGM's tab
// passes `onPick` to get its own group chips.
export function FunfairLightGroup({
  groups,
  groupId,
  onPick,
  canReplace,
  onError,
  onNotice,
}: {
  groups: LightGroup[];
  groupId: number | null;
  onPick?: (id: number) => void;
  canReplace: boolean;
  onError: (m: string | null) => void;
  onNotice: (m: string) => void;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const places = useProjectorPlaces();
  const [states, setStates] = useState<ProjectorState[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const s = await loadProjectorStates(supabase);
    if (s) setStates(s);
  }, [supabase]);
  useEffect(() => {
    void load();
    const i = setInterval(load, 10_000);
    return () => clearInterval(i);
  }, [load]);

  const group = groups.find((g) => g.id === groupId) ?? null;
  const nameOf = (id: number | null) => groups.find((g) => g.id === id)?.name ?? (id ? `Group ${id}` : null);
  // The key this group already lit, if any.
  const own = group ? states?.find((s) => s.activated_by_group === group.id) : undefined;

  // Admin only (fn_admin_reset_all_projectors, 0106): no key lit by any group.
  async function resetAll() {
    const n = states?.filter((s) => s.activated_at).length ?? 0;
    if (!window.confirm(`Reset the funfair? ${n} lit key${n === 1 ? "" : "s"} go dark and no group keeps one. Zone overrides stay as they are.`)) return;
    setBusy(true);
    onError(null);
    const { error } = await supabase.rpc("fn_admin_reset_all_projectors");
    setBusy(false);
    if (error) return onError(friendlyError(error));
    onNotice("Funfair reset: no key is lit");
    void load();
  }

  async function light(loc: ProjectorLocation, replace: boolean) {
    if (!group) return;
    const key = places[loc].name;
    const msg = replace
      ? `Take over ${key} for ${group.name}? It is cleared first${own ? `, and so is ${places[own.location].name}` : ""}.`
      : `Light ${key} for ${group.name}?`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    onError(null);
    const { error } = await supabase.rpc("fn_game_lead_light_projector", { p_location: loc, p_group_id: group.id, p_replace: replace });
    setBusy(false);
    if (error) return onError(friendlyError(error));
    onNotice(`${key} lit for ${group.name}`);
    void load();
  }

  return (
    <div className="fl">
      <div className="fl-head">
        <b>Light a Key for a Group</b>
        <span>{group ? group.name : "Pick a group"} · no card tap or Guardian check</span>
        {canReplace && (
          <button type="button" className="fl-btn fl-reset" data-kind="warn" disabled={busy || !states?.some((s) => s.activated_at)} onClick={() => void resetAll()}>
            Reset All Keys
          </button>
        )}
      </div>
      {onPick && (
        <div className="fl-pick" role="group" aria-label="Group">
          {groups.map((g) => (
            <button key={g.id} type="button" style={{ ["--c" as string]: groupColor(g.color) }} aria-pressed={g.id === groupId} onClick={() => onPick(g.id)}>
              <i />
              {g.name.replace(/^Group\s+/i, "")}
            </button>
          ))}
        </div>
      )}
      <div className="fl-keys">
        {PROJECTOR_LOCATIONS.map((loc) => {
          const st = states?.find((s) => s.location === loc);
          const lit = !!st?.activated_at;
          const by = st?.activated_by_group ?? null;
          const mine = !!group && by === group.id;
          const blockedByOwn = !lit && !!group && !!own && own.location !== loc;
          return (
            <div key={loc} className="fl-key" data-lit={lit}>
              <h5>
                {places[loc].name}
                <span className="fl-state">{lit ? "LIT" : "DARK"}</span>
              </h5>
              <p className="fl-who">
                {lit ? (by ? `Lit by ${nameOf(by)}` : "Lit") : blockedByOwn ? `${group!.name} already lit ${places[own!.location].name}` : "Not lit yet"}
              </p>
              {mine ? (
                <button type="button" className="fl-btn" disabled>Lit by This Group</button>
              ) : lit || blockedByOwn ? (
                canReplace ? (
                  <button type="button" className="fl-btn" data-kind="warn" disabled={busy || !group} onClick={() => void light(loc, true)}>
                    Take Over for {group?.name ?? "group"}
                  </button>
                ) : (
                  <button type="button" className="fl-btn" disabled>{lit ? "Already Lit" : "Group Has a Key"}</button>
                )
              ) : (
                <button type="button" className="fl-btn" data-kind="go" disabled={busy || !group || !states} onClick={() => void light(loc, false)}>
                  Light for {group?.name ?? "group"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="fl-note">
        A key is lit by one group, and a group lights one key.
        {canReplace ? " Take over clears the key and the group's other key first." : " Admin can take a key over."}
      </p>
    </div>
  );
}
